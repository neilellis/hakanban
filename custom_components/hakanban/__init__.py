"""The Hakanban integration — a Trello-style Kanban board native to Home Assistant."""

from __future__ import annotations

from homeassistant.config_entries import ConfigEntry
from homeassistant.const import Platform
from homeassistant.core import HomeAssistant

from .const import DATA_MANAGER, DOMAIN
from .data import HakanbanData
from .frontend import async_register_frontend, async_unregister_panel
from .services import async_setup_services, async_unload_services
from .store import HakanbanStore
from .websocket_api import async_register_websocket_api

PLATFORMS: list[Platform] = [Platform.TODO]


async def async_setup_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Set up Hakanban from a config entry."""
    store = HakanbanStore(hass)
    manager = HakanbanData(hass, store)
    await manager.async_load()

    domain_data = hass.data.setdefault(DOMAIN, {})
    domain_data[DATA_MANAGER] = manager

    # Websocket API (panel + Lovelace card talk to this).
    async_register_websocket_api(hass)
    # hakanban.* services for automations / scripts / Assist.
    await async_setup_services(hass)
    # Static assets + sidebar panel + auto-loaded Lovelace card.
    await async_register_frontend(hass)

    # Each column becomes a todo entity grouped under its board device.
    await hass.config_entries.async_forward_entry_setups(entry, PLATFORMS)
    return True


async def async_unload_entry(hass: HomeAssistant, entry: ConfigEntry) -> bool:
    """Unload a config entry."""
    unload_ok = await hass.config_entries.async_unload_platforms(entry, PLATFORMS)
    if unload_ok:
        async_unregister_panel(hass)
        async_unload_services(hass)
        manager: HakanbanData = hass.data[DOMAIN][DATA_MANAGER]
        await manager.async_save_now()
        hass.data.pop(DOMAIN, None)
    return unload_ok
