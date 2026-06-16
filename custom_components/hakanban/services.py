"""hakanban.* services so automations, scripts and Assist can drive boards."""

from __future__ import annotations

import voluptuous as vol

from homeassistant.core import HomeAssistant, ServiceCall, SupportsResponse
import homeassistant.helpers.config_validation as cv

from .const import DATA_MANAGER, DOMAIN
from .data import HakanbanData, HakanbanError

SERVICE_ADD_CARD = "add_card"
SERVICE_MOVE_CARD = "move_card"
SERVICE_UPDATE_CARD = "update_card"
SERVICE_ADD_COMMENT = "add_comment"
SERVICE_CREATE_BOARD = "create_board"
SERVICE_CREATE_COLUMN = "create_column"

ADD_CARD_SCHEMA = vol.Schema(
    {
        vol.Required("board_id"): cv.string,
        vol.Required("column_id"): cv.string,
        vol.Required("title"): cv.string,
        vol.Optional("description"): cv.string,
        vol.Optional("labels"): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional("due"): cv.string,
    }
)

MOVE_CARD_SCHEMA = vol.Schema(
    {
        vol.Required("card_id"): cv.string,
        vol.Required("to_column"): cv.string,
        vol.Optional("position"): vol.Coerce(int),
        vol.Optional("to_board"): cv.string,
    }
)

UPDATE_CARD_SCHEMA = vol.Schema(
    {
        vol.Required("card_id"): cv.string,
        vol.Optional("title"): cv.string,
        vol.Optional("description"): cv.string,
        vol.Optional("labels"): vol.All(cv.ensure_list, [cv.string]),
        vol.Optional("due"): vol.Any(cv.string, None),
        vol.Optional("status"): vol.In(["needs_action", "completed"]),
    }
)

ADD_COMMENT_SCHEMA = vol.Schema(
    {vol.Required("card_id"): cv.string, vol.Required("text"): cv.string}
)

CREATE_BOARD_SCHEMA = vol.Schema({vol.Required("title"): cv.string})

CREATE_COLUMN_SCHEMA = vol.Schema(
    {vol.Required("board_id"): cv.string, vol.Required("title"): cv.string}
)


async def async_setup_services(hass: HomeAssistant) -> None:
    """Register all hakanban.* services."""

    def _manager() -> HakanbanData:
        return hass.data[DOMAIN][DATA_MANAGER]

    async def add_card(call: ServiceCall) -> dict:
        try:
            card = _manager().create_card(
                call.data["board_id"],
                call.data["column_id"],
                call.data["title"],
                description=call.data.get("description", ""),
                labels=call.data.get("labels", []),
                due=call.data.get("due"),
            )
        except HakanbanError as err:
            raise vol.Invalid(str(err)) from err
        return {"card_id": card["id"], "number": card["number"]}

    async def move_card(call: ServiceCall) -> None:
        try:
            _manager().move_card(
                call.data["card_id"],
                call.data["to_column"],
                position=call.data.get("position"),
                to_board=call.data.get("to_board"),
            )
        except HakanbanError as err:
            raise vol.Invalid(str(err)) from err

    async def update_card(call: ServiceCall) -> None:
        fields = {k: v for k, v in call.data.items() if k != "card_id"}
        try:
            _manager().update_card(call.data["card_id"], **fields)
        except HakanbanError as err:
            raise vol.Invalid(str(err)) from err

    async def add_comment(call: ServiceCall) -> None:
        try:
            _manager().add_comment(call.data["card_id"], call.data["text"])
        except HakanbanError as err:
            raise vol.Invalid(str(err)) from err

    async def create_board(call: ServiceCall) -> dict:
        board = _manager().create_board(call.data["title"])
        return {"board_id": board["id"]}

    async def create_column(call: ServiceCall) -> dict:
        try:
            column = _manager().create_column(call.data["board_id"], call.data["title"])
        except HakanbanError as err:
            raise vol.Invalid(str(err)) from err
        return {"column_id": column["id"]}

    hass.services.async_register(
        DOMAIN, SERVICE_ADD_CARD, add_card, ADD_CARD_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(DOMAIN, SERVICE_MOVE_CARD, move_card, MOVE_CARD_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_UPDATE_CARD, update_card, UPDATE_CARD_SCHEMA)
    hass.services.async_register(DOMAIN, SERVICE_ADD_COMMENT, add_comment, ADD_COMMENT_SCHEMA)
    hass.services.async_register(
        DOMAIN, SERVICE_CREATE_BOARD, create_board, CREATE_BOARD_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )
    hass.services.async_register(
        DOMAIN, SERVICE_CREATE_COLUMN, create_column, CREATE_COLUMN_SCHEMA,
        supports_response=SupportsResponse.OPTIONAL,
    )


def async_unload_services(hass: HomeAssistant) -> None:
    for service in (
        SERVICE_ADD_CARD,
        SERVICE_MOVE_CARD,
        SERVICE_UPDATE_CARD,
        SERVICE_ADD_COMMENT,
        SERVICE_CREATE_BOARD,
        SERVICE_CREATE_COLUMN,
    ):
        hass.services.async_remove(DOMAIN, service)
