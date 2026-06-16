"""Persistent storage for Hakanban.

The whole board model (boards, columns, cards, labels, checklists, comments) is the
single source of truth and lives in one JSON document at ``.storage/hakanban.json``.
The todo entities and the websocket API are thin views over this document.
"""

from __future__ import annotations

from typing import Any

from homeassistant.core import HomeAssistant
from homeassistant.helpers.storage import Store

from .const import SAVE_DELAY, STORAGE_KEY, STORAGE_VERSION


def empty_data() -> dict[str, Any]:
    """Return a fresh, empty store document."""
    return {"boards": {}, "cards": {}}


async def _async_migrate(
    old_major_version: int, old_minor_version: int, old_data: dict[str, Any]
) -> dict[str, Any]:
    """Migrate stored data to the current schema.

    Only version 1 exists today; this hook is here so future schema changes
    (e.g. adding swimlanes) don't require a destructive reset.
    """
    return old_data


class HakanbanStore:
    """Debounced JSON store wrapper."""

    def __init__(self, hass: HomeAssistant) -> None:
        self._store: Store[dict[str, Any]] = Store(
            hass,
            STORAGE_VERSION,
            STORAGE_KEY,
            atomic_writes=True,
            minor_version=1,
        )

    async def async_load(self) -> dict[str, Any]:
        """Load the document, returning an empty one on first run."""
        data = await self._store.async_load()
        if not data:
            return empty_data()
        # Defensive: ensure both top-level keys exist.
        data.setdefault("boards", {})
        data.setdefault("cards", {})
        return data

    def async_schedule_save(self, data: dict[str, Any]) -> None:
        """Schedule a debounced save of the full document."""
        self._store.async_delay_save(lambda: data, SAVE_DELAY)

    async def async_save(self, data: dict[str, Any]) -> None:
        """Write immediately (used on unload)."""
        await self._store.async_save(data)
