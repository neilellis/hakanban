// Pure card HTML rendering — extracted from board-view.js so the board
// component stays a thin shell. No DOM, no state; just (card, opts) -> HTML.

import { escapeHtml, formatDue, dueState, contrastText, renderMarkdown } from "./util.js";

// Build the HTML for a single card given the card object, a label-id map,
// and the normalised display options.
export function cardHtml(card, labelById, opts) {
  const labels = (card.labels || [])
    .map((id) => labelById[id])
    .filter(Boolean)
    .map(
      (l) =>
        `<span class="hk-label" style="background:${l.color};color:${contrastText(l.color)}">${escapeHtml(l.name || "")}</span>`
    )
    .join("");

  const ds = dueState(card.due, card.due_complete);
  const badges = [];
  if (opts.showCardNumber) badges.push(`<span class="hk-card-number">#${card.number}</span>`);
  if (opts.showDueDate && card.due)
    badges.push(`<span class="hk-badge due-${ds}">🕑 ${escapeHtml(formatDue(card.due))}</span>`);
  if (!opts.showComments && (card.comments || []).length) badges.push(`<span class="hk-badge">💬 ${card.comments.length}</span>`);
  const checks = (card.checklists || []).reduce(
    (a, cl) => ({ done: a.done + cl.items.filter((i) => i.done).length, total: a.total + cl.items.length }),
    { done: 0, total: 0 }
  );
  if (checks.total) badges.push(`<span class="hk-badge">☑ ${checks.done}/${checks.total}</span>`);
  if (opts.showAssignees && (card.assignees || []).length) badges.push(`<span class="hk-badge">👤 ${card.assignees.length}</span>`);

  const checklistHtml = (opts.showChecklists && checks.total)
    ? checklistItemsHtml(card)
    : "";

  const descHtml = (opts.showDescription && card.description)
    ? `<div class="hk-card-desc">${renderMarkdown(card.description)}</div>`
    : "";

  const commentsHtml = (opts.showComments && (card.comments || []).length)
    ? commentsBlockHtml(card.comments, opts)
    : "";

  const badgesHtml = badges.length ? `<div class="hk-card-badges">${badges.join("")}</div>` : "";
  const completed = card.status === "completed" ? "completed" : "";
  return `
      <div class="hk-card ${completed}" draggable="true" data-card="${card.id}" data-col="${card.column_id}">
        ${(opts.showLabels && labels) ? `<div class="hk-card-labels">${labels}</div>` : ""}
        ${opts.showTitle ? `<div class="hk-card-title">${escapeHtml(card.title)}</div>` : ""}
        ${descHtml}
        ${checklistHtml}
        ${commentsHtml}
        ${badgesHtml}
      </div>`;
}

// Inline checklist items (the actual checkboxes, not just the x/x badge).
function checklistItemsHtml(card) {
  const checklists = (card.checklists || []).filter((cl) => cl.items.length);
  if (!checklists.length) return "";
  return `<div class="hk-card-checks">
          ${checklists
            .map((cl) =>
              cl.items
                .map(
                  (i) =>
                    `<label class="hk-check-inline ${i.done ? "done" : ""}" data-card="${card.id}"><input type="checkbox" data-check="${cl.id}:${i.id}" ${i.done ? "checked" : ""}><span>${escapeHtml(i.text)}</span></label>`
                )
                .join("")
            )
            .join("")
        }</div>`;
}

// Inline comments block. Move comments have structured move_from/move_to
// so sub-options can toggle which parts of the move info are shown.
function commentsBlockHtml(comments, opts) {
  const list = comments.filter((cm) => cm && cm.text);
  if (!list.length) return "";
  const fmtTs = (ts) => {
    if (!ts) return "";
    const d = new Date(ts);
    if (Number.isNaN(d.getTime())) return "";
    const parts = [];
    if (opts.commentShowDate) parts.push(d.toLocaleDateString(undefined, { month: "short", day: "numeric" }));
    if (opts.commentShowTime) parts.push(d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" }));
    return parts.join(" ");
  };
  const commentText = (cm) => {
    if (cm.move_from || cm.move_to) {
      const parts = [];
      if (cm.move_from && opts.commentShowFrom) parts.push(`from ${cm.move_from}`);
      if (cm.move_to && opts.commentShowTo) parts.push(`to ${cm.move_to}`);
      return parts.length ? `Moved ${parts.join(" ")}` : "Moved";
    }
    return cm.text;
  };
  return `<div class="hk-card-comments">
          ${list
            .map((cm) => {
              const author = opts.commentShowUser ? `<span class="hk-comment-author">${escapeHtml(cm.author || "?")}</span>` : "";
              const ts = fmtTs(cm.ts);
              const tsHtml = ts ? `<span class="hk-comment-ts">${escapeHtml(ts)}</span>` : "";
              return `<div class="hk-comment-inline">${author}<span class="hk-comment-text">${escapeHtml(commentText(cm))}</span>${tsHtml}</div>`;
            })
            .join("")}
        </div>`;
}
