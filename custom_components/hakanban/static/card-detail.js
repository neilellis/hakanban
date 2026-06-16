// <hakanban-card-detail> — the full card modal. Self-contained; talks to the API
// directly and relies on the live subscription to refresh the board behind it.

import { STYLES } from "./styles.js";
import {
  escapeHtml,
  renderMarkdown,
  formatDue,
  contrastText,
} from "./util.js";

const PALETTE = ["#61bd4f", "#f2d600", "#ff9f1a", "#eb5a46", "#c377e0", "#0079bf", "#00c2e0", "#51e898", "#ff78cb", "#344563"];

export class HakanbanCardDetail extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: "open" });
    this._editingDesc = false;
  }

  setContext({ card, board, api, onClose }) {
    this._card = card;
    this._board = board;
    this._api = api;
    this._onClose = onClose;
    this.render();
  }

  // Called by the parent when fresh board data arrives.
  update(card, board) {
    this._card = card;
    this._board = board;
    if (card) this.render();
    else this._close();
  }

  _close() {
    if (this._onClose) this._onClose();
    this.remove();
  }

  render() {
    const c = this._card;
    const b = this._board;
    if (!c) return;
    const labelById = Object.fromEntries((b.labels || []).map((l) => [l.id, l]));
    const selected = new Set(c.labels || []);

    const labelsHtml = (b.labels || [])
      .map((l) => {
        const text = contrastText(l.color);
        const sel = selected.has(l.id) ? "selected" : "";
        return `<span class="hk-label-chip ${sel}" data-label="${l.id}" style="background:${l.color};color:${text}">${escapeHtml(l.name || "·")}</span>`;
      })
      .join("");

    const checklistsHtml = (c.checklists || [])
      .map((cl) => {
        const total = cl.items.length;
        const done = cl.items.filter((i) => i.done).length;
        const items = cl.items
          .map(
            (i) =>
              `<label class="hk-check-item ${i.done ? "done" : ""}"><input type="checkbox" data-check="${cl.id}:${i.id}" ${i.done ? "checked" : ""}><span>${escapeHtml(i.text)}</span></label>`
          )
          .join("");
        return `<div class="hk-section"><h3>${escapeHtml(cl.title)} (${done}/${total})</h3>${items}
          <div class="hk-row"><input type="text" class="hk-add-check" data-cl="${cl.id}" placeholder="Add an item…"></div></div>`;
      })
      .join("");

    const commentsHtml = (c.comments || [])
      .slice()
      .reverse()
      .map(
        (cm) =>
          `<div class="hk-comment"><span class="who">${escapeHtml(cm.author)}</span><span class="when">${formatDue(cm.ts)}</span><div>${escapeHtml(cm.text)}</div></div>`
      )
      .join("");

    const columnsOptions = (b.columns || [])
      .map((col) => `<option value="${col.id}" ${col.id === c.column_id ? "selected" : ""}>${escapeHtml(col.title)}</option>`)
      .join("");

    const dueLocal = c.due ? String(c.due).slice(0, 16) : "";

    this.shadowRoot.innerHTML = `
      <style>${STYLES}</style>
      <div class="hk-modal-back">
        <div class="hk-modal" role="dialog" aria-modal="true">
          <h2><textarea class="hk-title-edit" rows="1">${escapeHtml(c.title)}</textarea></h2>
          <div class="hk-meta">#${c.number} · in <strong>${escapeHtml((b.columns.find((x) => x.id === c.column_id) || {}).title || "")}</strong></div>

          <div class="hk-section">
            <h3>Labels</h3>
            <div class="hk-label-row">${labelsHtml}
              <span class="hk-label-chip" id="hk-add-label" style="background:var(--hk-divider);color:var(--hk-text)">+ New</span>
            </div>
            <div class="hk-row" id="hk-new-label" style="display:none;margin-top:8px">
              <input type="text" id="hk-label-name" placeholder="Label name">
              <span id="hk-label-palette"></span>
            </div>
          </div>

          <div class="hk-section">
            <h3>Due date</h3>
            <div class="hk-row">
              <input type="datetime-local" id="hk-due" value="${dueLocal}">
              <label><input type="checkbox" id="hk-due-complete" ${c.due_complete ? "checked" : ""}> Complete</label>
              <button class="hk-btn secondary" id="hk-due-clear">Clear</button>
            </div>
          </div>

          <div class="hk-section">
            <h3>Description</h3>
            ${
              this._editingDesc
                ? `<textarea class="hk-desc-edit" id="hk-desc">${escapeHtml(c.description || "")}</textarea>
                   <div class="hk-row" style="margin-top:6px"><button class="hk-btn" id="hk-desc-save">Save</button><button class="hk-btn secondary" id="hk-desc-cancel">Cancel</button></div>`
                : `<div class="hk-desc-render" id="hk-desc-render">${renderMarkdown(c.description) || '<span style="color:var(--hk-subtle)">Add a more detailed description…</span>'}</div>`
            }
          </div>

          ${checklistsHtml}
          <div class="hk-row"><button class="hk-btn secondary" id="hk-add-checklist">+ Add checklist</button></div>

          <div class="hk-section">
            <h3>Activity</h3>
            <div class="hk-row"><input type="text" id="hk-comment" placeholder="Write a comment…" style="flex:1"><button class="hk-btn" id="hk-comment-add">Comment</button></div>
            ${commentsHtml}
          </div>

          <div class="hk-modal-actions">
            <span class="hk-row grow">Move to <select id="hk-move">${columnsOptions}</select></span>
            <button class="hk-btn secondary" id="hk-archive">${c.archived ? "Unarchive" : "Archive"}</button>
            <button class="hk-btn hk-danger" id="hk-delete">Delete</button>
            <button class="hk-btn" id="hk-close">Close</button>
          </div>
        </div>
      </div>`;

    this._wire();
  }

  _wire() {
    const root = this.shadowRoot;
    const c = this._card;
    const api = this._api;
    const $ = (sel) => root.querySelector(sel);

    $(".hk-modal-back").addEventListener("mousedown", (e) => {
      if (e.target.classList.contains("hk-modal-back")) this._close();
    });
    $("#hk-close").addEventListener("click", () => this._close());

    const titleEl = $(".hk-title-edit");
    const saveTitle = () => {
      const v = titleEl.value.trim();
      if (v && v !== c.title) api.updateCard(c.id, { title: v });
    };
    titleEl.addEventListener("blur", saveTitle);
    titleEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter") { e.preventDefault(); titleEl.blur(); }
    });

    root.querySelectorAll(".hk-label-chip[data-label]").forEach((chip) => {
      chip.addEventListener("click", () => {
        const id = chip.dataset.label;
        const labels = new Set(c.labels || []);
        labels.has(id) ? labels.delete(id) : labels.add(id);
        api.updateCard(c.id, { labels: [...labels] });
      });
    });

    // New label
    const addLabel = $("#hk-add-label");
    const newLabelRow = $("#hk-new-label");
    addLabel.addEventListener("click", () => {
      newLabelRow.style.display = newLabelRow.style.display === "none" ? "flex" : "none";
    });
    const palette = $("#hk-label-palette");
    PALETTE.forEach((color) => {
      const sw = document.createElement("span");
      sw.className = "hk-label-chip";
      sw.style.background = color;
      sw.style.width = "26px";
      sw.style.cursor = "pointer";
      sw.title = color;
      sw.addEventListener("click", async () => {
        const name = $("#hk-label-name").value.trim();
        await api.createLabel(this._board.id, name, color);
      });
      palette.appendChild(sw);
    });

    // Due
    $("#hk-due").addEventListener("change", (e) => {
      const v = e.target.value;
      api.updateCard(c.id, { due: v ? v + ":00" : null });
    });
    $("#hk-due-complete").addEventListener("change", (e) =>
      api.updateCard(c.id, { due_complete: e.target.checked })
    );
    $("#hk-due-clear").addEventListener("click", () =>
      api.updateCard(c.id, { due: null, due_complete: false })
    );

    // Description
    if (this._editingDesc) {
      $("#hk-desc-save").addEventListener("click", () => {
        this._editingDesc = false;
        api.updateCard(c.id, { description: $("#hk-desc").value });
      });
      $("#hk-desc-cancel").addEventListener("click", () => {
        this._editingDesc = false;
        this.render();
      });
    } else {
      $("#hk-desc-render").addEventListener("click", () => {
        this._editingDesc = true;
        this.render();
      });
    }

    // Checklists
    $("#hk-add-checklist").addEventListener("click", async () => {
      await api.addChecklist(c.id, "Checklist");
    });
    root.querySelectorAll("input[data-check]").forEach((cb) => {
      cb.addEventListener("change", () => {
        const [clId, itemId] = cb.dataset.check.split(":");
        api.toggleCheckItem(c.id, clId, itemId, cb.checked);
      });
    });
    root.querySelectorAll(".hk-add-check").forEach((inp) => {
      inp.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && inp.value.trim()) {
          api.addCheckItem(c.id, inp.dataset.cl, inp.value.trim());
          inp.value = "";
        }
      });
    });

    // Comments
    const commentInput = $("#hk-comment");
    const sendComment = () => {
      if (commentInput.value.trim()) {
        api.addComment(c.id, commentInput.value.trim());
        commentInput.value = "";
      }
    };
    $("#hk-comment-add").addEventListener("click", sendComment);
    commentInput.addEventListener("keydown", (e) => {
      if (e.key === "Enter") sendComment();
    });

    // Actions
    $("#hk-move").addEventListener("change", (e) =>
      api.moveCard(c.id, e.target.value)
    );
    $("#hk-archive").addEventListener("click", () =>
      api.updateCard(c.id, { archived: !c.archived })
    );
    $("#hk-delete").addEventListener("click", () => {
      api.deleteCard(c.id);
      this._close();
    });
  }
}

if (!customElements.get("hakanban-card-detail")) {
  customElements.define("hakanban-card-detail", HakanbanCardDetail);
}
