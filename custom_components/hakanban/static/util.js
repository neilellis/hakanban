// Small dependency-free helpers shared across the panel and card.

export function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

// Tiny, safe-ish markdown subset: bold, italic, code, links, line breaks, bullets.
export function renderMarkdown(text) {
  if (!text) return "";
  let html = escapeHtml(text);
  html = html.replace(/`([^`]+)`/g, "<code>$1</code>");
  html = html.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  html = html.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g,
    '<a href="$2" target="_blank" rel="noopener">$1</a>'
  );
  // unordered lists
  html = html.replace(/(?:^|\n)[-*] (.+)/g, "\n<li>$1</li>");
  html = html.replace(/(<li>[\s\S]*?<\/li>)/g, "<ul>$1</ul>");
  html = html.replace(/\n/g, "<br>");
  return html;
}

export function formatDue(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const hasTime = iso.includes("T");
  const opts = hasTime
    ? { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }
    : { month: "short", day: "numeric" };
  return d.toLocaleString(undefined, opts);
}

export function dueState(iso, complete) {
  if (!iso || complete) return complete ? "done" : "";
  const now = new Date();
  const d = new Date(iso);
  const soon = new Date(now.getTime() + 24 * 3600 * 1000);
  if (d < now) return "overdue";
  if (d < soon) return "soon";
  return "";
}

// Pick a readable text colour for a label background.
export function contrastText(hex) {
  if (!hex || hex[0] !== "#") return "#fff";
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150 ? "#172b4d" : "#fff";
}

export function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}
