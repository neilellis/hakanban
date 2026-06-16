# Hakanban

**A Trello-style Kanban board that lives *inside* Home Assistant.**

[![HACS Custom](https://img.shields.io/badge/HACS-Custom-41BDF5.svg)](https://hacs.xyz)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Hakanban is a fast, drag-and-drop Kanban board — but instead of wrapping an external
service like Todoist or Kanboard, it stores and manages everything **natively in Home
Assistant** and reuses HA's own concepts:

- a **board** is a hub **device**,
- a **column** is a native **`todo` list entity**,
- a **card** is a **`todo` item**, enriched with labels, due dates, comments and a markdown
  description.

Because boards are built from real HA primitives, the board is **scriptable**,
**voice-addressable via Assist** ("add milk to the Groceries list"), and **reacts to and from
automations** — the one thing Trello can't do. Move a card to *Done* and fire a notification;
ring the doorbell and drop a card into *Follow up*. It's a board and an automation surface at
the same time.

---

## Features

v1 ships the **Core + multi-line paste** scope:

- **Boards** — multiple boards, each with its own background/theme and label palette.
  Rename a board with the toolbar's ✎ button; titles are kept unique automatically.
- **Lists / columns** — create, rename, reorder, archive.
- **Cards** — create, edit, archive, with **markdown descriptions**.
- **Drag and drop** — move cards within a column and between columns, and reorder columns by
  dragging their headers (native HTML5 drag-and-drop — no build step, no external library).
- **Labels** — colour + name per board, with **filter-by-label**.
- **Due dates** — with a due-complete checkbox. Cards with a due date also surface on the
  board's native HA **`calendar` entity**, so dated tasks appear in Home Assistant's Calendar
  panel and dashboard card.
- **Comments / activity** on a card.
- **Multi-line paste → many cards** — paste newline-separated text into the composer and get
  one card per non-empty line, created in order in a single batched call.
- **Search** across cards.
- **Undo / redo** — store-wide history with toolbar buttons and `Ctrl`/`⌘`+`Z` /
  `Ctrl`/`⌘`+`Shift`+`Z` shortcuts; reverts any change, including ones made via services or Assist.
- **Full-page sidebar panel** (the drag-drop app, auto-registered — no manual Lovelace
  resource) **+** an **embeddable Lovelace card** for dashboards.

---

## Installation

### Via HACS (recommended)

Hakanban is distributed as a **custom repository**:

1. Open **HACS** in Home Assistant.
2. Click the **three-dot menu** (top right) → **Custom repositories**.
3. Add the repository URL `https://github.com/neilellis/hakanban`, choose category
   **Integration**, and click **Add**.
4. Find **Hakanban** in the list and click **Install**.
5. **Restart** Home Assistant.
6. Go to **Settings → Devices & Services → Add Integration**, search for **Hakanban**, and add
   it.

The **Hakanban** item now appears in your sidebar.

### Manual install

1. Copy the `custom_components/hakanban` folder into your Home Assistant `/config/custom_components`
   directory.
2. **Restart** Home Assistant.
3. Go to **Settings → Devices & Services → Add Integration** and add **Hakanban**.

---

## Using it

Open the **Hakanban** panel from the sidebar:

- **Create a board**, then add **columns** (lists) to it.
- **Add cards** to a column with the composer. Open a card to edit its **markdown
  description**, attach **labels**, set a **due date**, and leave **comments**.
- **Drag** cards within a column, between columns, and **reorder** columns by dragging their
  headers.
- **Bulk-create:** paste a multi-line block (e.g. a shopping list) into the card composer —
  each non-empty line becomes its own card, in order.
- **Filter by label** and **search** to find cards quickly.

### Embeddable Lovelace card

Drop a board onto any dashboard with the bundled card. The card is **auto-registered by the
integration** — you do **not** need to add a Lovelace resource manually.

```yaml
type: custom:hakanban-card
board: <board_id>      # the id of the board to embed
```

---

## Home Assistant integration

This is where Hakanban earns its keep. Every column is a real HA entity, so everything that
works on a `todo` list works on your Kanban board:

- **Native To-do card** — point Home Assistant's built-in To-do List card at a column's
  `todo.*` entity.
- **Assist / voice** — "add milk to the Groceries list" adds a card to that column.
- **`todo.*` services** — `todo.add_item`, `todo.update_item`, `todo.remove_item` etc. operate
  on the same data the panel shows (no sync layer — the JSON store is the single source of
  truth).

### Entities & devices

- **One device per board** (`identifiers={("hakanban", board_id)}`, named after the board).
- **One `todo` list entity per column**, attached to its board device
  (`unique_id = "{board_id}_{column_id}"`).
- **One `calendar` entity per board** (`unique_id = "{board_id}_calendar"`), attached to its
  board device, surfacing every card with a due date as an event — point the built-in Calendar
  card at it or open the **Calendar** panel to see your dated cards.

List the column entities with `./scripts/ha states todo` and inspect one with
`./scripts/ha get todo.<board>_<column>`.

### Services (`hakanban.*`)

| Service | Fields | Description |
|---------|--------|-------------|
| `hakanban.add_card` | `board_id`, `column_id`, `title`, `description?`, `labels?`, `due?` | Create a card in a column. |
| `hakanban.move_card` | `card_id`, `to_column`, `position?` | Move a card to another column (optionally at a position). |
| `hakanban.update_card` | `card_id`, … | Update card fields (title, description, labels, due, status, …). |
| `hakanban.add_comment` | `card_id`, `text` | Add a comment to a card. |
| `hakanban.create_board` | `title` | Create a board. |
| `hakanban.create_column` | `board_id`, `title` | Create a column on a board. |

The native `todo.*` services are also available on every column entity (great for Assist and
voice).

### Bus events (for automations)

Every mutation fires a Home Assistant event you can trigger automations on:

| Event | Data |
|-------|------|
| `hakanban_card_created` | `board_id`, `column_id`, `card_id`, `title` |
| `hakanban_card_updated` | `board_id`, `card_id`, `column_id?`, `action?` |
| `hakanban_card_moved` | `board_id`, `card_id`, `from_column`, `to_column` |
| `hakanban_card_completed` | `board_id`, `card_id`, `column_id` |
| `hakanban_card_deleted` | `board_id`, `card_id` |
| `hakanban_board_changed` | `board_id`, `action` |

---

## Example automations

**Notify when a card lands in a "Done" column.** Trigger on the move event and match the
target column id:

```yaml
automation:
  - alias: "Hakanban: notify on card done"
    triggers:
      - trigger: event
        event_type: hakanban_card_moved
        event_data:
          to_column: <done_column_id>
    actions:
      - action: notify.mobile_app_neil
        data:
          title: "Kanban"
          message: "A card was moved to Done."
```

**Create a card from another automation.** When the doorbell rings, drop a card into a
"Follow up" list:

```yaml
automation:
  - alias: "Doorbell → add a Follow up card"
    triggers:
      - trigger: state
        entity_id: binary_sensor.front_doorbell
        to: "on"
    actions:
      - action: hakanban.add_card
        data:
          board_id: <board_id>
          column_id: <follow_up_column_id>
          title: "Someone rang the doorbell"
          description: "Check the Ring snapshot and follow up if needed."
```

More recipes — nightly shopping-list population, chore-complete on motion, building a column
from a script — are in **[docs/automations.md](docs/automations.md)**.

---

## Architecture

A **single JSON store** (`.storage/hakanban.json`, schema `version: 1`) is the **source of
truth** for the entire board model — boards, columns, cards, labels, comments. A central
`HakanbanData` manager owns every mutation: it persists the change, fires the relevant HA
event, pushes a live update to connected panels over the websocket, and writes state on the
affected `todo` entities.

The **`todo` entities** and the **websocket API** are thin **views** over that store — they
read and write the same data, so the native HA todo card, Assist, the `todo.*` services, the
`hakanban.*` services and the panel all stay in sync with **no sync layer**.

The full data model, websocket command schemas, event payloads and service signatures are
documented in **[docs/PROTOCOL.md](docs/PROTOCOL.md)**.

---

## Roadmap

- [ ] Checklists UI (the store already reserves `checklists`)
- [ ] Attachments
- [ ] Card / board templates
- [ ] Swimlanes
- [x] Calendar — boards expose dated cards as a native HA `calendar` entity
- [ ] In-panel timeline / calendar view
- [ ] Custom fields
- [ ] Butler-style automation rules (in-board "when X, do Y")

---

## Contributing

Issues and pull requests are welcome at
[`neilellis/hakanban`](https://github.com/neilellis/hakanban). Please open an issue to discuss
larger changes first, and keep frontend/backend changes consistent with
[docs/PROTOCOL.md](docs/PROTOCOL.md), which is the shared contract between the integration, the
websocket API and the frontend.

## License

[MIT](LICENSE) © Neil Ellis
