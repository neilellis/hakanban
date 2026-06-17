# CLAUDE.md

Guidance for working in this repo. Read [README.md](README.md) for the product pitch and
[docs/PROTOCOL.md](docs/PROTOCOL.md) for the data model / websocket / event contract — those are
the source of truth; keep them in sync with code changes.

## What this is

**Hakanban** — a Trello-style Kanban board that runs *natively inside Home Assistant* and is
distributed via HACS. It reuses HA primitives instead of wrapping an external service: a **board**
is a hub **device**, a **column** is a **`todo` list entity**, a **card** is a **`todo` item**, and
each board also exposes a **`calendar` entity** for dated cards.

## Layout

```
custom_components/hakanban/      # the HA integration (Python)
  data.py          # HakanbanData — the single mutation point over the JSON store (the core)
  store.py         # thin Store wrapper (.storage/hakanban.json, schema version 1)
  const.py         # DOMAIN, event names, SIGNAL_*, ORDER_STEP, UNDO_HISTORY_LIMIT, etc.
  __init__.py      # setup + PLATFORMS = [Platform.TODO, Platform.CALENDAR]
  todo.py          # one TodoListEntity per column (a view over HakanbanData)
  calendar.py      # one CalendarEntity per board (a view; dated cards -> events)
  websocket_api.py # hakanban/* WS commands + hakanban/subscribe live stream
  services.py(.yaml) config_flow.py frontend.py manifest.json
  static/          # vanilla-JS web components — NO BUILD STEP (see below)
docs/PROTOCOL.md   # the shared contract (data model, WS schemas, events, services, entities)
tests/             # plain `python3 tests/*.py` (HA is stubbed, real package modules loaded)
```

## Architecture (the rules that matter)

- **`HakanbanData` is the single source of truth and the single mutation point.** Every change
  goes through one of its public methods, each of which calls `_commit(...)` to: persist (debounced
  `Store` save), fire the relevant `hass.bus` event, and `async_dispatcher_send(SIGNAL_BOARDS_UPDATED)`.
- **Entities and the WS API are thin *views*.** `todo.py` and `calendar.py` read/write live through
  the manager and re-`_sync` on `SIGNAL_BOARDS_UPDATED` — they hold no cached copies. The panel,
  Lovelace card, `todo.*`/`hakanban.*` services and Assist therefore all stay in sync with **no sync
  layer**. When adding a mutation, do it in `data.py`; the views update for free.
- **Undo/redo is store-wide & snapshot-based.** The `@_undoable` decorator in `data.py` deep-copies
  the whole document *before* each mutation onto an in-memory stack (cap `UNDO_HISTORY_LIMIT = 50`,
  reset on load). It covers every mutation regardless of which client made it. Apply `@_undoable` to
  any new public mutation. `full_payload()` advertises `can_undo` / `can_redo`.
- **Ordering** uses a sparse integer `order` with gap `ORDER_STEP = 1000`, so a move usually rewrites
  one row.
- **Board titles are kept unique** server-side (`_unique_board_title` appends ` (n)`), because a
  board's title is also its HA device name.

## Frontend conventions

- **No build step, no framework, no npm.** `static/*.js` are native ES-module Web Components loaded
  directly by the browser; HA injects `hass`. Shadow DOM + HA theme CSS variables (see `styles.js`).
  Don't introduce a bundler/TypeScript/dependency without explicit agreement.
- `api.js` wraps the websocket; the panel subscribes once and re-renders from pushed `full_payload()`.
  Optimistic update + reconcile-on-next-push is the pattern.
- Keep new code in the style of the file around it (vanilla DOM, `escapeHtml`, small render methods).

## Tests

- Run: `python3 tests/test_logic.py` and `python3 tests/test_calendar.py` (no pytest, no HA install —
  they stub `homeassistant.*` and load the real package modules via importlib).
- `tests/browser/` is a manual mock-hass harness for poking the panel in a browser.
- Backend/logic changes: add a `check(...)` to `test_logic.py`. Frontend-only changes can't be unit
  tested here — run the suites anyway to prove the backend is intact, and say so.

## Dev / release workflow

1. Make the change; update **README.md** and **docs/PROTOCOL.md** if behaviour/contract changed.
2. **Bump the version in `manifest.json` — patch segment only** (e.g. `0.1.3` → `0.1.4`). This is a
   firm user preference: never touch major/minor unless explicitly told.
3. Run the test suites.
4. Commit + push **only when asked**. Conventional, imperative subject describing the behaviour.
5. **Cut a GitHub release so HACS sees the update** — HACS keys off tags/releases, not commits:
   `gh release create vX.Y.Z --title "vX.Y.Z" --notes "..."`. Verify with
   `gh release view vX.Y.Z` that `isDraft=false`. Tag = `v` + the manifest version.
6. Updating in HA: HACS → Hakanban → Update. A **new platform** (e.g. adding `calendar`) needs a full
   HA restart; a **frontend-only** change just needs a browser hard-refresh.
