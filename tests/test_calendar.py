"""Verification for the calendar platform's event logic.

Home Assistant isn't a test dependency, so we stub the slice of its API that
calendar.py / todo.py / data.py import — including a faithful ``CalendarEvent``
that validates start/end the way HA does — then import the *real* calendar module
and exercise event building, the ``event`` state property and ``async_get_events``.

This catches import errors (e.g. a wrong symbol from homeassistant.components.calendar)
and invalid events (naive datetimes, start > end) without a running HA.

Run:  python3 tests/test_calendar.py
"""

import asyncio
import datetime
import enum
import importlib.util
import os
import sys
import types

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_DIR = os.path.join(REPO, "custom_components", "hakanban")

NOW = datetime.datetime(2026, 6, 16, 12, 0, 0, tzinfo=datetime.timezone.utc)


# --------------------------------------------------------------------- HA stubs
class _CalendarEvent:
    """Mirror of homeassistant.components.calendar.CalendarEvent validation."""

    def __init__(self, start, end, summary, description=None, location=None, uid=None,
                 recurrence_id=None, rrule=None):
        # datetime is a subclass of date, so test datetime first.
        if isinstance(start, datetime.datetime) or isinstance(end, datetime.datetime):
            if not (isinstance(start, datetime.datetime) and isinstance(end, datetime.datetime)):
                raise ValueError("start and end must both be date or both be datetime")
            if start.tzinfo is None or end.tzinfo is None:
                raise ValueError("Datetime must be timezone aware")
        if start > end:
            raise ValueError("Start must be before or equal to end")
        self.start = start
        self.end = end
        self.summary = summary
        self.description = description
        self.location = location
        self.uid = uid


def _stub_homeassistant():
    ha = types.ModuleType("homeassistant")

    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = type("HomeAssistant", (), {})
    core.callback = lambda f: f

    config_entries = types.ModuleType("homeassistant.config_entries")
    config_entries.ConfigEntry = type("ConfigEntry", (), {})

    helpers = types.ModuleType("homeassistant.helpers")
    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = type("Store", (), {})
    dispatcher = types.ModuleType("homeassistant.helpers.dispatcher")
    dispatcher.async_dispatcher_send = lambda *a, **k: None
    dispatcher.async_dispatcher_connect = lambda *a, **k: (lambda: None)

    device_registry = types.ModuleType("homeassistant.helpers.device_registry")
    device_registry.DeviceInfo = lambda **kw: kw

    class _DeviceEntryType(enum.Enum):
        SERVICE = "service"

    device_registry.DeviceEntryType = _DeviceEntryType
    entity_platform = types.ModuleType("homeassistant.helpers.entity_platform")
    entity_platform.AddEntitiesCallback = object

    util = types.ModuleType("homeassistant.util")
    dt = types.ModuleType("homeassistant.util.dt")
    dt.utcnow = lambda: NOW
    dt.now = lambda: NOW
    dt.DEFAULT_TIME_ZONE = datetime.timezone.utc
    uuid_mod = types.ModuleType("homeassistant.util.uuid")
    counter = {"n": 0}

    def _rid():
        counter["n"] += 1
        return f"id{counter['n']:04d}"

    uuid_mod.random_uuid_hex = _rid

    components = types.ModuleType("homeassistant.components")
    calendar_comp = types.ModuleType("homeassistant.components.calendar")
    calendar_comp.CalendarEntity = type(
        "CalendarEntity",
        (),
        {
            "async_on_remove": lambda self, f: None,
            "async_write_ha_state": lambda self: None,
            "unique_id": property(lambda self: getattr(self, "_attr_unique_id", None)),
            "name": property(lambda self: getattr(self, "_attr_name", None)),
        },
    )
    calendar_comp.CalendarEvent = _CalendarEvent

    todo_comp = types.ModuleType("homeassistant.components.todo")

    class _TodoItemStatus(enum.Enum):
        NEEDS_ACTION = "needs_action"
        COMPLETED = "completed"

    class _TodoListEntityFeature(enum.IntFlag):
        CREATE_TODO_ITEM = 1
        UPDATE_TODO_ITEM = 2
        DELETE_TODO_ITEM = 4
        MOVE_TODO_ITEM = 8
        SET_DUE_DATE_ON_ITEM = 16
        SET_DUE_DATETIME_ON_ITEM = 32
        SET_DESCRIPTION_ON_ITEM = 64

    todo_comp.TodoItem = lambda **kw: kw
    todo_comp.TodoItemStatus = _TodoItemStatus
    todo_comp.TodoListEntity = type("TodoListEntity", (), {})
    todo_comp.TodoListEntityFeature = _TodoListEntityFeature

    for name, mod in {
        "homeassistant": ha,
        "homeassistant.core": core,
        "homeassistant.config_entries": config_entries,
        "homeassistant.helpers": helpers,
        "homeassistant.helpers.storage": storage,
        "homeassistant.helpers.dispatcher": dispatcher,
        "homeassistant.helpers.device_registry": device_registry,
        "homeassistant.helpers.entity_platform": entity_platform,
        "homeassistant.util": util,
        "homeassistant.util.dt": dt,
        "homeassistant.util.uuid": uuid_mod,
        "homeassistant.components": components,
        "homeassistant.components.calendar": calendar_comp,
        "homeassistant.components.todo": todo_comp,
    }.items():
        sys.modules[name] = mod


def _load_module(pkg, name):
    spec = importlib.util.spec_from_file_location(
        f"{pkg}.{name}", os.path.join(PKG_DIR, f"{name}.py")
    )
    mod = importlib.util.module_from_spec(spec)
    sys.modules[f"{pkg}.{name}"] = mod
    spec.loader.exec_module(mod)
    return mod


class FakeStore:
    def __init__(self):
        self.saved = 0

    async def async_load(self):
        return {"boards": {}, "cards": {}}

    def async_schedule_save(self, data):
        self.saved += 1

    async def async_save(self, data):
        self.saved += 1


class FakeBus:
    def async_fire(self, event_type, data=None):
        pass


class FakeHass:
    def __init__(self):
        self.bus = FakeBus()


# ------------------------------------------------------------------------ tests
RESULTS = []


def check(name, cond):
    RESULTS.append((name, bool(cond)))
    print(("PASS" if cond else "FAIL"), "-", name)


def run():
    _stub_homeassistant()
    _load_module("hkpkg", "const")
    _load_module("hkpkg", "store")
    data = _load_module("hkpkg", "data")
    _load_module("hkpkg", "todo")
    # Importing the module at all proves the platform's imports are valid.
    cal = _load_module("hkpkg", "calendar")
    check("calendar module imports cleanly", hasattr(cal, "HakanbanCalendarEntity"))

    mgr = data.HakanbanData(FakeHass(), FakeStore())
    board = mgr.create_board("Test", seed=True)
    bid = board["id"]
    col = board["columns"][0]["id"]

    # No due date -> no event.
    plain = mgr.create_card(bid, col, "No date")
    check("undated card -> no event", cal.HakanbanCalendarEntity._card_event(plain) is None)

    # Date-only due -> all-day event spanning that day.
    d_card = mgr.create_card(bid, col, "All day", due="2026-06-18")
    d_ev = cal.HakanbanCalendarEntity._card_event(d_card)
    check("date due -> all-day event",
          d_ev is not None
          and d_ev.start == datetime.date(2026, 6, 18)
          and d_ev.end == datetime.date(2026, 6, 19))
    check("event summary carries number + title", d_ev.summary == f"#{d_card['number']} All day")

    # Datetime due -> tz-aware 1-hour block.
    t_card = mgr.create_card(bid, col, "Timed", due="2026-06-20T09:30:00")
    t_ev = cal.HakanbanCalendarEntity._card_event(t_card)
    check("timed due -> tz-aware block",
          isinstance(t_ev.start, datetime.datetime)
          and t_ev.start.tzinfo is not None
          and (t_ev.end - t_ev.start) == datetime.timedelta(hours=1))

    # A past-dated card (its event already ended before "now").
    mgr.create_card(bid, col, "Past", due="2026-06-15T10:00:00")
    # The earliest upcoming card (before the 06-18 all-day and the 06-20 timed one).
    soon = mgr.create_card(bid, col, "Soon", due="2026-06-17T09:00:00")

    entity = cal.HakanbanCalendarEntity(mgr, bid)
    check("entity unique_id", entity.unique_id == f"{bid}_calendar")

    # event property -> earliest non-past upcoming event (the 06-17 "Soon" card),
    # skipping the past 06-15 card.
    nxt = entity.event
    check("event property picks soonest upcoming", nxt is not None and nxt.uid == soon["id"])

    # async_get_events over a window only returns overlapping events.
    window = asyncio.run(entity.async_get_events(
        FakeHass(),
        datetime.datetime(2026, 6, 17, tzinfo=datetime.timezone.utc),
        datetime.datetime(2026, 6, 19, tzinfo=datetime.timezone.utc),
    ))
    uids = {e.uid for e in window}
    check("get_events returns only in-window cards",
          soon["id"] in uids and d_card["id"] in uids and t_card["id"] not in uids)

    failed = [n for n, ok in RESULTS if not ok]
    print()
    print(f"{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(run())
