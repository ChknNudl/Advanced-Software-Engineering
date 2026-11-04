import * as Y from 'yjs';

export function encode(bytes) {
  let result = '';
  for (const byte of bytes) result += String.fromCharCode(byte);
  return btoa(result);
}
export const decode = (value) =>
  Uint8Array.from(atob(value), (c) => c.charCodeAt(0));

/** Browser-independent replica used by both the UI and generated network tests. */
export class Replica {
  constructor(onChange = () => {}) {
    this.doc = new Y.Doc();
    this.text = this.doc.getText('markdown');
    this.pending = new Map();
    this.sequence = 0;
    this.undo = new Y.UndoManager(this.text, {
      trackedOrigins: new Set(['local']),
      captureTimeout: 500,
    });
    this.doc.on('update', (update, origin) => {
      if (origin !== 'local' && origin !== this.undo) return;
      const seq = ++this.sequence;
      const data = encode(update);
      this.pending.set(seq, data);
      onChange({ seq, update: data });
    });
  }
  vector() {
    return encode(Y.encodeStateVector(this.doc));
  }
  joinMessage(documentId) {
    return {
      type: 'join',
      documentId,
      live: true,
      protocol: 2,
      vector: this.vector(),
    };
  }
  repairMessages(canEdit = true) {
    const update = canEdit ? this.batch() : null;
    return [
      ...(update ? [{ type: 'update', ...update }] : []),
      { type: 'resync', vector: this.vector() },
    ];
  }
  batch() {
    if (!this.pending.size) return null;
    const seq = Math.max(...this.pending.keys());
    const update = encode(
      Y.mergeUpdates([...this.pending.values()].map(decode)),
    );
    this.pending.clear();
    this.pending.set(seq, update);
    return { seq, update };
  }
  receive(update, ack) {
    Y.applyUpdate(this.doc, decode(update), 'remote');
    if (Number.isSafeInteger(ack)) this.pending.delete(ack);
  }
  replace(next) {
    const old = this.text.toString();
    if (next.length > 100000)
      throw new Error('Document limit is 100,000 characters.');
    let start = 0;
    while (
      start < old.length &&
      start < next.length &&
      old[start] === next[start]
    )
      start++;
    if (start && /[\uD800-\uDBFF]/.test(old[start - 1])) start--;
    let end = 0;
    while (
      end < old.length - start &&
      end < next.length - start &&
      old[old.length - 1 - end] === next[next.length - 1 - end]
    )
      end++;
    if (
      end &&
      (/[\uDC00-\uDFFF]/.test(old[old.length - end]) ||
        /[\uDC00-\uDFFF]/.test(next[next.length - end]))
    )
      end--;
    this.doc.transact(() => {
      const remove = old.length - start - end;
      if (remove) this.text.delete(start, remove);
      const insert = next.slice(start, next.length - end);
      if (insert) this.text.insert(start, insert);
    }, 'local');
  }
  selection(start, end) {
    return {
      anchor: encode(
        Y.encodeRelativePosition(
          Y.createRelativePositionFromTypeIndex(
            this.text,
            Math.min(start, this.text.length),
          ),
        ),
      ),
      head: encode(
        Y.encodeRelativePosition(
          Y.createRelativePositionFromTypeIndex(
            this.text,
            Math.min(end, this.text.length),
          ),
        ),
      ),
    };
  }
  resolve(cursor) {
    try {
      const a = Y.createAbsolutePositionFromRelativePosition(
        Y.decodeRelativePosition(decode(cursor.anchor)),
        this.doc,
      );
      const b = Y.createAbsolutePositionFromRelativePosition(
        Y.decodeRelativePosition(decode(cursor.head)),
        this.doc,
      );
      return a?.type === this.text && b?.type === this.text
        ? { start: a.index, end: b.index }
        : null;
    } catch {
      return null;
    }
  }
  snapshot(title = null) {
    return {
      schema: 1,
      state: encode(Y.encodeStateAsUpdate(this.doc)),
      pending: [...this.pending],
      sequence: this.sequence,
      title,
      markdown: this.text.toString(),
    };
  }
  restore(saved) {
    if (
      !saved ||
      saved.schema !== 1 ||
      typeof saved.state !== 'string' ||
      saved.state.length > 2100000 ||
      !Array.isArray(saved.pending) ||
      !Number.isSafeInteger(saved.sequence) ||
      saved.sequence < 0 ||
      (saved.title !== null &&
        (typeof saved.title !== 'string' || saved.title.length > 200)) ||
      saved.pending.some(
        (p) =>
          !Array.isArray(p) ||
          p.length !== 2 ||
          !Number.isSafeInteger(p[0]) ||
          p[0] < 1 ||
          p[0] > saved.sequence ||
          typeof p[1] !== 'string' ||
          p[1].length > 2000000,
      )
    )
      throw new Error('Recovery copy is invalid.');
    // Validate the whole copy before mutating a live replica.
    const candidate = new Y.Doc();
    try {
      Y.applyUpdate(candidate, decode(saved.state));
      for (const [, update] of saved.pending) Y.decodeUpdate(decode(update));
      if (candidate.getText('markdown').length > 100000)
        throw new Error('Recovery copy exceeds the document limit.');
    } finally {
      candidate.destroy();
    }
    this.receive(saved.state);
    this.pending.clear();
    for (const [seq, update] of saved.pending) {
      decode(update);
      this.pending.set(seq, update);
    }
    this.sequence = saved.sequence;
    this.undo.clear();
  }
  destroy() {
    this.undo.destroy();
    this.doc.destroy();
  }
}

/** Per-tab copies: refresh recovery without leaving drafts in persistent local storage. */
export class RecoveryStore {
  constructor(storage, user) {
    this.storage = storage;
    this.prefix = `marksync:recovery:${user}:`;
  }
  load(document) {
    const value = this.storage.getItem(this.prefix + document);
    if (!value) return null;
    if (value.length > 4500000) throw new Error('Recovery copy is too large.');
    return JSON.parse(value);
  }
  save(document, replica, title) {
    if (!replica.pending.size && title === null) {
      this.remove(document);
      return;
    }
    const value = JSON.stringify(replica.snapshot(title));
    if (value.length > 4500000)
      throw new Error(
        'Recovery copy is too large. Download your Markdown before leaving.',
      );
    this.storage.setItem(this.prefix + document, value);
  }
  remove(document) {
    this.storage.removeItem(this.prefix + document);
  }
  clear() {
    const keys = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (key?.startsWith(this.prefix)) keys.push(key);
    }
    for (const key of keys) this.storage.removeItem(key);
  }
}
