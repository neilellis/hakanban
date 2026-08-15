// A tiny in-browser mock of the Home Assistant websocket connection that emulates
// the hakanban/* backend, so we can smoke-test the real frontend modules without HA.

function uid() {
  uid.n = (uid.n || 0) + 1;
  return "id" + uid.n;
}

function makeSeed() {
  const board = {
    id: "b1",
    title: "Demo Board",
    background: "#0079bf",
    archived: false,
    labels: [
      { id: "green", name: "", color: "#61bd4f" },
      { id: "red", name: "Bug", color: "#eb5a46" },
      { id: "blue", name: "", color: "#0079bf" },
    ],
    columns: [
      { id: "c1", title: "To Do", order: 0, archived: false, cards: [] },
      { id: "c2", title: "Doing", order: 1000, archived: false, cards: [] },
      { id: "c3", title: "Done", order: 2000, archived: false, cards: [] },
    ],
  };
  let n = 0;
  const mk = (col, title, extra = {}) => ({
    id: uid(),
    board_id: "b1",
    column_id: col,
    order: 0,
    number: ++n,
    title,
    description: extra.description || "",
    labels: extra.labels || [],
    assignees: [],
    due: extra.due || null,
    due_complete: false,
    status: extra.status || "needs_action",
    checklists: [],
    comments: [],
    cover: null,
    archived: false,
  });
  board.columns[0].cards = [
    mk("c1", "Buy milk", { labels: ["green"] }),
    mk("c1", "Walk the dog", { due: "2026-06-10T09:00:00", labels: ["red"] }),
  ];
  const groceries = board.columns[0].cards[0];
  groceries.description = "Get the 2% organic from the corner shop. **Don't forget the receipt!**";
  groceries.checklists = [
    {
      id: "cl1",
      title: "Shopping list",
      items: [
        { id: "i1", text: "2% milk", done: true },
        { id: "i2", text: "Bread", done: false },
        { id: "i3", text: "Eggs", done: false },
      ],
    },
  ];
  board.columns[1].cards = [mk("c2", "Write the report", { description: "**Important** task" })];
  board.columns[2].cards = [mk("c3", "Ship it", { status: "completed" })];
  // normalise order
  board.columns.forEach((col) => col.cards.forEach((cd, i) => (cd.order = i * 1000)));
  return { boards: [board] };
}

const state = makeSeed();
const subscribers = new Set();

function findBoard(id) {
  return state.boards.find((b) => b.id === id);
}
function allCards() {
  const out = [];
  state.boards.forEach((b) => b.columns.forEach((c) => c.cards.forEach((cd) => out.push([b, c, cd]))));
  return out;
}
function findCard(id) {
  return allCards().find(([, , cd]) => cd.id === id);
}
function notify() {
  const payload = JSON.parse(JSON.stringify(state));
  subscribers.forEach((cb) => cb(payload));
}
function reindex(cards) {
  cards.forEach((c, i) => (c.order = i * 1000));
}

const handlers = {
  get: () => JSON.parse(JSON.stringify(state)),
  create_board: ({ title }) => {
    const b = { id: uid(), title, background: null, archived: false, labels: [], columns: [] };
    state.boards.push(b);
    return b;
  },
  update_board: ({ board_id, title, background, archived }) => {
    const b = findBoard(board_id);
    if (title != null) b.title = title;
    if (background !== undefined) b.background = background;
    if (archived != null) b.archived = archived;
    return b;
  },
  delete_board: ({ board_id }) => {
    state.boards = state.boards.filter((b) => b.id !== board_id);
    return { deleted: board_id };
  },
  create_column: ({ board_id, title }) => {
    const b = findBoard(board_id);
    const col = { id: uid(), title, order: b.columns.length * 1000, archived: false, cards: [] };
    b.columns.push(col);
    return col;
  },
  update_column: ({ board_id, column_id, title }) => {
    const col = findBoard(board_id).columns.find((c) => c.id === column_id);
    if (title != null) col.title = title;
    return col;
  },
  delete_column: ({ board_id, column_id }) => {
    const b = findBoard(board_id);
    b.columns = b.columns.filter((c) => c.id !== column_id);
    return { deleted: column_id };
  },
  move_column: ({ board_id, column_id, position }) => {
    const b = findBoard(board_id);
    const idx = b.columns.findIndex((c) => c.id === column_id);
    const [col] = b.columns.splice(idx, 1);
    b.columns.splice(position, 0, col);
    b.columns.forEach((c, i) => (c.order = i * 1000));
    return { ok: true };
  },
  create_card: ({ board_id, column_id, title, description, labels }) => {
    const b = findBoard(board_id);
    const col = b.columns.find((c) => c.id === column_id);
    const card = {
      id: uid(), board_id, column_id, order: col.cards.length * 1000,
      number: allCards().length + 1, title, description: description || "",
      labels: labels || [], assignees: [], due: null, due_complete: false,
      status: "needs_action", checklists: [], comments: [], cover: null, archived: false,
    };
    col.cards.push(card);
    return card;
  },
  paste_cards: ({ board_id, column_id, titles }) => {
    const cards = (titles || []).map((t) => handlers.create_card({ board_id, column_id, title: t }));
    return { cards };
  },
  update_card: ({ card_id, ...fields }) => {
    const [, , card] = findCard(card_id);
    Object.assign(card, fields);
    return card;
  },
  move_card: ({ card_id, to_column, position }) => {
    const found = findCard(card_id);
    const [board, fromCol, card] = found;
    // Auto-comment on cross-column moves (mirrors the real backend).
    if (fromCol.id !== to_column) {
      const toCol = board.columns.find((c) => c.id === to_column);
      card.comments = card.comments || [];
      card.comments.push({
        id: uid(),
        author: "Test User",
        ts: new Date().toISOString(),
        text: `Moved from ${fromCol.title} to ${toCol.title}`,
        move_from: fromCol.title,
        move_to: toCol.title,
      });
    }
    fromCol.cards = fromCol.cards.filter((c) => c.id !== card_id);
    const toCol = board.columns.find((c) => c.id === to_column);
    const pos = position == null ? toCol.cards.length : position;
    toCol.cards.splice(pos, 0, card);
    card.column_id = to_column;
    reindex(toCol.cards);
    return card;
  },
  delete_card: ({ card_id }) => {
    const [, col] = findCard(card_id);
    col.cards = col.cards.filter((c) => c.id !== card_id);
    return { deleted: card_id };
  },
  create_label: ({ board_id, name, color }) => {
    const b = findBoard(board_id);
    const l = { id: uid(), name, color };
    b.labels.push(l);
    return l;
  },
  update_label: ({ board_id, label_id, name, color }) => {
    const l = findBoard(board_id).labels.find((x) => x.id === label_id);
    if (name != null) l.name = name;
    if (color != null) l.color = color;
    return l;
  },
  delete_label: ({ board_id, label_id }) => {
    const b = findBoard(board_id);
    b.labels = b.labels.filter((l) => l.id !== label_id);
    return { deleted: label_id };
  },
  add_comment: ({ card_id, text }) => {
    const [, , card] = findCard(card_id);
    const cm = { id: uid(), author: "Tester", ts: "2026-06-16T12:00:00", text };
    card.comments.push(cm);
    return cm;
  },
  add_checklist: ({ card_id, title }) => {
    const [, , card] = findCard(card_id);
    const cl = { id: uid(), title, items: [] };
    card.checklists.push(cl);
    return cl;
  },
  add_check_item: ({ card_id, checklist_id, text }) => {
    const [, , card] = findCard(card_id);
    const cl = card.checklists.find((x) => x.id === checklist_id);
    const it = { id: uid(), text, done: false };
    cl.items.push(it);
    return it;
  },
  toggle_check_item: ({ card_id, checklist_id, item_id, done }) => {
    const [, , card] = findCard(card_id);
    const cl = card.checklists.find((x) => x.id === checklist_id);
    cl.items.find((i) => i.id === item_id).done = done;
    return { ok: true };
  },
};

window.__hkLog = [];

window.__mockHass = {
  connection: {
    sendMessagePromise(msg) {
      const cmd = msg.type.replace("hakanban/", "");
      window.__hkLog.push(cmd);
      const handler = handlers[cmd];
      if (!handler) return Promise.reject(new Error("unknown " + msg.type));
      const result = handler(msg);
      Promise.resolve().then(notify);
      return Promise.resolve(result);
    },
    subscribeMessage(cb, msg) {
      if (msg.type === "hakanban/subscribe") {
        subscribers.add(cb);
        Promise.resolve().then(() => cb(JSON.parse(JSON.stringify(state))));
        return Promise.resolve(() => subscribers.delete(cb));
      }
      return Promise.resolve(() => {});
    },
  },
  states: {},
  themes: {},
};
