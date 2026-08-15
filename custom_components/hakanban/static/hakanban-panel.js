// <hakanban-panel> — the full-page sidebar app. Home Assistant injects `hass`.

import { STYLES } from "./styles.js";
import { HakanbanApi } from "./api.js";
import { escapeHtml, contrastText, debounce } from "./util.js";
import "./board-view.js";

const BACKGROUNDS = [
  "", "#0079bf", "#519839", "#b04632", "#89609e", "#cd5a91",
  "#4bbf6b", "#00aecc", "#838c91",
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
];

export class HakanbanPanel extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._activeBoardId = localStorage.getItem("hakanban_active_board") || null;
    this._query = "";
    this._activeLabels = new Set();
    this._showFilter = false;
    this._showBg = false;
    this._built = false;
    this._displayOpts = JSON.parse(localStorage.getItem("hakanban_display_opts") || "{}");
    // Defaults: everything on (current behaviour).
    this._displayOpts.showBadges = this._displayOpts.showBadges !== false;
    this._displayOpts.showCardNumber = this._displayOpts.showCardNumber !== false;
    this._displayOpts.compact = this._displayOpts.compact === true;
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
      <button class="hk-iconbtn" id="bg-btn" title="Board background">🎨</button>
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
      if (board) this._openRenameDialog(board.id);
    });
    tb.querySelector("#del-board").addEventListener("click", () => {
      const board = this._activeBoard();
      if (board && confirm(`Delete board "${board.title}" and all its cards?`))
        this._api.deleteBoard(board.id);
    });
    tb.querySelector("#filter-btn").addEventListener("click", () => {
      this._showFilter = !this._showFilter;
      this._showBg = false;
      this._renderFilterbar();
    });
    tb.querySelector("#bg-btn").addEventListener("click", () => {
      this._showBg = !this._showBg;
      this._showFilter = false;
      this._renderFilterbar();
    });
    tb.querySelector("#opts-btn").addEventListener("click", () => this._openOptionsDialog());

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
    let html = "";
    if (this._showFilter) {
      const chips = (board.labels || [])
        .map(
          (l) =>
            `<span class="hk-label-chip ${this._activeLabels.has(l.id) ? "selected" : ""}" data-flabel="${l.id}" style="background:${l.color};color:${contrastText(l.color)}">${escapeHtml(l.name || "·")}</span>`
        )
        .join("");
      html = `<div class="hk-row" style="padding:8px 16px;border-bottom:1px solid var(--hk-divider)"><strong style="margin-right:6px">Labels:</strong>${chips || "<em>No labels yet</em>"} <button class="hk-btn secondary" data-clearf>Clear</button></div>`;
    } else if (this._showBg) {
      const sw = BACKGROUNDS.map(
        (bg) =>
          `<span data-bg="${bg}" title="${bg || "None"}" style="display:inline-block;width:28px;height:28px;border-radius:6px;cursor:pointer;border:1px solid var(--hk-divider);background:${bg || "var(--card-background-color)"}"></span>`
      ).join("");
      html = `<div class="hk-row" style="padding:8px 16px;border-bottom:1px solid var(--hk-divider)"><strong style="margin-right:6px">Background:</strong>${sw}</div>`;
    }
    bar.innerHTML = html;

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
    bar.querySelectorAll("[data-bg]").forEach((el) =>
      el.addEventListener("click", () => this._api.updateBoard(board.id, { background: el.dataset.bg || null }))
    );
  }

  _applyFilter() {
    if (this._boardEl) this._boardEl.filter = { query: this._query, labels: this._activeLabels };
  }

  // Modal rename, opened from the toolbar's ✎ button (keeps tab clicks for
  // switching boards only, and avoids inline-edit clashes with re-render).
  _openRenameDialog(boardId) {
    const board = (this._data?.boards || []).find((b) => b.id === boardId);
    if (!board) return;
    this.shadowRoot.querySelector(".hk-dialog-back")?.remove(); // one at a time

    const back = document.createElement("div");
    back.className = "hk-modal-back hk-dialog-back";
    back.innerHTML = `
      <div class="hk-modal hk-dialog" role="dialog" aria-modal="true" style="width:min(420px,100%)">
        <h2>Rename board</h2>
        <div class="hk-row" style="margin-top:12px">
          <input type="text" id="hk-rename-input" style="flex:1" value="${escapeHtml(board.title)}" maxlength="120">
        </div>
        <div class="hk-modal-actions">
          <span class="grow"></span>
          <button class="hk-btn secondary" id="hk-rename-cancel">Cancel</button>
          <button class="hk-btn" id="hk-rename-save">Save</button>
        </div>
      </div>`;
    this.shadowRoot.appendChild(back);

    const input = back.querySelector("#hk-rename-input");
    const close = () => back.remove();
    const save = () => {
      const v = input.value.trim();
      if (v && v !== board.title) this._api.updateBoard(boardId, { title: v });
      close();
    };
    back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
    back.querySelector("#hk-rename-cancel").addEventListener("click", close);
    back.querySelector("#hk-rename-save").addEventListener("click", save);
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); save(); }
      else if (e.key === "Escape") { e.preventDefault(); close(); }
    });
    input.focus();
    input.select();
  }

  _openOptionsDialog() {
    this.shadowRoot.querySelector(".hk-dialog-back")?.remove(); // one at a time

    const opts = this._displayOpts;
    const row = (key, label) =>
      `<label class="hk-opt-row"><input type="checkbox" id="hk-opt-${key}" ${opts[key] ? "checked" : ""}><span>${label}</span></label>`;

    const back = document.createElement("div");
    back.className = "hk-modal-back hk-dialog-back";
    back.innerHTML = `
      <div class="hk-modal hk-dialog" role="dialog" aria-modal="true" style="width:min(420px,100%)">
        <h2>Display options</h2>
        <div style="display:flex;flex-direction:column;gap:10px;margin-top:12px">
          ${row("showBadges", "Show badges (due, comments, checks, assignees)")}
          ${row("showCardNumber", "Show card numbers (#1, #2, …)")}
          ${row("compact", "Compact mode (smaller cards, less padding)")}
        </div>
        <div class="hk-modal-actions">
          <span class="grow"></span>
          <button class="hk-btn secondary" id="hk-opts-cancel">Cancel</button>
          <button class="hk-btn" id="hk-opts-save">Save</button>
        </div>
      </div>`;
    this.shadowRoot.appendChild(back);

    const close = () => back.remove();
    const save = () => {
      for (const key of ["showBadges", "showCardNumber", "compact"]) {
        opts[key] = back.querySelector(`#hk-opt-${key}`).checked;
      }
      localStorage.setItem("hakanban_display_opts", JSON.stringify(opts));
      if (this._boardEl) this._boardEl.displayOpts = opts;
      close();
    };
    back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
    back.querySelector("#hk-opts-cancel").addEventListener("click", close);
    back.querySelector("#hk-opts-save").addEventListener("click", save);
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
