// Modal dialogs — extracted from hakanban-panel.js.
// Each function appends a modal to the given shadow root and returns nothing.
// Only one dialog is shown at a time; calling either removes any existing one.

import { escapeHtml } from "./util.js";
import { DISPLAY_OPTS, saveDisplayOpts } from "./display-opts.js";

const BACKGROUNDS = [
  "", "#0079bf", "#519839", "#b04632", "#89609e", "#cd5a91",
  "#4bbf6b", "#00aecc", "#838c91",
  "linear-gradient(135deg,#667eea,#764ba2)",
  "linear-gradient(135deg,#f093fb,#f5576c)",
];

// Open the display-options dialog. `opts` is the current display options
// object (mutated in place on save). `board` is the current board object
// (for the background picker and rename). `api` is the HakanbanApi instance.
// `onSave` is called with the updated opts after the user clicks Save.
export function openOptionsDialog(shadowRoot, opts, board, api, onSave) {
  shadowRoot.querySelector(".hk-dialog-back")?.remove();

  const title = board ? escapeHtml(board.title) : "";

  const sw = BACKGROUNDS.map(
    (bg) =>
      `<span data-bg="${escapeHtml(bg)}" title="${escapeHtml(bg || "None")}" style="display:inline-block;width:28px;height:28px;border-radius:6px;cursor:pointer;border:1px solid var(--hk-divider);background:${bg || "var(--card-background-color)"}"></span>`
  ).join("");

  const rows = DISPLAY_OPTS
    .map((o) => {
      const main = `<label class="hk-opt-row"><input type="checkbox" id="hk-opt-${o.key}" ${opts[o.key] ? "checked" : ""}><span>${escapeHtml(o.label)}</span></label>`;
      if (!o.children) return main;
      const kids = (o.children || [])
        .map((ch) => `<label class="hk-opt-row hk-opt-sub" data-parent="${o.key}"><input type="checkbox" id="hk-opt-${ch.key}" ${opts[ch.key] ? "checked" : ""}><span>${escapeHtml(ch.label)}</span></label>`)
        .join("");
      return `${main}<div class="hk-opt-children" id="hk-opt-children-${o.key}" style="display:${opts[o.key] ? "block" : "none"}">${kids}</div>`;
    })
    .join("");

  const back = document.createElement("div");
  back.className = "hk-modal-back hk-dialog-back";
  back.innerHTML = `
      <div class="hk-modal hk-dialog" role="dialog" aria-modal="true" style="width:min(440px,100%)">
        <h2>Board options</h2>
        <h3 class="hk-opt-section">Board name</h3>
        <div class="hk-row" style="margin-bottom:12px">
          <input type="text" id="hk-rename-input" style="flex:1" value="${title}" maxlength="120">
        </div>
        <h3 class="hk-opt-section">Background</h3>
        <div class="hk-row" style="gap:6px;flex-wrap:wrap;margin-bottom:12px">${sw}</div>
        <h3 class="hk-opt-section">Display</h3>
        <div class="hk-opt-help" title="Checked items are shown on the card face. Everything is still visible in the card detail regardless of these settings.">
          Checked items are shown on the card. Everything is still available in the card detail.
        </div>
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

  const input = back.querySelector("#hk-rename-input");
  const close = () => back.remove();
  const save = () => {
    const v = input.value.trim();
    if (board && api && v && v !== board.title) api.updateBoard(board.id, { title: v });
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
  input.addEventListener("keydown", (e) => {
    if (e.key === "Enter") { e.preventDefault(); save(); }
    else if (e.key === "Escape") { e.preventDefault(); close(); }
  });
  input.focus();
  input.select();

  // Accordion logic: toggle children visibility and disabled state when parent changes
  for (const o of DISPLAY_OPTS) {
    if (!o.children) continue;
    const parentCheck = back.querySelector(`#hk-opt-${o.key}`);
    const childrenDiv = back.querySelector(`#hk-opt-children-${o.key}`);
    if (!parentCheck || !childrenDiv) continue;
    const updateChildren = () => {
      const checked = parentCheck.checked;
      childrenDiv.style.display = checked ? "block" : "none";
      childrenDiv.classList.toggle("disabled", !checked);
    };
    parentCheck.addEventListener("change", updateChildren);
    updateChildren();
  }

  back.querySelectorAll("[data-bg]").forEach((el) =>
    el.addEventListener("click", () => {
      if (board && api) api.updateBoard(board.id, { background: el.dataset.bg || null });
    })
  );
}
