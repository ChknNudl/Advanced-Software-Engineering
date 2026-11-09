import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as fc from 'fast-check';
import * as Y from 'yjs';
import {
  Replica,
  RecoveryStore,
  encode,
  decode,
} from '../public/collaboration.js';
import { createStore } from '../src/store.js';

const chunk = fc
  .array(fc.constantFrom('a', 'Z', ' ', '\n', 'é', '你', '🙂'), {
    maxLength: 8,
  })
  .map((x) => x.join(''));
const operations = fc.array(
  fc.record({
    user: fc.integer({ min: 0, max: 2 }),
    at: fc.nat(100),
    remove: fc.nat(5),
    text: chunk,
    deliver: fc.boolean(),
    priority: fc.nat(100),
  }),
  { minLength: 1, maxLength: 40 },
);

test('generated delayed, reordered, duplicated edits converge through the real store and recovery', () => {
  fc.assert(
    fc.property(operations, (ops) => {
      const store = createStore(':memory:');
      const owner = store.addUser('test@example.com', 'Test', 'unused');
      const document = store.create('Generated', owner.id, 'Hello 🌍\n');
      const clients = [new Replica(), new Replica(), new Replica()];
      const packets: { update: string; priority: number }[] = [];
      try {
        const initial = store.state(document.id);
        const seed = encode(Y.encodeStateAsUpdate(initial));
        initial.destroy();
        clients.forEach((c) => c.receive(seed));
        for (const op of ops) {
          const c = clients[op.user];
          const points = Array.from(c.text.toString());
          const at = op.at % (points.length + 1);
          points.splice(at, op.remove, ...Array.from(op.text));
          const expected = points.join('');
          c.replace(expected);
          assert.equal(c.text.toString(), expected);
          const packet = c.batch();
          if (packet) {
            packets.push({ update: packet.update, priority: op.priority });
            if (op.deliver) {
              store.apply(document.id, decode(packet.update));
              clients[(op.user + 1) % 3].receive(packet.update);
            }
          }
        }
        // Restore all three replicas exactly as a tab refresh would, including unacknowledged operations.
        for (let i = 0; i < clients.length; i++) {
          const copy = JSON.parse(JSON.stringify(clients[i].snapshot()));
          clients[i].destroy();
          clients[i] = new Replica();
          clients[i].restore(copy);
        }
        for (const p of packets.sort((a, b) => a.priority - b.priority)) {
          store.apply(document.id, decode(p.update));
          const version = store.document(document.id)!.version;
          store.apply(document.id, decode(p.update));
          assert.equal(
            store.document(document.id)!.version,
            version,
            'duplicate delivery must not change the version',
          );
        }
        for (const c of clients) {
          const packet = c.batch();
          if (packet) store.apply(document.id, decode(packet.update));
        }
        const server = store.state(document.id);
        for (const c of clients) {
          const packet = c.batch();
          c.receive(
            encode(Y.encodeStateAsUpdate(server, decode(c.vector()))),
            packet?.seq,
          );
          assert.equal(
            c.text.toString(),
            store.document(document.id)!.markdown,
          );
          assert.equal(c.pending.size, 0);
        }
        server.destroy();
      } finally {
        clients.forEach((c) => c.destroy());
        store.db.close();
      }
    }),
    { numRuns: 150 },
  );
});

test('personal undo keeps concurrent remote insertions and is broadcast as an update', () => {
  const a = new Replica(),
    b = new Replica();
  try {
    a.replace('base');
    b.receive(encode(Y.encodeStateAsUpdate(a.doc)));
    a.undo.clear();
    a.pending.clear();
    a.replace('base Alice');
    b.replace('Bob base');
    a.receive(b.batch()!.update);
    a.undo.undo();
    assert.equal(a.text.toString(), 'Bob base');
    b.receive(a.batch()!.update);
    assert.equal(b.text.toString(), a.text.toString());
    a.undo.redo();
    b.receive(a.batch()!.update);
    assert.equal(a.text.toString(), 'Bob base Alice');
    assert.equal(b.text.toString(), a.text.toString());
  } finally {
    a.destroy();
    b.destroy();
  }
});

test('relative selections follow insertions and malformed cursors are ignored', () => {
  const c = new Replica();
  try {
    c.replace('hello');
    const selection = c.selection(2, 4);
    c.replace('🙂hello');
    assert.deepEqual(c.resolve(selection), { start: 4, end: 6 });
    assert.equal(c.resolve({ anchor: '???', head: '???' }), null);
  } finally {
    c.destroy();
  }
});

test('tab recovery is account scoped, preserves empty unsaved titles and clears only that account', () => {
  const map = new Map<string, string>();
  const storage = {
    get length() {
      return map.size;
    },
    key: (i: number) => [...map.keys()][i],
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => map.set(k, v),
    removeItem: (k: string) => map.delete(k),
  };
  const a = new RecoveryStore(storage, 1),
    b = new RecoveryStore(storage, 2),
    c = new Replica();
  try {
    c.replace('draft');
    a.save(7, c, '');
    assert.equal(a.load(7).title, '');
    assert.equal(b.load(7), null);
    b.save(7, c, null);
    a.clear();
    assert.equal(a.load(7), null);
    assert(b.load(7));
    c.pending.clear();
    b.save(7, c, null);
    assert.equal(b.load(7), null);
    assert.throws(() => c.restore({ schema: 0 }));
  } finally {
    c.destroy();
  }
});
