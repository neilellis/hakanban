"""WebSocket API for the Hakanban panel and Lovelace card.

Mutations return the affected object; live state propagation to every connected client
happens through the ``hakanban/subscribe`` stream (each change pushes the full payload).
"""

from __future__ import annotations

from typing import Any, Callable

import voluptuous as vol

from homeassistant.components import websocket_api
from homeassistant.core import HomeAssistant, callback
from homeassistant.helpers.dispatcher import async_dispatcher_connect

from .const import DATA_MANAGER, DOMAIN, SIGNAL_BOARDS_UPDATED
from .data import HakanbanData, HakanbanError


def _manager(hass: HomeAssistant) -> HakanbanData:
    return hass.data[DOMAIN][DATA_MANAGER]


def _guard(
    handler: Callable[[HomeAssistant, Any, dict[str, Any], HakanbanData], Any],
) -> Callable[[HomeAssistant, Any, dict[str, Any]], None]:
    """Wrap a handler: inject the manager and turn HakanbanError into a WS error."""

    @callback
    def wrapper(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
        try:
            result = handler(hass, connection, msg, _manager(hass))
        except HakanbanError as err:
            connection.send_error(msg["id"], "invalid_request", str(err))
            return
        connection.send_result(msg["id"], result)

    return wrapper


def async_register_websocket_api(hass: HomeAssistant) -> None:
    """Register every hakanban/* websocket command (idempotent)."""
    if hass.data.get(f"{DOMAIN}_ws_registered"):
        return
    hass.data[f"{DOMAIN}_ws_registered"] = True
    for command in _COMMANDS:
        websocket_api.async_register_command(hass, command)


# --------------------------------------------------------------------- subscribe
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/subscribe"})
@callback
def ws_subscribe(hass: HomeAssistant, connection: Any, msg: dict[str, Any]) -> None:
    manager = _manager(hass)

    @callback
    def _forward(_board_id: str | None = None) -> None:
        connection.send_message(
            websocket_api.event_message(msg["id"], manager.full_payload())
        )

    connection.subscriptions[msg["id"]] = async_dispatcher_connect(
        hass, SIGNAL_BOARDS_UPDATED, _forward
    )
    connection.send_result(msg["id"])
    _forward()


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/get"})
@_guard
def ws_get(hass, connection, msg, manager: HakanbanData):
    return manager.full_payload()


# ------------------------------------------------------------------- undo/redo
@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/undo"})
@_guard
def ws_undo(hass, connection, msg, manager: HakanbanData):
    manager.undo()
    return {"can_undo": manager.can_undo, "can_redo": manager.can_redo}


@websocket_api.websocket_command({vol.Required("type"): f"{DOMAIN}/redo"})
@_guard
def ws_redo(hass, connection, msg, manager: HakanbanData):
    manager.redo()
    return {"can_undo": manager.can_undo, "can_redo": manager.can_redo}


# ------------------------------------------------------------------------ boards
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/create_board",
        vol.Required("title"): str,
        vol.Optional("background"): vol.Any(str, None),
    }
)
@_guard
def ws_create_board(hass, connection, msg, manager: HakanbanData):
    return manager.create_board(msg["title"], msg.get("background"))


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/update_board",
        vol.Required("board_id"): str,
        vol.Optional("title"): str,
        vol.Optional("background"): vol.Any(str, None),
        vol.Optional("archived"): bool,
    }
)
@_guard
def ws_update_board(hass, connection, msg, manager: HakanbanData):
    # Only forward keys the client actually sent, so an absent `background`
    # isn't conflated with an explicit `null` (which clears the background).
    changes = {k: msg[k] for k in ("title", "background", "archived") if k in msg}
    return manager.update_board(msg["board_id"], **changes)


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/delete_board", vol.Required("board_id"): str}
)
@_guard
def ws_delete_board(hass, connection, msg, manager: HakanbanData):
    manager.delete_board(msg["board_id"])
    return {"deleted": msg["board_id"]}


# ----------------------------------------------------------------------- columns
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/create_column",
        vol.Required("board_id"): str,
        vol.Required("title"): str,
    }
)
@_guard
def ws_create_column(hass, connection, msg, manager: HakanbanData):
    return manager.create_column(msg["board_id"], msg["title"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/update_column",
        vol.Required("board_id"): str,
        vol.Required("column_id"): str,
        vol.Optional("title"): str,
        vol.Optional("archived"): bool,
    }
)
@_guard
def ws_update_column(hass, connection, msg, manager: HakanbanData):
    return manager.update_column(
        msg["board_id"], msg["column_id"],
        title=msg.get("title"), archived=msg.get("archived"),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/delete_column",
        vol.Required("board_id"): str,
        vol.Required("column_id"): str,
    }
)
@_guard
def ws_delete_column(hass, connection, msg, manager: HakanbanData):
    manager.delete_column(msg["board_id"], msg["column_id"])
    return {"deleted": msg["column_id"]}


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/move_column",
        vol.Required("board_id"): str,
        vol.Required("column_id"): str,
        vol.Required("position"): int,
    }
)
@_guard
def ws_move_column(hass, connection, msg, manager: HakanbanData):
    manager.move_column(msg["board_id"], msg["column_id"], msg["position"])
    return {"ok": True}


# ------------------------------------------------------------------------- cards
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/create_card",
        vol.Required("board_id"): str,
        vol.Required("column_id"): str,
        vol.Required("title"): str,
        vol.Optional("description"): str,
        vol.Optional("labels"): [str],
        vol.Optional("due"): vol.Any(str, None),
    }
)
@_guard
def ws_create_card(hass, connection, msg, manager: HakanbanData):
    return manager.create_card(
        msg["board_id"], msg["column_id"], msg["title"],
        description=msg.get("description", ""),
        labels=msg.get("labels", []),
        due=msg.get("due"),
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/paste_cards",
        vol.Required("board_id"): str,
        vol.Required("column_id"): str,
        vol.Exclusive("text", "src"): str,
        vol.Exclusive("titles", "src"): [str],
    }
)
@_guard
def ws_paste_cards(hass, connection, msg, manager: HakanbanData):
    titles = msg.get("titles") or (msg.get("text", "").split("\n"))
    cards = manager.create_cards_bulk(msg["board_id"], msg["column_id"], titles)
    return {"cards": cards}


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/update_card",
        vol.Required("card_id"): str,
        vol.Optional("title"): str,
        vol.Optional("description"): str,
        vol.Optional("labels"): [str],
        vol.Optional("assignees"): [str],
        vol.Optional("due"): vol.Any(str, None),
        vol.Optional("due_complete"): bool,
        vol.Optional("status"): vol.In(["needs_action", "completed"]),
        vol.Optional("cover"): vol.Any(str, None),
        vol.Optional("archived"): bool,
    }
)
@_guard
def ws_update_card(hass, connection, msg, manager: HakanbanData):
    fields = {k: v for k, v in msg.items() if k not in ("id", "type", "card_id")}
    return manager.update_card(msg["card_id"], **fields)


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/move_card",
        vol.Required("card_id"): str,
        vol.Required("to_column"): str,
        vol.Optional("position"): int,
        vol.Optional("to_board"): str,
    }
)
@_guard
def ws_move_card(hass, connection, msg, manager: HakanbanData):
    user = getattr(getattr(connection, "user", None), "name", None)
    return manager.move_card(
        msg["card_id"], msg["to_column"],
        position=msg.get("position"), to_board=msg.get("to_board"),
        user=user,
    )


@websocket_api.websocket_command(
    {vol.Required("type"): f"{DOMAIN}/delete_card", vol.Required("card_id"): str}
)
@_guard
def ws_delete_card(hass, connection, msg, manager: HakanbanData):
    manager.delete_card(msg["card_id"])
    return {"deleted": msg["card_id"]}


# ------------------------------------------------------------------------ labels
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/create_label",
        vol.Required("board_id"): str,
        vol.Required("name"): str,
        vol.Required("color"): str,
    }
)
@_guard
def ws_create_label(hass, connection, msg, manager: HakanbanData):
    return manager.create_label(msg["board_id"], msg["name"], msg["color"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/update_label",
        vol.Required("board_id"): str,
        vol.Required("label_id"): str,
        vol.Optional("name"): str,
        vol.Optional("color"): str,
    }
)
@_guard
def ws_update_label(hass, connection, msg, manager: HakanbanData):
    return manager.update_label(
        msg["board_id"], msg["label_id"], name=msg.get("name"), color=msg.get("color")
    )


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/delete_label",
        vol.Required("board_id"): str,
        vol.Required("label_id"): str,
    }
)
@_guard
def ws_delete_label(hass, connection, msg, manager: HakanbanData):
    manager.delete_label(msg["board_id"], msg["label_id"])
    return {"deleted": msg["label_id"]}


# ---------------------------------------------------------- comments / checklists
@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/add_comment",
        vol.Required("card_id"): str,
        vol.Required("text"): str,
    }
)
@_guard
def ws_add_comment(hass, connection, msg, manager: HakanbanData):
    return manager.add_comment(msg["card_id"], msg["text"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/add_checklist",
        vol.Required("card_id"): str,
        vol.Required("title"): str,
    }
)
@_guard
def ws_add_checklist(hass, connection, msg, manager: HakanbanData):
    return manager.add_checklist(msg["card_id"], msg["title"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/add_check_item",
        vol.Required("card_id"): str,
        vol.Required("checklist_id"): str,
        vol.Required("text"): str,
    }
)
@_guard
def ws_add_check_item(hass, connection, msg, manager: HakanbanData):
    return manager.add_check_item(msg["card_id"], msg["checklist_id"], msg["text"])


@websocket_api.websocket_command(
    {
        vol.Required("type"): f"{DOMAIN}/toggle_check_item",
        vol.Required("card_id"): str,
        vol.Required("checklist_id"): str,
        vol.Required("item_id"): str,
        vol.Required("done"): bool,
    }
)
@_guard
def ws_toggle_check_item(hass, connection, msg, manager: HakanbanData):
    manager.toggle_check_item(
        msg["card_id"], msg["checklist_id"], msg["item_id"], msg["done"]
    )
    return {"ok": True}


_COMMANDS = (
    ws_subscribe,
    ws_get,
    ws_undo,
    ws_redo,
    ws_create_board,
    ws_update_board,
    ws_delete_board,
    ws_create_column,
    ws_update_column,
    ws_delete_column,
    ws_move_column,
    ws_create_card,
    ws_paste_cards,
    ws_update_card,
    ws_move_card,
    ws_delete_card,
    ws_create_label,
    ws_update_label,
    ws_delete_label,
    ws_add_comment,
    ws_add_checklist,
    ws_add_check_item,
    ws_toggle_check_item,
)
