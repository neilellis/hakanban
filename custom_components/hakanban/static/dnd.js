// Drag & drop wiring — extracted from board-view.js.
// HTML5 DnD can't read dataTransfer during dragover, so we keep module-level
// drag state and expose helpers for the board component to call.

let DRAG = null; // { kind: 'card'|'col', id, from? }

// Find the card element before which a dropped card should be inserted.
function cardAfter(container, y) {
  const els = [...container.querySelectorAll(".hk-card:not(.dragging)")];
  let best = { offset: -Infinity, el: null };
  for (const el of els) {
    const box = el.getBoundingClientRect();
    const offset = y - box.top - box.height / 2;
    if (offset < 0 && offset > best.offset) best = { offset, el };
  }
  return best.el;
}

// Find the column insertion index for a horizontal drop.
function colInsertionIndex(boardEl, x) {
  const cols = [...boardEl.querySelectorAll(".hk-col")];
  for (let i = 0; i < cols.length; i++) {
    const box = cols[i].getBoundingClientRect();
    if (x < box.left + box.width / 2) return i;
  }
  return cols.length;
}

// Wire up all drag & drop handlers on the board's shadow root.
// `api` is the HakanbanApi instance, `boardId` is the current board id,
// and `boardEl` is the .hk-board element. `onJustDragged` is called after
// a card drag ends so the click handler can suppress the modal open.
export function wireDnD(root, api, boardId, boardEl, onJustDragged) {
  // --- card drag start/end ---
  root.querySelectorAll(".hk-card").forEach((el) => {
    el.addEventListener("dragstart", (e) => {
      DRAG = { kind: "card", id: el.dataset.card, from: el.dataset.col };
      el.classList.add("dragging");
      e.dataTransfer.effectAllowed = "move";
      e.dataTransfer.setData("text/plain", el.dataset.card);
    });
    el.addEventListener("dragend", () => {
      el.classList.remove("dragging");
      DRAG = null;
      onJustDragged();
    });
  });

  // --- card drop targets (each column) ---
  root.querySelectorAll(".hk-col").forEach((colEl) => {
    const colId = colEl.dataset.col;
    const list = colEl.querySelector(".hk-cards");
    colEl.addEventListener("dragover", (e) => {
      if (DRAG?.kind !== "card") return;
      e.preventDefault();
      colEl.classList.add("dragover");
    });
    colEl.addEventListener("dragleave", () => colEl.classList.remove("dragover"));
    colEl.addEventListener("drop", (e) => {
      if (DRAG?.kind !== "card") return;
      e.preventDefault();
      colEl.classList.remove("dragover");
      const after = cardAfter(list, e.clientY);
      const ids = [...list.querySelectorAll(".hk-card")]
        .map((n) => n.dataset.card)
        .filter((id) => id !== DRAG.id);
      const position = after ? ids.indexOf(after.dataset.card) : ids.length;
      api.moveCard(DRAG.id, colId, position < 0 ? ids.length : position);
    });
  });

  // --- column reordering ---
  root.querySelectorAll("[data-colhead]").forEach((head) => {
    head.addEventListener("dragstart", (e) => {
      DRAG = { kind: "col", id: head.dataset.colhead };
      e.dataTransfer.effectAllowed = "move";
      e.stopPropagation();
    });
    head.addEventListener("dragend", () => (DRAG = null));
  });
  boardEl.addEventListener("dragover", (e) => {
    if (DRAG?.kind !== "col") return;
    e.preventDefault();
  });
  boardEl.addEventListener("drop", (e) => {
    if (DRAG?.kind !== "col") return;
    e.preventDefault();
    const position = colInsertionIndex(boardEl, e.clientX);
    api.moveColumn(boardId, DRAG.id, position);
  });
}
