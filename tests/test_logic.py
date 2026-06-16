"""Standalone logic tests for HakanbanData.

Home Assistant isn't a dependency of the test runner, so we stub the thin slice of
its API that data.py / store.py import, then exercise the *real* manager code for the
risky bits: ordering, moves across columns, bulk paste, completion events, deletes.

Run:  python3 tests/test_logic.py
"""

import datetime
import importlib.util
import os
import sys
import types

REPO = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PKG_DIR = os.path.join(REPO, "custom_components", "hakanban")


# --------------------------------------------------------------------- HA stubs
def _stub_homeassistant():
    ha = types.ModuleType("homeassistant")

    core = types.ModuleType("homeassistant.core")
    core.HomeAssistant = type("HomeAssistant", (), {})
    core.callback = lambda f: f

    helpers = types.ModuleType("homeassistant.helpers")
    storage = types.ModuleType("homeassistant.helpers.storage")
    storage.Store = type("Store", (), {})
    dispatcher = types.ModuleType("homeassistant.helpers.dispatcher")
    dispatcher.async_dispatcher_send = lambda *a, **k: None

    util = types.ModuleType("homeassistant.util")
    dt = types.ModuleType("homeassistant.util.dt")
    dt.utcnow = lambda: datetime.datetime(2026, 6, 16, 12, 0, 0, tzinfo=datetime.timezone.utc)
    dt.DEFAULT_TIME_ZONE = datetime.timezone.utc
    uuid_mod = types.ModuleType("homeassistant.util.uuid")
    counter = {"n": 0}

    def _rid():
        counter["n"] += 1
        return f"id{counter['n']:04d}"

    uuid_mod.random_uuid_hex = _rid

    for name, mod in {
        "homeassistant": ha,
        "homeassistant.core": core,
        "homeassistant.helpers": helpers,
        "homeassistant.helpers.storage": storage,
        "homeassistant.helpers.dispatcher": dispatcher,
        "homeassistant.util": util,
        "homeassistant.util.dt": dt,
        "homeassistant.util.uuid": uuid_mod,
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
    """Stands in for HakanbanStore: keeps the doc in memory."""

    def __init__(self):
        self.saved = 0

    async def async_load(self):
        return {"boards": {}, "cards": {}}

    def async_schedule_save(self, data):
        self.saved += 1

    async def async_save(self, data):
        self.saved += 1


class FakeBus:
    def __init__(self):
        self.events = []

    def async_fire(self, event_type, data=None):
        self.events.append((event_type, data or {}))


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

    hass = FakeHass()
    mgr = data.HakanbanData(hass, FakeStore())

    # Seed a board with 3 columns (mirrors async_load's first-run seed).
    board = mgr.create_board("Test", seed=True)
    bid = board["id"]
    cols = board["columns"]
    check("board seeded with 3 columns", len(cols) == 3)
    todo, doing, done = cols[0]["id"], cols[1]["id"], cols[2]["id"]

    # Create cards; numbers increment; order is sparse + ascending.
    c1 = mgr.create_card(bid, todo, "A")
    c2 = mgr.create_card(bid, todo, "B")
    c3 = mgr.create_card(bid, todo, "C")
    check("card numbers increment", (c1["number"], c2["number"], c3["number"]) == (1, 2, 3))
    ordered = [c["id"] for c in mgr.cards_in_column(todo)]
    check("cards ordered by insertion", ordered == [c1["id"], c2["id"], c3["id"]])

    # Move C to front of 'todo'.
    mgr.move_card(c3["id"], todo, position=0)
    ordered = [c["id"] for c in mgr.cards_in_column(todo)]
    check("move within column to front", ordered == [c3["id"], c1["id"], c2["id"]])

    # Move A to 'doing' at end; it leaves 'todo'.
    mgr.move_card(c1["id"], doing, position=99)
    check("card left source column", c1["id"] not in [c["id"] for c in mgr.cards_in_column(todo)])
    check("card entered target column", [c["id"] for c in mgr.cards_in_column(doing)] == [c1["id"]])
    check("moved card column_id updated", mgr.cards[c1["id"]]["column_id"] == doing)

    # Move event fired with from/to.
    moved = [e for e in hass.bus.events if e[0] == "hakanban_card_moved"]
    check("move fired event with from/to",
          moved and moved[-1][1]["from_column"] == todo and moved[-1][1]["to_column"] == doing)

    # Bulk paste: 3 non-empty lines among blanks -> 3 cards, ordered.
    pasted = mgr.create_cards_bulk(bid, done, ["X", "  ", "Y", "", "Z"])
    check("bulk paste skips blanks", len(pasted) == 3)
    check("bulk paste order preserved",
          [c["title"] for c in mgr.cards_in_column(done)] == ["X", "Y", "Z"])

    # Completion fires the completed event and stamps completed.
    before = len([e for e in hass.bus.events if e[0] == "hakanban_card_completed"])
    mgr.update_card(c2["id"], status="completed")
    after = len([e for e in hass.bus.events if e[0] == "hakanban_card_completed"])
    check("completing a card fires completed event", after == before + 1)
    check("completed timestamp stamped", "completed" in mgr.cards[c2["id"]])

    # Labels: default palette present; toggle + delete cleans card refs.
    check("default label palette seeded", len(board["label_defs"]) == 6)
    lbl = mgr.create_label(bid, "Bug", "#eb5a46")
    mgr.update_card(c2["id"], labels=[lbl["id"]])
    mgr.delete_label(bid, lbl["id"])
    check("deleting a label removes it from cards", lbl["id"] not in mgr.cards[c2["id"]]["labels"])

    # Column reorder.
    mgr.move_column(bid, done, 0)
    new_order = [c["id"] for c in sorted(board["columns"], key=lambda c: c["order"])]
    check("column reorder puts 'done' first", new_order[0] == done)

    # Delete a card fires event and drops it.
    mgr.delete_card(c1["id"])
    check("card deleted", c1["id"] not in mgr.cards)

    # board_payload nests cards under columns, archived excluded.
    payload = mgr.board_payload(bid)
    check("payload has columns with nested cards",
          all("cards" in col for col in payload["columns"]))

    # full_payload returns the board.
    full = mgr.full_payload()
    check("full_payload returns board", any(b["id"] == bid for b in full["boards"]))

    failed = [n for n, ok in RESULTS if not ok]
    print()
    print(f"{len(RESULTS) - len(failed)}/{len(RESULTS)} checks passed")
    return 0 if not failed else 1


if __name__ == "__main__":
    sys.exit(run())
