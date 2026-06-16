# Hakanban

**A Trello-style Kanban board that lives *inside* Home Assistant.**

Instead of wrapping an external service like Todoist or Kanboard, Hakanban stores and manages
everything **natively in Home Assistant** and reuses HA's own concepts:

- a **board** is a hub **device**,
- a **column** is a native **`todo` list entity**,
- a **card** is a **`todo` item**, enriched with labels, due dates, comments and a markdown
  description.

That makes the board **scriptable**, **voice-addressable via Assist** ("add milk to the
Groceries list"), and **reactive to and from automations** — the one thing Trello can't do.

## Features

- Multiple **boards**, each with its own background and label palette
- **Columns / lists** — create, rename, reorder, archive
- **Cards** with **markdown descriptions**, **labels** (+ filter), **due dates** and
  **comments**
- **Drag and drop** within and between columns, plus column reordering
- **Multi-line paste → many cards** (one card per pasted line)
- **Search**
- A full-page **sidebar panel** plus an **embeddable Lovelace card**
- Native **`todo` entities** per column → works with the built-in To-do card, Assist and the
  `todo.*` services
- **`hakanban.*` services** and **bus events** so automations can drive and react to the board

## Install

Add this repository to **HACS** as a **custom repository** (category **Integration**), install
**Hakanban**, restart Home Assistant, then add the **Hakanban** integration from **Settings →
Devices & Services**. The **Hakanban** panel appears in your sidebar. Full instructions, the
service/event reference and example automations are in the
[README](https://github.com/neilellis/hakanban).
