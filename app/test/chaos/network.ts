import assert from 'node:assert/strict';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { WebSocket } from 'ws';
import * as Y from 'yjs';
import { createApplication } from '../../src/app.js';
import { digest } from '../../src/session.js';
import { Replica, decode } from '../../public/collaboration.js';

export type Edit = {
  user: number;
  at: number;
  remove: number;
  text: string;
  advance: number;
};
type Message = {
  type: string;
  update?: string;
  ack?: number;
  [key: string]: unknown;
};
type Packet = {
  id: number;
  to: number;
  direction: 'up' | 'down';
  due: number;
  message: Message;
};

/** Real ws/HTTP server; faults intercept application messages, never patch document state. */
export async function network(seed: number, database = ':memory:') {
  const origin = 'http://localhost:3000';
  const app = createApplication(database, origin);
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  assert(address && typeof address !== 'string');
  const clients = Array.from({ length: 4 }, () => new Replica());
  clients.forEach((client, i) => {
    client.doc.clientID = 10 + i;
  });
  const users = clients.map((_, i) =>
    app.store.addUser(
      `chaos${i}@test.invalid`,
      `Editor ${i}`,
      'unused-test-hash',
    ),
  );
  const document = app.store.create('Chaos', users[0].id, '');
  const initial = new Y.Doc();
  initial.clientID = 1;
  initial.getText('markdown').insert(0, 'Start 🙂\n');
  app.store.apply(document.id, Y.encodeStateAsUpdate(initial));
  initial.destroy();
  for (let i = 1; i < users.length; i++) {
    const link = app.store.createLink(
      'document',
      document.id,
      i === 3 ? 'read' : 'edit',
      users[0].id,
    );
    app.store.redeem(link.token, users[i].id);
  }
  const sockets: WebSocket[] = [];
  const barriers = new Map<number, () => void>();
  const errors: string[] = [];
  const inbox: Message[][] = clients.map(() => []);
  const oracle = new Y.Doc();
  let clock = 0,
    serial = 0,
    rng = seed >>> 0,
    faults = false,
    upstreamAttempts = 0;
  const queue: Packet[] = [];
  const metrics = {
    droppedUp: 0,
    droppedDown: 0,
    droppedAck: 0,
    duplicated: 0,
    delayed: 0,
    reordered: 0,
    delivered: 0,
  };
  let lastDelivered = 0;
  function random() {
    rng = (Math.imul(rng, 1664525) + 1013904223) >>> 0;
    return rng / 4294967296;
  }
  function enqueue(to: number, direction: 'up' | 'down', message: Message) {
    // First update in each direction is always lost: every generated scenario really tests loss.
    const key = direction === 'up' ? 'droppedUp' : 'droppedDown';
    if (faults && direction === 'up') upstreamAttempts++;
    const protectedProbe = direction === 'up' && upstreamAttempts === 2;
    const firstAck =
      direction === 'down' &&
      message.ack !== undefined &&
      metrics.droppedAck === 0;
    if (
      faults &&
      !protectedProbe &&
      (random() < 0.23 ||
        firstAck ||
        (message.type === (direction === 'up' ? 'update' : 'sync') &&
          metrics[key] === 0))
    ) {
      metrics[key]++;
      if (message.ack !== undefined) metrics.droppedAck++;
      return;
    }
    const delay = faults ? 1 + Math.floor(random() * 12) : 0;
    if (delay) metrics.delayed++;
    const packet = { id: ++serial, to, direction, due: clock + delay, message };
    queue.push(packet);
    if (faults && random() < 0.2) {
      queue.push({ ...packet, id: ++serial, due: packet.due + 2 });
      metrics.duplicated++;
    }
  }
  async function barrier(index: number, message?: Message) {
    const ws = sockets[index];
    assert.equal(
      ws.readyState,
      WebSocket.OPEN,
      'server closed a valid chaos session',
    );
    // ws preserves order. A subsequent pong is a processing barrier, not a state repair.
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(
        () => reject(new Error('WebSocket processing barrier timed out')),
        3000,
      );
      barriers.set(index, () => {
        clearTimeout(timeout);
        barriers.delete(index);
        resolve();
      });
      if (message) ws.send(JSON.stringify(message));
      ws.send(JSON.stringify({ type: 'ping' }));
    });
  }
  async function send(index: number, message: Message) {
    await barrier(index, message);
    // Observe every broadcast before assigning seeded delays, independent of OS callback order.
    await Promise.all(
      sockets.map((_, i) => (i === index ? Promise.resolve() : barrier(i))),
    );
    for (let i = 0; i < inbox.length; i++) {
      for (const response of inbox[i].splice(0)) enqueue(i, 'down', response);
    }
  }
  for (let i = 0; i < clients.length; i++) {
    const token = randomUUID();
    app.store.db
      .prepare('INSERT INTO sessions(token,user_id,expires) VALUES(?,?,?)')
      .run(digest(token), users[i].id, Date.now() + 60000);
    const ws = new WebSocket(`ws://127.0.0.1:${address.port}/ws`, {
      origin,
      headers: { Cookie: `session=${token}` },
    });
    sockets.push(ws);
    ws.on('message', (raw) => {
      const message = JSON.parse(raw.toString()) as Message;
      if (message.type === 'pong') {
        barriers.get(i)?.();
        return;
      }
      if (message.type === 'error') errors.push(String(message.error));
      if (message.type === 'sync') inbox[i].push(message);
    });
    ws.on('error', (error) => errors.push(error.message));
    await once(ws, 'open');
    await send(i, clients[i].joinMessage(document.id));
  }
  async function advance(ticks = 1) {
    clock += ticks;
    for (;;) {
      queue.sort((a, b) => a.due - b.due || a.id - b.id);
      const next = queue[0];
      if (!next || next.due > clock) break;
      queue.shift();
      if (next.id < lastDelivered) metrics.reordered++;
      lastDelivered = Math.max(lastDelivered, next.id);
      metrics.delivered++;
      if (next.direction === 'up') await send(next.to, next.message);
      else clients[next.to].receive(next.message.update, next.message.ack);
    }
  }
  await advance(0);
  Y.applyUpdate(oracle, Y.encodeStateAsUpdate(clients[0].doc));
  return {
    app,
    document,
    clients,
    oracle,
    metrics,
    startFaults() {
      faults = true;
    },
    async edit(op: Edit) {
      const c = clients[op.user];
      const points = Array.from(c.text.toString());
      points.splice(
        op.at % (points.length + 1),
        op.remove,
        ...Array.from(op.text),
      );
      c.replace(points.join(''));
      assert.equal(
        c.text.toString(),
        points.join(''),
        'local operation differs from independent string model',
      );
      const update = c.batch();
      if (update) {
        // Independent oracle receives the edit BEFORE transport faults; server copying cannot hide a lost edit.
        Y.applyUpdate(oracle, decode(update.update));
        enqueue(op.user, 'up', { type: 'update', ...update });
      }
      await advance(op.advance);
    },
    restore(index: number) {
      const copy = JSON.parse(JSON.stringify(clients[index].snapshot()));
      clients[index].destroy();
      clients[index] = new Replica();
      clients[index].doc.clientID = 20 + index;
      clients[index].restore(copy);
    },
    async repair(enabled = true) {
      faults = false;
      await advance(100);
      for (let round = 0; round < 3; round++) {
        if (enabled)
          for (let i = 0; i < clients.length; i++)
            for (const m of clients[i].repairMessages(i !== 3))
              enqueue(i, 'up', m);
        await advance(100);
      }
      assert.deepEqual(errors, [], 'valid recovery messages must be accepted');
      const expected = oracle.getText('markdown').toString();
      assert.equal(
        app.store.document(document.id)!.markdown,
        expected,
        'durable server state lost an accepted local edit',
      );
      for (const c of clients) {
        assert.equal(
          c.text.toString(),
          expected,
          'client did not independently converge',
        );
        assert.deepEqual(
          Y.encodeStateVector(c.doc),
          Y.encodeStateVector(oracle),
          'replica operation frontier differs',
        );
        assert.equal(c.pending.size, 0, 'acknowledged queue must drain');
      }
      assert.equal(queue.length, 0);
      const state = app.store.state(document.id);
      try {
        assert.equal(state.getText('markdown').toString(), expected);
      } finally {
        state.destroy();
      }
      return expected;
    },
    async close() {
      sockets.forEach((ws) => ws.terminate());
      clients.forEach((c) => c.destroy());
      oracle.destroy();
      await app.close();
    },
  };
}
