"""Frontend wiring: serve the bundled assets, register the sidebar panel, and
auto-load the Lovelace card so users don't have to add a resource by hand."""

from __future__ import annotations

import logging
import os

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant
from homeassistant.loader import async_get_integration
from homeassistant.setup import async_when_setup

from .const import (
    CARD_JS_FILENAME,
    DOMAIN,
    PANEL_ICON,
    PANEL_JS_FILENAME,
    PANEL_TITLE,
    PANEL_URL_PATH,
    STATIC_URL_BASE,
)

_LOGGER = logging.getLogger(__name__)

_FRONTEND_READY = f"{DOMAIN}_frontend_ready"

CARD_URL = f"{STATIC_URL_BASE}/{CARD_JS_FILENAME}"


async def _async_card_url(hass: HomeAssistant) -> str:
    """Card URL carrying the integration version so upgrades bust caches."""
    try:
        integration = await async_get_integration(hass, DOMAIN)
        version = integration.version
    except Exception:  # noqa: BLE001 - the version is cosmetic, never fail setup
        version = None
    return f"{CARD_URL}?v={version}" if version else CARD_URL


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Register static paths, the Lovelace card resource, and the sidebar panel."""
    static_dir = os.path.join(os.path.dirname(__file__), "static")
    card_url = await _async_card_url(hass)

    # Register static assets + the global card module exactly once per HA run.
    if not hass.data.get(_FRONTEND_READY):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL_BASE, static_dir, cache_headers=False)]
        )
        # Covers YAML-mode dashboards and puts the card in the picker.
        frontend.add_extra_js_url(hass, card_url)
        hass.data[_FRONTEND_READY] = True

    # add_extra_js_url only injects a script tag into index.html. Storage-mode
    # dashboards load their modules from the Lovelace resource collection
    # instead, so any client still holding a cached index never learns about
    # the card and renders "Configuration error". Register there as well.
    # Lovelace is not a manifest dependency and may not be set up yet, so
    # defer rather than silently skipping, which would leave the resource
    # unregistered until the next restart with favourable ordering.
    if hass.data.get("lovelace") is not None:
        await _async_register_card_resource(hass, card_url)
    else:

        async def _on_lovelace_ready(_hass: HomeAssistant, _component: str) -> None:
            await _async_register_card_resource(_hass, card_url)

        async_when_setup(hass, "lovelace", _on_lovelace_ready)

    # Register the full-page sidebar panel (idempotent — remove first if present).
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
    await panel_custom.async_register_panel(
        hass,
        frontend_url_path=PANEL_URL_PATH,
        webcomponent_name="hakanban-panel",
        module_url=f"{STATIC_URL_BASE}/{PANEL_JS_FILENAME}",
        sidebar_title=PANEL_TITLE,
        sidebar_icon=PANEL_ICON,
        require_admin=False,
        embed_iframe=False,
        trust_external=False,
    )


async def _async_register_card_resource(hass: HomeAssistant, card_url: str) -> None:
    """Add or update the card's entry in the Lovelace resource collection.

    Best effort by design: a dashboard resource is never worth failing setup
    over, and YAML-mode Lovelace has no storage collection to write to.
    """
    try:
        resources = getattr(hass.data.get("lovelace"), "resources", None)
        if resources is None:
            # YAML mode: the user declares resources themselves.
            return
        if not resources.loaded:
            await resources.async_load()
        for item in resources.async_items():
            if str(item.get("url", "")).split("?")[0] != CARD_URL:
                continue
            if item.get("url") == card_url:
                return
            await resources.async_update_item(
                item["id"], {"res_type": "module", "url": card_url}
            )
            _LOGGER.debug("Updated Lovelace resource to %s", card_url)
            return
        await resources.async_create_item({"res_type": "module", "url": card_url})
        _LOGGER.debug("Registered Lovelace resource %s", card_url)
    except Exception:  # noqa: BLE001 - best effort, see docstring
        _LOGGER.debug("Lovelace resource registration skipped", exc_info=True)


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar panel on unload."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
