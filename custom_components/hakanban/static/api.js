// Thin wrapper over the Home Assistant websocket connection for hakanban/* commands.

export class HakanbanApi {
  constructor(hass) {
    this.hass = hass;
  }

  setHass(hass) {
    this.hass = hass;
  }

  _send(type, payload = {}) {
    return this.hass.connection.sendMessagePromise({ type: `hakanban/${type}`, ...payload });
  }

  get() {
    return this._send("get");
  }

  undo() {
    return this._send("undo");
  }
  redo() {
    return this._send("redo");
  }

  // Streams the full payload on every change. Returns an unsubscribe function.
  subscribe(callback) {
    return this.hass.connection.subscribeMessage(callback, { type: "hakanban/subscribe" });
  }

  createBoard(title, background) {
    return this._send("create_board", { title, background });
  }
  updateBoard(board_id, changes) {
    return this._send("update_board", { board_id, ...changes });
  }
  deleteBoard(board_id) {
    return this._send("delete_board", { board_id });
  }

  createColumn(board_id, title) {
    return this._send("create_column", { board_id, title });
  }
  updateColumn(board_id, column_id, changes) {
    return this._send("update_column", { board_id, column_id, ...changes });
  }
  deleteColumn(board_id, column_id) {
    return this._send("delete_column", { board_id, column_id });
  }
  moveColumn(board_id, column_id, position) {
    return this._send("move_column", { board_id, column_id, position });
  }

  createCard(board_id, column_id, title, extra = {}) {
    return this._send("create_card", { board_id, column_id, title, ...extra });
  }
  pasteCards(board_id, column_id, titles) {
    return this._send("paste_cards", { board_id, column_id, titles });
  }
  updateCard(card_id, changes) {
    return this._send("update_card", { card_id, ...changes });
  }
  moveCard(card_id, to_column, position, to_board) {
    const payload = { card_id, to_column };
    if (position !== undefined && position !== null) payload.position = position;
    if (to_board) payload.to_board = to_board;
    return this._send("move_card", payload);
  }
  deleteCard(card_id) {
    return this._send("delete_card", { card_id });
  }

  createLabel(board_id, name, color) {
    return this._send("create_label", { board_id, name, color });
  }
  updateLabel(board_id, label_id, changes) {
    return this._send("update_label", { board_id, label_id, ...changes });
  }
  deleteLabel(board_id, label_id) {
    return this._send("delete_label", { board_id, label_id });
  }

  addComment(card_id, text) {
    return this._send("add_comment", { card_id, text });
  }
  addChecklist(card_id, title) {
    return this._send("add_checklist", { card_id, title });
  }
  addCheckItem(card_id, checklist_id, text) {
    return this._send("add_check_item", { card_id, checklist_id, text });
  }
  toggleCheckItem(card_id, checklist_id, item_id, done) {
    return this._send("toggle_check_item", { card_id, checklist_id, item_id, done });
  }
}
