// <hakanban-card> — embed a Hakanban board inside a Lovelace dashboard.
// Config: { type: "custom:hakanban-card", board: "<id or title>", title?, height? }
//
// The card embeds a full <hakanban-panel> so the toolbar (board tabs,
// undo/redo, search, filter, background, rename, delete) is available
// inside the dashboard, not just in the sidebar panel.

import { HakanbanApi } from "./api.js";
import { escapeHtml } from "./util.js";
import "./hakanban-panel.js";

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
    if (!this._built) this._build();
    if (this._panelEl) this._panelEl.hass = hass;
  }

  disconnectedCallback() {
    // The panel handles its own unsubscribe on disconnect.
  }

  _build() {
    const height = this._config.height || "600px";
    this.shadowRoot.innerHTML = `
      <style>
        ha-card { overflow: hidden; }
        .head { padding: 12px 16px 0; font-size: 1.1rem; font-weight: 600; }
        .host { height: ${height}; display: flex; }
        hakanban-panel { flex: 1; min-width: 0; }
      </style>
      <ha-card>
        ${this._config.title ? `<div class="head">${escapeHtml(this._config.title)}</div>` : ""}
        <div class="host"></div>
      </ha-card>`;
    this._panelEl = document.createElement("hakanban-panel");
    this._panelEl.initialBoard = this._config.board || null;
    this.shadowRoot.querySelector(".host").appendChild(this._panelEl);
    if (this._hass) this._panelEl.hass = this._hass;
    this._built = true;
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
