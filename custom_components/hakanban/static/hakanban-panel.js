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
  }

  async _start() {
    this._build();
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
    this.shadowRoot.getElementById("host").appendChild(this._boardEl);
    this._built = true;
  }

  _renderToolbar() {
    const boards = this._data?.boards || [];
    const tabs = boards
      .map(
        (b) =>
          `<button class="hk-tab ${b.id === this._activeBoardId ? "active" : ""}" data-board="${b.id}" data-tabtitle title="Double-click to rename">${escapeHtml(b.title)}</button>`
      )
      .join("");
    const tb = this.shadowRoot.getElementById("toolbar");
    tb.innerHTML = `
      <span class="hk-title">📋 Hakanban</span>
      <div class="hk-board-tabs">${tabs}
        <button class="hk-iconbtn" id="add-board" title="New board">+</button>
      </div>
      <input class="hk-search" id="search" type="search" placeholder="Search cards…" value="${escapeHtml(this._query)}">
      <button class="hk-iconbtn" id="filter-btn" title="Filter by label">⚑</button>
      <button class="hk-iconbtn" id="bg-btn" title="Board background">🎨</button>
      <button class="hk-iconbtn" id="del-board" title="Delete board">🗑</button>`;

    const boardById = (id) => (this._data?.boards || []).find((b) => b.id === id);
    tb.querySelectorAll("[data-board]").forEach((el) => {
      el.addEventListener("click", () => {
        // While renaming, or when re-selecting the already-active tab, skip the
        // re-render: rebuilding the toolbar would replace this element mid
        // double-click and the contenteditable edit would be lost.
        if (el.isContentEditable || el.dataset.board === this._activeBoardId) return;
        this._activeBoardId = el.dataset.board;
        localStorage.setItem("hakanban_active_board", el.dataset.board);
        this._activeLabels.clear();
        this._renderToolbar();
        this._renderBoard();
      });
      el.addEventListener("dblclick", () => {
        el.setAttribute("contenteditable", "true");
        el.focus();
      });
      el.addEventListener("blur", () => {
        el.removeAttribute("contenteditable");
        const v = el.textContent.trim();
        const board = boardById(el.dataset.board);
        if (v && board && v !== board.title) this._api.updateBoard(el.dataset.board, { title: v });
        else if (board) el.textContent = board.title; // revert empty / unchanged edits
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); el.blur(); }
        else if (e.key === "Escape") {
          e.preventDefault();
          const board = boardById(el.dataset.board);
          if (board) el.textContent = board.title;
          el.blur();
        }
      });
    });

    tb.querySelector("#add-board").addEventListener("click", async () => {
      const board = await this._api.createBoard("New Board");
      this._activeBoardId = board.id;
      localStorage.setItem("hakanban_active_board", board.id);
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
