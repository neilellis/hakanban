// Display options schema — the single source of truth for what can be
// toggled on the card face. Both the panel (dialog UI) and the board view
// (rendering) import from here so adding/removing an option is one change.

// Each entry: { key, label, default, compactOnly? }
// - `default` is true for show-* toggles, false for compact.
// - The panel dialog iterates this array to build rows + save logic.
// - The board view reads the normalised object via `opts[key]`.
export const DISPLAY_OPTS = [
  { key: "showTitle", label: "Title", default: true },
  { key: "showDescription", label: "Description", default: true },
  { key: "showChecklists", label: "Checklists", default: true },
  { key: "showLabels", label: "Tags", default: true },
  { key: "showCardNumber", label: "Card number", default: true },
  { key: "showDueDate", label: "Due date", default: true },
  { key: "showComments", label: "Comments", default: true, children: [
    { key: "commentShowUser", label: "User", default: true },
    { key: "commentShowFrom", label: "Moved from", default: true },
    { key: "commentShowTo", label: "Moved to", default: true },
    { key: "commentShowDate", label: "Date", default: true },
    { key: "commentShowTime", label: "Time", default: false },
  ]},
  { key: "compact", label: "Compact mode (smaller cards, less padding)", default: false },
];

// Fill in defaults for any missing keys so partial localStorage data
// (from older versions) doesn't break rendering.
export function normalizeDisplayOpts(raw) {
  const o = raw || {};
  const out = {};
  for (const opt of DISPLAY_OPTS) {
    out[opt.key] = opt.key in o ? o[opt.key] === true || o[opt.key] === "true" : opt.default;
    if (opt.children) {
      for (const child of opt.children) {
        out[child.key] = child.key in o ? o[child.key] === true || o[child.key] === "true" : child.default;
      }
    }
  }
  return out;
}

// Load from localStorage with defaults applied.
export function loadDisplayOpts() {
  try {
    return normalizeDisplayOpts(JSON.parse(localStorage.getItem("hakanban_display_opts") || "{}"));
  } catch {
    return normalizeDisplayOpts({});
  }
}

// Save to localStorage.
export function saveDisplayOpts(opts) {
  localStorage.setItem("hakanban_display_opts", JSON.stringify(opts));
}
