// <hakanban-board> — renders one board (columns + cards) with native drag & drop.
// Used by both the full-page panel and the embeddable Lovelace card.
// Card rendering lives in card-render.js; DnD wiring lives in dnd.js.

import { STYLES } from "./styles.js";
import { HakanbanCardDetail } from "./card-detail.js";
import { escapeHtml } from "./util.js";
import { normalizeDisplayOpts } from "./display-opts.js";
import { cardHtml } from "./card-render.js";
import { wireDnD } from "./dnd.js";

export class HakanbanBoard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._composer = { openCol: null, value: "" };
    this._addCol = { open: false, value: "" };
    this._filter = { query: "", labels: new Set() };
    this._openCardId = null;
    this._modal = null;
    this._displayOpts = normalizeDisplayOpts({});
  }

  set api(api) {
    this._api = api;
  }
  set hass(hass) {
    this._hass = hass;
  }
  set filter(f) {
    this._filter = { query: (f.query || "").toLowerCase(), labels: f.labels || new Set() };
    this.render();
  }
  set displayOpts(o) {
    this._displayOpts = normalizeDisplayOpts(o);
    this.render();
  }
  set board(b) {
    this._board = b;
    this.render();
    this._syncModal();
  }
  get board() {
    return this._board;
  }

  _cardVisible(card) {
    const { query, labels } = this._filter;
    if (labels.size && !(card.labels || []).some((l) => labels.has(l))) return false;
    if (query) {
      const hay = `${card.title} ${card.description || ""} #${card.number}`.toLowerCase();
      if (!hay.includes(query)) return false;
    }
    return true;
  }

  _columnHtml(col, labelById) {
    const cards = (col.cards || []).filter((c) => this._cardVisible(c));
    const cardsHtml = cards.map((c) => cardHtml(c, labelById, this._displayOpts)).join("");
    const composerOpen = this._composer.openCol === col.id;
    const footer = composerOpen
      ? `<div class="hk-composer">
           <textarea data-composer="${col.id}" placeholder="Enter a title… (paste multiple lines for multiple cards)"></textarea>
           <div class="hk-composer-actions">
             <button class="hk-btn" data-add="${col.id}">Add card</button>
             <button class="hk-btn secondary" data-cancel="${col.id}">✕</button>
           </div>
         </div>`
      : `<div class="hk-composer"><button class="hk-btn secondary hk-addcard" data-open="${col.id}">+ Add a card</button></div>`;

    return `
      <div class="hk-col" data-col="${col.id}">
        <div class="hk-col-head" draggable="true" data-colhead="${col.id}">
          <span class="hk-col-title" data-coltitle="${col.id}">${escapeHtml(col.title)}</span>
          <span class="hk-col-count">${cards.length}</span>
          <button class="hk-col-menu" data-colmenu="${col.id}" title="Delete list">🗑</button>
        </div>
        <div class="hk-cards" data-cards="${col.id}">${cardsHtml}</div>
        ${footer}
      </div>`;
  }

  render() {
    if (!this._board) {
      this.shadowRoot.innerHTML = `<style>${STYLES}</style><div class="hk-empty">No board.</div>`;
      return;
    }
    const b = this._board;
    const labelById = Object.fromEntries((b.labels || []).map((l) => [l.id, l]));
    const cols = (b.columns || []).map((c) => this._columnHtml(c, labelById)).join("");
    const addCol = this._addCol.open
      ? `<div class="hk-add-col"><div class="hk-composer"><textarea data-addcol placeholder="List title…"></textarea>
           <div class="hk-composer-actions"><button class="hk-btn" data-addcol-go>Add list</button>
           <button class="hk-btn secondary" data-addcol-cancel>✕</button></div></div></div>`
      : `<div class="hk-add-col"><button data-addcol-open>+ Add a list</button></div>`;

    const bg = b.background ? `style="background:${escapeHtml(b.background)}"` : "";
    const compactCls = this._displayOpts.compact ? "compact" : "";
    this.shadowRoot.innerHTML = `<style>${STYLES}</style>
      <div class="hk-board ${compactCls}" data-board ${bg}>${cols}${addCol}</div>`;

    this._wire();
    this._restoreComposer();
  }

  _restoreComposer() {
    if (this._composer.openCol) {
      const ta = this.shadowRoot.querySelector(`textarea[data-composer="${this._composer.openCol}"]`);
      if (ta) {
        ta.value = this._composer.value;
        ta.focus();
      }
    }
    if (this._addCol.open) {
      const ta = this.shadowRoot.querySelector("textarea[data-addcol]");
      if (ta) {
        ta.value = this._addCol.value;
        ta.focus();
      }
    }
  }

  _wire() {
    const root = this.shadowRoot;
    const api = this._api;
    const boardId = this._board.id;
    const boardEl = root.querySelector("[data-board]");

    // --- inline checklist toggles (must run before the card-click handler so
    //     we can stopPropagation and keep the detail modal from opening) ---
    root.querySelectorAll(".hk-card-checks input[data-check]").forEach((cb) => {
      cb.addEventListener("click", (e) => e.stopPropagation());
      cb.addEventListener("change", () => {
        const cardEl = cb.closest(".hk-card");
        const cardId = cardEl ? cardEl.dataset.card : null;
        const [clId, itemId] = cb.dataset.check.split(":");
        if (cardId) api.toggleCheckItem(cardId, clId, itemId, cb.checked);
      });
    });

    // --- card click -> open modal (suppress if a drag just happened) ---
    root.querySelectorAll(".hk-card").forEach((el) => {
      el.addEventListener("click", () => {
        if (this._justDragged) return;
        this._openCard(el.dataset.card);
      });
    });

    // --- drag & drop (delegated to dnd.js) ---
    wireDnD(root, api, boardId, boardEl, () => {
      this._justDragged = true;
      setTimeout(() => (this._justDragged = false), 50);
    });

    // --- column title rename ---
    root.querySelectorAll("[data-coltitle]").forEach((el) => {
      el.addEventListener("dblclick", () => {
        el.setAttribute("contenteditable", "true");
        el.focus();
      });
      el.addEventListener("blur", () => {
        el.removeAttribute("contenteditable");
        const v = el.textContent.trim();
        const col = this._board.columns.find((c) => c.id === el.dataset.coltitle);
        if (v && col && v !== col.title) api.updateColumn(boardId, el.dataset.coltitle, { title: v });
      });
      el.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); el.blur(); }
      });
    });
    root.querySelectorAll("[data-colmenu]").forEach((el) =>
      el.addEventListener("click", () => {
        if (confirm("Delete this list and its cards?")) api.deleteColumn(boardId, el.dataset.colmenu);
      })
    );

    // --- card composer ---
    root.querySelectorAll("[data-open]").forEach((btn) =>
      btn.addEventListener("click", () => {
        this._composer = { openCol: btn.dataset.open, value: "" };
        this.render();
      })
    );
    root.querySelectorAll("[data-cancel]").forEach((btn) =>
      btn.addEventListener("click", () => {
        this._composer = { openCol: null, value: "" };
        this.render();
      })
    );
    root.querySelectorAll("textarea[data-composer]").forEach((ta) => {
      ta.addEventListener("input", () => (this._composer.value = ta.value));
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          this._submitCards(ta.dataset.composer, ta.value);
        }
      });
    });
    root.querySelectorAll("[data-add]").forEach((btn) =>
      btn.addEventListener("click", () => {
        const ta = root.querySelector(`textarea[data-composer="${btn.dataset.add}"]`);
        this._submitCards(btn.dataset.add, ta.value);
      })
    );

    // --- add column ---
    const open = root.querySelector("[data-addcol-open]");
    if (open) open.addEventListener("click", () => { this._addCol = { open: true, value: "" }; this.render(); });
    const addTa = root.querySelector("textarea[data-addcol]");
    if (addTa) {
      addTa.addEventListener("input", () => (this._addCol.value = addTa.value));
      addTa.addEventListener("keydown", (e) => {
        if (e.key === "Enter") { e.preventDefault(); this._submitColumn(addTa.value); }
      });
    }
    const go = root.querySelector("[data-addcol-go]");
    if (go) go.addEventListener("click", () => this._submitColumn(root.querySelector("textarea[data-addcol]").value));
    const cancel = root.querySelector("[data-addcol-cancel]");
    if (cancel) cancel.addEventListener("click", () => { this._addCol = { open: false, value: "" }; this.render(); });
  }

  _submitCards(colId, value) {
    const lines = value.split("\n").map((l) => l.trim()).filter(Boolean);
    if (!lines.length) return;
    if (lines.length === 1) this._api.createCard(this._board.id, colId, lines[0]);
    else this._api.pasteCards(this._board.id, colId, lines);
    // keep composer open for rapid entry
    this._composer = { openCol: colId, value: "" };
    this.render();
  }

  _submitColumn(value) {
    const title = value.trim();
    if (title) this._api.createColumn(this._board.id, title);
    this._addCol = { open: true, value: "" };
    this.render();
  }

  _openCard(cardId) {
    this._openCardId = cardId;
    const card = this._findCard(cardId);
    if (!card) return;
    if (!this._modal) {
      this._modal = new HakanbanCardDetail();
      document.body.appendChild(this._modal);
    }
    this._modal.setContext({
      card,
      board: this._board,
      api: this._api,
      onClose: () => {
        this._openCardId = null;
        this._modal = null;
      },
    });
  }

  _findCard(cardId) {
    for (const col of this._board.columns || []) {
      const found = (col.cards || []).find((c) => c.id === cardId);
      if (found) return found;
    }
    return null;
  }

  _syncModal() {
    if (!this._openCardId || !this._modal) return;
    this._modal.update(this._findCard(this._openCardId), this._board);
  }
}

if (!customElements.get("hakanban-board")) {
  customElements.define("hakanban-board", HakanbanBoard);
}
