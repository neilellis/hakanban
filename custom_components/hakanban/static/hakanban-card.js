// <hakanban-card> — embed a Hakanban board inside a Lovelace dashboard.
// Config: { type: "custom:hakanban-card", board: "<id or title>", title?, height? }

import { HakanbanApi } from "./api.js";
import { escapeHtml } from "./util.js";
import "./board-view.js";

class HakanbanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
  }

  setConfig(config) {
    this._config = config || {};
    this._built = false;
  }

  getCardSize() {
    return 8;
  }

  static getStubConfig() {
    return { board: "" };
  }

  set hass(hass) {
    this._hass = hass;
    if (!this._api) {
      this._api = new HakanbanApi(hass);
      this._build();
      this._unsub = this._api.subscribe((payload) => {
        this._data = payload;
        this._update();
      });
    } else {
      this._api.setHass(hass);
      if (this._boardEl) this._boardEl.hass = hass;
    }
  }

  disconnectedCallback() {
    if (this._unsub) this._unsub.then((u) => u && u()).catch(() => {});
  }

  _resolveBoard() {
    const boards = this._data?.boards || [];
    const want = (this._config.board || "").toLowerCase();
    if (!want) return boards[0] || null;
    return (
      boards.find((b) => b.id === this._config.board) ||
      boards.find((b) => (b.title || "").toLowerCase() === want) ||
      null
    );
  }

  _build() {
    const height = this._config.height || "600px";
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { overflow: hidden; }
        .head { padding: 12px 16px 0; font-size: 1.1rem; font-weight: 600; }
        .host { height: ${height}; display: flex; }
        hakanban-board { flex: 1; min-width: 0; }
      </style>
      <ha-card>
        ${this._config.title ? `<div class="head">${escapeHtml(this._config.title)}</div>` : ""}
        <div class="host"></div>
      </ha-card>`;
    this._boardEl = document.createElement("hakanban-board");
    this._boardEl.api = this._api;
    this._boardEl.hass = this._hass;
    this.shadowRoot.querySelector(".host").appendChild(this._boardEl);
    this._built = true;
  }

  _update() {
    if (!this._boardEl) return;
    this._boardEl.board = this._resolveBoard();
  }
}

if (!customElements.get("hakanban-card")) {
  customElements.define("hakanban-card", HakanbanCard);
}

window.customCards = window.customCards || [];
if (!window.customCards.find((c) => c.type === "hakanban-card")) {
  window.customCards.push({
    type: "hakanban-card",
    name: "Hakanban Board",
    description: "Embed a Hakanban Kanban board on a dashboard.",
    preview: false,
    documentationURL: "https://github.com/neilellis/hakanban",
  });
}
