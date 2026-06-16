"""Calendar platform: each Hakanban board is exposed as a calendar entity.

Every card that has a due date surfaces as an event on its board's calendar, so
dated tasks show up in Home Assistant's Calendar panel / dashboard card and can be
queried by Assist or used to trigger automations — all reading the same board data
the panel shows (no sync layer). Like the todo entities, these are thin views over
:class:`HakanbanData`.
"""

from __future__ import annotations

from datetime import date, datetime, timedelta
from typing import Any

from homeassistant.components.calendar import CalendarEntity, CalendarEvent
from homeassistant.config_entries import ConfigEntry
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.device_registry import DeviceEntryType, DeviceInfo
from homeassistant.helpers.dispatcher import async_dispatcher_connect
from homeassistant.helpers.entity_platform import AddEntitiesCallback
from homeassistant.util import dt as dt_util

from .const import DATA_MANAGER, DOMAIN, SIGNAL_BOARDS_UPDATED
from .data import HakanbanData
from .todo import _parse_due

# Default visible duration for a card whose due date carries a time of day.
_TIMED_EVENT_DURATION = timedelta(hours=1)


async def async_setup_entry(
    hass: HomeAssistant,
    entry: ConfigEntry,
    async_add_entities: AddEntitiesCallback,
) -> None:
    """Create one calendar entity per board and keep the set in sync."""
    manager: HakanbanData = hass.data[DOMAIN][DATA_MANAGER]
    known: dict[str, HakanbanCalendarEntity] = {}

    @callback
    def _sync(_board_id: str | None = None) -> None:
        current = {bid for bid, b in manager.boards.items() if not b.get("archived")}
        new_entities: list[HakanbanCalendarEntity] = []
        for board_id in current:
            if board_id not in known:
                entity = HakanbanCalendarEntity(manager, board_id)
                known[board_id] = entity
                new_entities.append(entity)
        if new_entities:
            async_add_entities(new_entities)
        for board_id in list(known):
            if board_id not in current:
                entity = known.pop(board_id)
                hass.async_create_task(entity.async_remove(force_remove=True))

    entry.async_on_unload(async_dispatcher_connect(hass, SIGNAL_BOARDS_UPDATED, _sync))
    _sync()


def _as_datetime(value: date | datetime) -> datetime:
    """Coerce an all-day ``date`` to a tz-aware datetime at local midnight."""
    if isinstance(value, datetime):
        return value
    return datetime.combine(value, datetime.min.time(), tzinfo=dt_util.DEFAULT_TIME_ZONE)


class HakanbanCalendarEntity(CalendarEntity):
    """A calendar backed by one Hakanban board's dated cards."""

    _attr_has_entity_name = True
    _attr_should_poll = False
    _attr_name = "Calendar"

    def __init__(self, manager: HakanbanData, board_id: str) -> None:
        self._manager = manager
        self._board_id = board_id
        self._attr_unique_id = f"{board_id}_calendar"
        self._refresh()

    # --------------------------------------------------------------- helpers
    def _refresh(self) -> None:
        board = self._manager.boards.get(self._board_id, {})
        self._attr_device_info = DeviceInfo(
            identifiers={(DOMAIN, self._board_id)},
            name=board.get("title", "Hakanban"),
            manufacturer="Hakanban",
            model="Board",
            entry_type=DeviceEntryType.SERVICE,
        )

    @staticmethod
    def _card_event(card: dict[str, Any]) -> CalendarEvent | None:
        """Build a calendar event for a card, or ``None`` if it has no due date."""
        due = _parse_due(card.get("due"))
        if due is None:
            return None
        if isinstance(due, datetime):
            start: date | datetime = due
            end: date | datetime = due + _TIMED_EVENT_DURATION
        else:  # date-only due -> all-day event spanning that day
            start = due
            end = due + timedelta(days=1)
        return CalendarEvent(
            start=start,
            end=end,
            summary=f"#{card['number']} {card['title']}",
            description=card.get("description") or None,
            uid=card["id"],
        )

    def _events(self) -> list[CalendarEvent]:
        events: list[CalendarEvent] = []
        for card in self._manager.cards_in_board(self._board_id):
            event = self._card_event(card)
            if event is not None:
                events.append(event)
        return events

    # ----------------------------------------------------------------- state
    @property
    def event(self) -> CalendarEvent | None:
        """The current or next upcoming dated card (drives the entity state)."""
        now = dt_util.now()
        upcoming: CalendarEvent | None = None
        for event in self._events():
            if _as_datetime(event.end) < now:
                continue
            if upcoming is None or _as_datetime(event.start) < _as_datetime(upcoming.start):
                upcoming = event
        return upcoming

    async def async_get_events(
        self, hass: HomeAssistant, start_date: datetime, end_date: datetime
    ) -> list[CalendarEvent]:
        """Return every dated card overlapping the requested window."""
        return [
            event
            for event in self._events()
            if _as_datetime(event.start) < end_date and _as_datetime(event.end) > start_date
        ]

    @callback
    def _handle_update(self, _board_id: str | None = None) -> None:
        self._refresh()
        self.async_write_ha_state()

    async def async_added_to_hass(self) -> None:
        self.async_on_remove(
            async_dispatcher_connect(self.hass, SIGNAL_BOARDS_UPDATED, self._handle_update)
        )
