// Modal dialogs — extracted from hakanban-panel.js.
// Each function appends a modal to the given shadow root and returns nothing.
// Only one dialog is shown at a time; calling either removes any existing one.

import { escapeHtml } from "./util.js";
import { DISPLAY_OPTS, saveDisplayOpts } from "./display-opts.js";

// Open a rename-board dialog. `board` is the board object, `api` is the
// HakanbanApi instance. Calls api.updateBoard on save.
export function openRenameDialog(shadowRoot, board, api) {
  shadowRoot.querySelector(".hk-dialog-back")?.remove();

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
  shadowRoot.appendChild(back);

  const input = back.querySelector("#hk-rename-input");
  const close = () => back.remove();
  const save = () => {
    const v = input.value.trim();
    if (v && v !== board.title) api.updateBoard(board.id, { title: v });
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

// Open the display-options dialog. `opts` is the current display options
// object (mutated in place on save). `onSave` is called with the updated
// opts after the user clicks Save.
export function openOptionsDialog(shadowRoot, opts, onSave) {
  shadowRoot.querySelector(".hk-dialog-back")?.remove();

  const rows = DISPLAY_OPTS
    .map((o) => {
      const main = `<label class="hk-opt-row"><input type="checkbox" id="hk-opt-${o.key}" ${opts[o.key] ? "checked" : ""}><span>${escapeHtml(o.label)}</span></label>`;
      const kids = (o.children || [])
        .map((ch) => `<label class="hk-opt-row hk-opt-sub"><input type="checkbox" id="hk-opt-${ch.key}" ${opts[ch.key] ? "checked" : ""}><span>${escapeHtml(ch.label)}</span></label>`)
        .join("");
      return main + kids;
    })
    .join("");

  const back = document.createElement("div");
  back.className = "hk-modal-back hk-dialog-back";
  back.innerHTML = `
      <div class="hk-modal hk-dialog" role="dialog" aria-modal="true" style="width:min(440px,100%)">
        <h2>Display options</h2>
        <div class="hk-opt-help" title="Checked items are shown on the card face. Everything is still visible in the card detail regardless of these settings.">
          Checked items are shown on the card. Everything is still available in the card detail.
        </div>
        <h3 class="hk-opt-section">Display</h3>
        <div style="display:flex;flex-direction:column;gap:8px">
          ${rows}
        </div>
        <div class="hk-modal-actions">
          <span class="grow"></span>
          <button class="hk-btn secondary" id="hk-opts-cancel">Cancel</button>
          <button class="hk-btn" id="hk-opts-save">Save</button>
        </div>
      </div>`;
  shadowRoot.appendChild(back);

  const close = () => back.remove();
  const save = () => {
    for (const o of DISPLAY_OPTS) {
      opts[o.key] = back.querySelector(`#hk-opt-${o.key}`).checked;
      if (o.children) {
        for (const ch of o.children) {
          opts[ch.key] = back.querySelector(`#hk-opt-${ch.key}`).checked;
        }
      }
    }
    saveDisplayOpts(opts);
    onSave(opts);
    close();
  };
  back.addEventListener("mousedown", (e) => { if (e.target === back) close(); });
  back.querySelector("#hk-opts-cancel").addEventListener("click", close);
  back.querySelector("#hk-opts-save").addEventListener("click", save);
}
