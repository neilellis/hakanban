// <hakanban-panel> — the full-page sidebar app. Home Assistant injects `hass`.
// Dialogs (rename, options) live in dialogs.js.

import { STYLES } from "./styles.js";
import { HakanbanApi } from "./api.js";
import { escapeHtml, contrastText, debounce } from "./util.js";
import { loadDisplayOpts } from "./display-opts.js";
import { openRenameDialog, openOptionsDialog } from "./dialogs.js";
import "./board-view.js";

export class HakanbanPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._activeBoardId = localStorage.getItem("hakanban_active_board") || null;
    this._query = "";
    this._activeLabels = new Set();
    this._showFilter = false;
    this._built = false;
    this._displayOpts = loadDisplayOpts();
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._api) {
      this._api = new HakanbanApi(hass);
      this._start();
    } else {
      this._api.setHass(hass);
      if (this._boardEl) this._boardEl.hass = hass;
    }
  }

  connectedCallback() {
    if (this._hass && !this._api) {
      this._api = new HakanbanApi(this._hass);
      this._start();
    }
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub.then((u) => u && u()).catch(() => {});
    if (this._onKeydown) {
      window.removeEventListener("keydown", this._onKeydown);
      this._onKeydown = null;
    }
  }

  // Ctrl/⌘+Z = undo, Ctrl/⌘+Shift+Z or Ctrl+Y = redo. Skipped while typing in a
  // field so the browser's native text undo keeps working.
  _setupKeyboard() {
    if (this._onKeydown) return;
    this._onKeydown = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const key = (e.key || "").toLowerCase();
      if (key !== "z" && key !== "y") return;
      const target = (e.composedPath && e.composedPath()[0]) || e.target;
      const tag = (target && target.tagName) || "";
      if (target && (target.isContentEditable || /^(input|textarea|select)$/i.test(tag))) return;
      e.preventDefault();
      if (key === "y" || (key === "z" && e.shiftKey)) {
        if (this._data?.can_redo) this._api.redo();
      } else if (this._data?.can_undo) {
        this._api.undo();
      }
    };
    window.addEventListener("keydown", this._onKeydown);
  }

  async _start() {
    this._build();
    this._setupKeyboard();
    this._unsub = this._api.subscribe((payload) => {
      this._data = payload;
      if (!this._activeBoardId || !payload.boards.find((b) => b.id === this._activeBoardId)) {
        this._activeBoardId = payload.boards[0]?.id || null;
      }
      this._renderToolbar();
      this._renderBoard();
    });
  }

  _activeBoard() {
    return (this._data?.boards || []).find((b) => b.id === this._activeBoardId) || null;
  }

  _build() {
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <div class="hk-root">
        <div class="hk-toolbar" id="toolbar"></div>
        <div id="filterbar"></div>
        <div id="host" style="flex:1;min-height:0;display:flex"></div>
      </div>`;
    this._boardEl = document.createElement("hakanban-board");
    this._boardEl.style.flex = "1";
    this._boardEl.style.minWidth = "0";
    this._boardEl.api = this._api;
    this._boardEl.hass = this._hass;
    this._boardEl.displayOpts = this._displayOpts;
    this.shadowRoot.getElementById("host").appendChild(this._boardEl);
    this._built = true;
  }

  _renderToolbar() {
    const boards = this._data?.boards || [];
    const tabs = boards
      .map(
        (b) =>
          `<button class="hk-tab ${b.id === this._activeBoardId ? "active" : ""}" data-board="${b.id}">${escapeHtml(b.title)}</button>`
      )
      .join("");
    const canUndo = !!this._data?.can_undo;
    const canRedo = !!this._data?.can_redo;
    const tb = this.shadowRoot.getElementById("toolbar");
    tb.innerHTML = `
      <span class="hk-title">📋 Hakanban</span>
      <div class="hk-board-tabs">${tabs}
        <button class="hk-iconbtn" id="add-board" title="New board">+</button>
      </div>
      <button class="hk-iconbtn" id="undo-btn" title="Undo (Ctrl/⌘+Z)" ${canUndo ? "" : "disabled"}>↶</button>
      <button class="hk-iconbtn" id="redo-btn" title="Redo (Ctrl/⌘+Shift+Z)" ${canRedo ? "" : "disabled"}>↷</button>
      <input class="hk-search" id="search" type="search" placeholder="Search cards…" value="${escapeHtml(this._query)}">
      <button class="hk-iconbtn" id="filter-btn" title="Filter by label">⚑</button>
      <button class="hk-iconbtn" id="edit-board" title="Rename board">✎</button>
      <button class="hk-iconbtn" id="del-board" title="Delete board">🗑</button>
      <button class="hk-iconbtn" id="opts-btn" title="Display options">⚙</button>`;

    tb.querySelector("#undo-btn").addEventListener("click", () => this._api.undo());
    tb.querySelector("#redo-btn").addEventListener("click", () => this._api.redo());

    tb.querySelectorAll("[data-board]").forEach((el) => {
      el.addEventListener("click", () => {
        // Nothing to do when re-selecting the active tab; skip the re-render.
        if (el.dataset.board === this._activeBoardId) return;
        this._activeBoardId = el.dataset.board;
        localStorage.setItem("hakanban_active_board", el.dataset.board);
        this._activeLabels.clear();
        this._renderToolbar();
        this._renderBoard();
      });
    });

    tb.querySelector("#add-board").addEventListener("click", async () => {
      const board = await this._api.createBoard("New Board");
      this._activeBoardId = board.id;
      localStorage.setItem("hakanban_active_board", board.id);
    });
    tb.querySelector("#edit-board").addEventListener("click", () => {
      const board = this._activeBoard();
      if (board) openRenameDialog(this.shadowRoot, board, this._api);
    });
    tb.querySelector("#del-board").addEventListener("click", () => {
      const board = this._activeBoard();
      if (board && confirm(`Delete board "${board.title}" and all its cards?`))
        this._api.deleteBoard(board.id);
    });
    tb.querySelector("#filter-btn").addEventListener("click", () => {
      this._showFilter = !this._showFilter;
      this._renderFilterbar();
    });
    tb.querySelector("#opts-btn").addEventListener("click", () => {
      const board = this._activeBoard();
      openOptionsDialog(this.shadowRoot, this._displayOpts, board, this._api, (opts) => {
        if (this._boardEl) this._boardEl.displayOpts = opts;
      });
    });

    const search = tb.querySelector("#search");
    const apply = debounce(() => {
      this._query = search.value;
      this._applyFilter();
    }, 150);
    search.addEventListener("input", apply);

    this._renderFilterbar();
  }

  _renderFilterbar() {
    const bar = this.shadowRoot.getElementById("filterbar");
    const board = this._activeBoard();
    if (!board) { bar.innerHTML = ""; return; }
    if (!this._showFilter) { bar.innerHTML = ""; return; }
    const chips = (board.labels || [])
      .map(
        (l) =>
          `<span class="hk-label-chip ${this._activeLabels.has(l.id) ? "selected" : ""}" data-flabel="${l.id}" style="background:${l.color};color:${contrastText(l.color)}">${escapeHtml(l.name || "·")}</span>`
      )
      .join("");
    bar.innerHTML = `<div class="hk-row" style="padding:8px 16px;border-bottom:1px solid var(--hk-divider)"><strong style="margin-right:6px">Labels:</strong>${chips || "<em>No labels yet</em>"} <button class="hk-btn secondary" data-clearf>Clear</button></div>`;

    bar.querySelectorAll("[data-flabel]").forEach((el) =>
      el.addEventListener("click", () => {
        const id = el.dataset.flabel;
        this._activeLabels.has(id) ? this._activeLabels.delete(id) : this._activeLabels.add(id);
        this._renderFilterbar();
        this._applyFilter();
      })
    );
    const clearf = bar.querySelector("[data-clearf]");
    if (clearf) clearf.addEventListener("click", () => { this._activeLabels.clear(); this._renderFilterbar(); this._applyFilter(); });
  }

  _applyFilter() {
    if (this._boardEl) this._boardEl.filter = { query: this._query, labels: this._activeLabels };
  }

  _renderBoard() {
    const board = this._activeBoard();
    if (!this._boardEl) return;
    if (!board) {
      this._boardEl.board = null;
      return;
    }
    this._boardEl.filter = { query: this._query, labels: this._activeLabels };
    this._boardEl.board = board;
  }
}

if (!customElements.get("hakanban-panel")) {
  customElements.define("hakanban-panel", HakanbanPanel);
}
