"""Frontend wiring: serve the bundled assets, register the sidebar panel, and
auto-load the Lovelace card so users don't have to add a resource by hand."""

from __future__ import annotations

import logging
import os

from homeassistant.components import frontend, panel_custom
from homeassistant.components.http import StaticPathConfig
from homeassistant.core import HomeAssistant

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


async def async_register_frontend(hass: HomeAssistant) -> None:
    """Register static paths, the Lovelace card resource, and the sidebar panel."""
    static_dir = os.path.join(os.path.dirname(__file__), "static")

    # Register static assets + the global card module exactly once per HA run.
    if not hass.data.get(_FRONTEND_READY):
        await hass.http.async_register_static_paths(
            [StaticPathConfig(STATIC_URL_BASE, static_dir, cache_headers=False)]
        )
        # Auto-load the Lovelace card everywhere so `type: custom:hakanban-card`
        # works without the user manually registering a dashboard resource.
        frontend.add_extra_js_url(hass, f"{STATIC_URL_BASE}/{CARD_JS_FILENAME}")
        hass.data[_FRONTEND_READY] = True

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


def async_unregister_panel(hass: HomeAssistant) -> None:
    """Remove the sidebar panel on unload."""
    frontend.async_remove_panel(hass, PANEL_URL_PATH)
