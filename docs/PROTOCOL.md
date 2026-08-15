# Hakanban protocol & data contract

This is the shared interface between the Python integration, the websocket API, and the
frontend (panel + Lovelace card). Everything below is the source of truth.

## Store document (`.storage/hakanban.json`, `version: 1`)

```jsonc
{
  "boards": {
    "<board_id>": {
      "id": "<board_id>",
      "title": "My Board",
      "background": null,              // CSS colour / gradient name, or null
      "archived": false,
      "label_defs": [                  // per-board label palette
        { "id": "<label_id>", "name": "Bug", "color": "#eb5a46" }
      ],
      "columns": [
        { "id": "<column_id>", "title": "To Do", "order": 0, "archived": false }
      ],
      "card_seq": 12,                  // monotonic per-board card number counter
      "created": "<iso8601>"
    }
  },
  "cards": {
    "<card_id>": {
      "id": "<card_id>",
      "board_id": "<board_id>",
      "column_id": "<column_id>",
      "order": 2000,                   // sparse integer order within the column
      "number": 7,                     // human card number (#7), unique per board
      "title": "Buy milk",
      "description": "",               // markdown
      "labels": ["<label_id>", ...],
      "assignees": ["person.neil", ...],
      "due": null,                     // iso8601 or null
      "due_complete": false,
      "status": "needs_action",        // "needs_action" | "completed"
      "completed": "<iso8601>",        // present only when status == completed
      "checklists": [
        { "id": "<id>", "title": "Steps", "items": [ { "id": "<id>", "text": "x", "done": false } ] }
      ],
      "comments": [ { "id": "<id>", "author": "Neil", "ts": "<iso8601>", "text": "..." } ],
      // comments are append-only (added via add_comment or auto-generated on
      // cross-column/cross-board moves as "Moved from <from> to <to>")
      "cover": null,
      "archived": false,
      "created": "<iso8601>",
      "updated": "<iso8601>"
    }
  }
}
```

`status` deliberately mirrors `todo.TodoItemStatus` so each card maps 1:1 onto a todo item.

## Frontend payload (what the WS API returns / pushes)

The frontend never sees the raw store. It gets boards with columns→cards **nested and sorted**:

```jsonc
{ "boards": [
  { "id", "title", "background", "archived",
    "labels": [ {id,name,color} ],
    "columns": [
      { "id", "title", "order", "archived",
        "cards": [ { ...full card... } ]   // sorted by order, archived excluded
      }
    ]
  } ],
  "can_undo": true,   // is there a mutation to undo?  (store-wide history)
  "can_redo": false   // is there an undone mutation to redo?
}
```

Produced by `HakanbanData.full_payload()`; `board_payload(board_id)` produces a single board
object (without the `can_undo`/`can_redo` flags).

## WebSocket API

All commands are objects `{ "id": <n>, "type": "hakanban/<cmd>", ... }`.
Mutations return the affected object in `result`; **state propagation happens via the
subscription** (every connected client receives the new full payload), so a client can apply an
optimistic update and reconcile on the next push.

| type | params | result |
|------|--------|--------|
| `hakanban/get` | — | full payload `{boards:[…]}` |
| `hakanban/subscribe` | — | streams full payload `{boards:[…]}` immediately and on every change |
| `hakanban/undo` | — | `{can_undo, can_redo}` — reverts the last mutation (store-wide) |
| `hakanban/redo` | — | `{can_undo, can_redo}` — re-applies the last undone mutation |
| `hakanban/create_board` | `title`, `background?` | board |
| `hakanban/update_board` | `board_id`, `title?`, `background?`, `archived?` | board |
| `hakanban/delete_board` | `board_id` | `{deleted: board_id}` |
| `hakanban/create_column` | `board_id`, `title` | column |
| `hakanban/update_column` | `board_id`, `column_id`, `title?`, `archived?` | column |
| `hakanban/delete_column` | `board_id`, `column_id` | `{deleted: column_id}` |
| `hakanban/move_column` | `board_id`, `column_id`, `position` (int) | `{ok: true}` |
| `hakanban/create_card` | `board_id`, `column_id`, `title`, `description?`, `labels?`, `due?` | card |
| `hakanban/paste_cards` | `board_id`, `column_id`, `text` (newline-separated) **or** `titles[]` | `{cards:[…]}` |
| `hakanban/update_card` | `card_id`, any of `title/description/labels/assignees/due/due_complete/status/cover/archived` | card |
| `hakanban/move_card` | `card_id`, `to_column`, `position?` (int), `to_board?` | card (auto-comments on cross-column/cross-board moves) |
| `hakanban/delete_card` | `card_id` | `{deleted: card_id}` |
| `hakanban/create_label` | `board_id`, `name`, `color` | label |
| `hakanban/update_label` | `board_id`, `label_id`, `name?`, `color?` | label |
| `hakanban/delete_label` | `board_id`, `label_id` | `{deleted: label_id}` |
| `hakanban/add_comment` | `card_id`, `text` | comment |
| `hakanban/add_checklist` | `card_id`, `title` | checklist |
| `hakanban/add_check_item` | `card_id`, `checklist_id`, `text` | item |
| `hakanban/toggle_check_item` | `card_id`, `checklist_id`, `item_id`, `done` | `{ok:true}` |

The subscription push message body is the full payload `{ "boards": [...] }`.

Board titles are kept unique: `create_board` and `update_board` append ` (n)` to the requested
title if another board already uses it (so each board — and its device — has a distinct name).

Undo/redo is **store-wide** and snapshot-based: every mutation (from the panel, Lovelace card,
`hakanban.*`/`todo.*` services or Assist) snapshots the whole document first, so any single
action can be reverted regardless of which client made it. A new mutation clears the redo stack;
history is capped at `UNDO_HISTORY_LIMIT` (50) states and reset to empty on load.

## HA bus events (for automations)

| event | data |
|-------|------|
| `hakanban_card_created` | `board_id`, `column_id`, `card_id`, `title` |
| `hakanban_card_updated` | `board_id`, `card_id`, `column_id?`, `action?` |
| `hakanban_card_moved` | `board_id`, `card_id`, `from_column`, `to_column` |
| `hakanban_card_completed` | `board_id`, `card_id`, `column_id` |
| `hakanban_card_deleted` | `board_id`, `card_id` |
| `hakanban_board_changed` | `board_id`, `action` |

## Services (`hakanban.*`)

`add_card` (board_id, column_id, title, description?, labels?, due?), `move_card`
(card_id, to_column, position?), `update_card` (card_id, …), `add_comment` (card_id, text),
`create_board` (title), `create_column` (board_id, title). Plus the native `todo.*` services on
each column entity (Assist / voice).

## Entities

* One **device** per board (`identifiers={("hakanban", board_id)}`, name = board title).
* One **`todo` list entity** per column, attached to its board device. `unique_id =
  f"{board_id}_{column_id}"`. It reads/writes cards through `HakanbanData`, so the native todo
  card, Assist and `todo.*` services operate on the same data the panel shows.
* One **`calendar` entity** per board, attached to its board device. `unique_id =
  f"{board_id}_calendar"`. Every non-archived card with a `due` date surfaces as an event
  (summary `#<number> <title>`); a date-only due is an all-day event, a due with a time is a
  one-hour block. Read-only view over `HakanbanData`, so dated cards appear in HA's Calendar
  panel / dashboard card and are Assist-queryable and automatable.
