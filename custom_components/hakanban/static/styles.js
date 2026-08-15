// Shared CSS. Uses Home Assistant theme variables so it adapts to the active theme.

export const STYLES = `
:host {
  --hk-gap: 12px;
  --hk-radius: 10px;
  --hk-col-bg: var(--card-background-color, #fff);
  --hk-card-bg: var(--ha-card-background, var(--card-background-color, #fff));
  --hk-text: var(--primary-text-color, #172b4d);
  --hk-subtle: var(--secondary-text-color, #5e6c84);
  --hk-accent: var(--primary-color, #0079bf);
  --hk-divider: var(--divider-color, rgba(0,0,0,.12));
  display: block;
  color: var(--hk-text);
  font-family: var(--paper-font-body1_-_font-family, Roboto, sans-serif);
}

.hk-root { display: flex; flex-direction: column; height: 100%; min-height: 0; }

/* The full-page panel fills the viewport. HA mounts the custom panel element
   with no intrinsic height, so without this the whole app collapses to content
   height. The panel renders its own toolbar (no HA header above it), so the
   panel area is the full viewport height. */
:host(hakanban-panel) { display: block; height: 100vh; }

/* The board view fills all available height so its background covers the whole
   area, not just the columns. In the Lovelace card (host has no fixed height)
   this resolves to content height — harmless. */
:host(hakanban-board) { display: flex; flex-direction: column; height: 100%; }

.hk-toolbar {
  display: flex; align-items: center; gap: 8px;
  padding: 10px 16px; flex-wrap: wrap;
  border-bottom: 1px solid var(--hk-divider);
  background: var(--app-header-background-color, var(--hk-accent));
  color: var(--app-header-text-color, #fff);
}
.hk-toolbar .hk-title { font-size: 1.15rem; font-weight: 600; margin-right: 8px; }
.hk-board-tabs { display: flex; gap: 4px; flex-wrap: wrap; flex: 1; min-width: 0; }
.hk-tab {
  padding: 5px 12px; border-radius: 6px; cursor: pointer;
  background: rgba(255,255,255,.16); color: inherit; border: 0;
  font-size: .9rem; white-space: nowrap;
}
.hk-tab.active { background: rgba(255,255,255,.38); font-weight: 600; }
.hk-toolbar input.hk-search {
  padding: 6px 10px; border-radius: 6px; border: 0; min-width: 160px;
  background: rgba(255,255,255,.9); color: #172b4d;
}
.hk-iconbtn {
  background: rgba(255,255,255,.16); color: inherit; border: 0; cursor: pointer;
  width: 32px; height: 32px; border-radius: 6px; font-size: 1.1rem; line-height: 1;
}
.hk-iconbtn:hover { background: rgba(255,255,255,.34); }
.hk-iconbtn:disabled { opacity: .4; cursor: default; }
.hk-iconbtn:disabled:hover { background: rgba(255,255,255,.16); }

.hk-board {
  flex: 1; min-height: 0; display: flex; gap: var(--hk-gap);
  padding: 16px; overflow-x: auto; align-items: flex-start;
  background-size: cover; background-position: center;
}

.hk-col {
  flex: 0 0 290px; max-height: 100%;
  display: flex; flex-direction: column;
  background: var(--hk-col-bg); border-radius: var(--hk-radius);
  box-shadow: 0 1px 2px rgba(9,30,66,.18);
}
.hk-col.dragover { outline: 2px dashed var(--hk-accent); outline-offset: -2px; }
.hk-col-head {
  display: flex; align-items: center; gap: 6px; padding: 10px 12px 6px;
  cursor: grab;
}
.hk-col-title { font-weight: 600; flex: 1; font-size: .95rem; }
.hk-col-title[contenteditable="true"] { outline: 1px solid var(--hk-accent); border-radius: 4px; padding: 1px 4px; }
.hk-col-count { color: var(--hk-subtle); font-size: .8rem; }
.hk-col-menu { background: none; border: 0; cursor: pointer; color: var(--hk-subtle); font-size: 1.1rem; }

.hk-cards { padding: 4px 8px; overflow-y: auto; flex: 1; min-height: 8px; }

.hk-card {
  background: var(--hk-card-bg); border-radius: 8px; padding: 8px 10px; margin-bottom: 8px;
  box-shadow: 0 1px 1px rgba(9,30,66,.2); cursor: pointer; border: 1px solid var(--hk-divider);
}
.hk-card.dragging { opacity: .4; }
.hk-card.completed .hk-card-title { text-decoration: line-through; color: var(--hk-subtle); }
.hk-card-labels { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 8px; }
.hk-label {
  border-radius: 999px; font-size: .67rem; font-weight: 600; letter-spacing: .01em;
  display: inline-flex; align-items: center; padding: 2px 9px; line-height: 1.35;
  white-space: nowrap; overflow: hidden;
}
.hk-card-title { font-size: .9rem; line-height: 1.3; white-space: pre-wrap; word-break: break-word; }
.hk-card-badges { display: flex; flex-wrap: wrap; gap: 8px; margin-top: 6px; color: var(--hk-subtle); font-size: .72rem; align-items: center; }
.hk-badge { display: inline-flex; align-items: center; gap: 3px; padding: 1px 5px; border-radius: 4px; }
.hk-badge.due-overdue { background: #eb5a46; color: #fff; }
.hk-badge.due-soon { background: #f2d600; color: #172b4d; }
.hk-badge.due-done { background: #61bd4f; color: #fff; }
.hk-card-number { color: var(--hk-subtle); font-size: .7rem; }

.hk-composer { padding: 6px 8px 10px; }
.hk-composer textarea {
  width: 100%; box-sizing: border-box; resize: vertical; min-height: 38px;
  border-radius: 6px; border: 1px solid var(--hk-divider); padding: 8px;
  font: inherit; background: var(--hk-card-bg); color: var(--hk-text);
}
.hk-composer-actions { display: flex; gap: 6px; margin-top: 6px; }
.hk-btn {
  background: var(--hk-accent); color: #fff; border: 0; border-radius: 6px;
  padding: 6px 12px; cursor: pointer; font: inherit;
}
.hk-btn.secondary { background: transparent; color: var(--hk-subtle); }
.hk-btn:hover { filter: brightness(1.05); }
.hk-addcard { color: var(--hk-subtle); text-align: left; width: 100%; padding: 8px; }

.hk-add-col {
  flex: 0 0 290px; background: rgba(255,255,255,.24); border-radius: var(--hk-radius);
  padding: 8px;
}
.hk-add-col button { width: 100%; text-align: left; background: none; border: 0; cursor: pointer; color: inherit; padding: 6px; }

.hk-empty { padding: 40px; text-align: center; color: var(--hk-subtle); }

/* ---- modal ---- */
.hk-modal-back {
  position: fixed; inset: 0; background: rgba(0,0,0,.55); z-index: 9; display: flex;
  align-items: flex-start; justify-content: center; padding: 5vh 16px; overflow-y: auto;
}
.hk-modal {
  background: var(--hk-card-bg); color: var(--hk-text); width: min(720px, 100%);
  border-radius: 12px; box-shadow: 0 8px 40px rgba(0,0,0,.4); padding: 20px 24px;
}
.hk-modal h2 { margin: 0 0 4px; font-size: 1.25rem; display: flex; gap: 8px; align-items: flex-start; }
.hk-modal h2 textarea { font: inherit; font-size: 1.2rem; font-weight: 600; border: 0; background: none; resize: none; width: 100%; color: inherit; }
.hk-modal .hk-meta { color: var(--hk-subtle); font-size: .8rem; margin-bottom: 16px; }
.hk-section { margin: 16px 0; }
.hk-section h3 { font-size: .85rem; text-transform: uppercase; letter-spacing: .04em; color: var(--hk-subtle); margin: 0 0 6px; }
.hk-desc-edit { width: 100%; box-sizing: border-box; min-height: 90px; border-radius: 6px; border: 1px solid var(--hk-divider); padding: 8px; font: inherit; background: var(--hk-col-bg); color: var(--hk-text); }
.hk-desc-render { background: var(--hk-col-bg); border-radius: 6px; padding: 8px 10px; min-height: 24px; }
.hk-desc-render code { background: var(--hk-divider); padding: 1px 4px; border-radius: 4px; }
.hk-label-row { display: flex; flex-wrap: wrap; gap: 6px; align-items: center; }
.hk-label-chip { height: 28px; border-radius: 6px; padding: 0 12px; display: inline-flex; align-items: center; cursor: pointer; font-size: .8rem; border: 2px solid transparent; }
.hk-label-chip.selected { border-color: var(--hk-text); }
.hk-comment { border-top: 1px solid var(--hk-divider); padding: 8px 0; font-size: .85rem; }
.hk-comment .who { font-weight: 600; }
.hk-comment .when { color: var(--hk-subtle); font-size: .72rem; margin-left: 6px; }
.hk-modal-actions { display: flex; gap: 8px; margin-top: 18px; flex-wrap: wrap; }
.hk-modal-actions .grow { flex: 1; }
.hk-danger { background: #eb5a46; }
.hk-row { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.hk-row input[type="datetime-local"], .hk-row input[type="text"] { padding: 6px; border-radius: 6px; border: 1px solid var(--hk-divider); background: var(--hk-col-bg); color: var(--hk-text); font: inherit; }
.hk-check-item { display: flex; gap: 6px; align-items: center; padding: 2px 0; }
.hk-check-item.done span { text-decoration: line-through; color: var(--hk-subtle); }
.hk-opt-row { display: flex; gap: 8px; align-items: center; font-size: .9rem; cursor: pointer; }
.hk-opt-row input { margin: 0; cursor: pointer; }
/* Compact mode: tighter cards, smaller text, less padding. */
.hk-board.compact .hk-card { padding: 4px 6px; margin-bottom: 4px; }
.hk-board.compact .hk-card-title { font-size: .82rem; }
.hk-board.compact .hk-card-badges { margin-top: 3px; font-size: .66rem; gap: 6px; }
.hk-board.compact .hk-card-labels { margin-bottom: 4px; gap: 3px; }
.hk-board.compact .hk-label { font-size: .6rem; padding: 1px 6px; }
`;
