import * as Y from 'yjs';
import { randomUUID } from 'node:crypto';
import type { Server } from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import type { createStore } from './store.js';
import { digest, tokenFrom } from './session.js';

type PresenceStore = Pick<
  ReturnType<typeof createStore>,
  'session' | 'document' | 'role' | 'state' | 'apply'
>;
interface Connection {
  document?: number;
  id: number;
  name: string;
  token: string;
  alive: boolean;
  live?: boolean;
  updates: number;
  window: number;
  peer: string;
  incremental?: boolean;
  cursor?: { anchor: string; head: string } | null;
  seen?: number;
  awarenessCount?: number;
  awarenessWindow?: number;
}

/** Transport owns ephemeral connections; the store owns durable data. */
export function attachPresence(
  server: Server,
  store: PresenceStore,
  origin: string,
  heartbeatMs = 30000,
) {
  const sockets = new WebSocketServer({ noServer: true, maxPayload: 2100000 });
  const connections = new Map<WebSocket, Connection>();
  function broadcast(document: number) {
    const active = [...connections.entries()].filter(
      ([ws, member]) =>
        member.document === document &&
        ws.readyState === WebSocket.OPEN &&
        store.session(member.token) &&
        store.role('document', document, member.id),
    );
    const users = [
      ...new Map(
        active.map(([, member]) => [
          member.id,
          { id: member.id, name: member.name },
        ]),
      ).values(),
    ];
    for (const [ws] of active)
      ws.send(JSON.stringify({ type: 'presence', users }));
  }
  function awareness(document: number) {
    const peers = [...connections.values()]
      .filter(
        (m) =>
          m.document === document &&
          m.incremental &&
          m.cursor &&
          Date.now() - (m.seen ?? 0) < 30000 &&
          store.session(m.token) &&
          store.role('document', document, m.id),
      )
      .map((m) => ({
        peer: m.peer,
        userId: m.id,
        name: m.name,
        cursor: m.cursor,
      }));
    for (const [ws, m] of connections)
      if (
        m.document === document &&
        m.incremental &&
        ws.readyState === WebSocket.OPEN &&
        store.session(m.token) &&
        store.role('document', document, m.id)
      )
        ws.send(JSON.stringify({ type: 'awareness', peers, self: m.peer }));
  }
  function sync(
    ws: WebSocket,
    member: Connection,
    ack?: number,
    delta?: Uint8Array,
    vector?: Uint8Array,
  ) {
    if (!member.document || !member.live || ws.readyState !== WebSocket.OPEN)
      return;
    const role = store.role('document', member.document, member.id);
    if (!role || !store.session(member.token)) {
      ws.close(1008, 'Access removed');
      return;
    }
    const doc = store.document(member.document)!;
    let update: string;
    if (delta && member.incremental)
      update = Buffer.from(delta).toString('base64');
    else {
      const y = store.state(member.document);
      try {
        update = Buffer.from(Y.encodeStateAsUpdate(y, vector)).toString(
          'base64',
        );
      } finally {
        y.destroy();
      }
    }
    ws.send(
      JSON.stringify({
        type: 'sync',
        update,
        version: doc.version,
        title: doc.title,
        role,
        ack,
      }),
    );
  }
  function changed(
    document?: number,
    sender?: WebSocket,
    ack?: number,
    delta?: Uint8Array,
  ) {
    for (const [ws, member] of connections) {
      if (!member.document || (document && document !== member.document))
        continue;
      if (!store.role('document', member.document, member.id))
        ws.close(1008, 'Access removed');
      else sync(ws, member, ws === sender ? ack : undefined, delta);
    }
  }
  server.on('upgrade', (req, socket, head) => {
    const token = digest(tokenFrom(req.headers.cookie));
    const user = store.session(token);
    if (req.url !== '/ws' || req.headers.origin !== origin || !user) {
      socket.write('HTTP/1.1 401 Unauthorized\r\nConnection: close\r\n\r\n');
      socket.destroy();
      return;
    }
    sockets.handleUpgrade(req, socket, head, (ws) => {
      const member: Connection = {
        id: user.id,
        name: user.name,
        token,
        alive: true,
        updates: 0,
        window: Date.now(),
        peer: randomUUID(),
      };
      connections.set(ws, member);
      ws.on('error', () => {
        if (ws.readyState !== WebSocket.CLOSING) ws.terminate();
      });
      ws.on('pong', () => {
        member.alive = true;
      });
      ws.on('message', (raw) => {
        if (!store.session(token)) {
          ws.close(1008, 'Session expired');
          return;
        }
        let message;
        try {
          message = JSON.parse(raw.toString());
        } catch {
          ws.close(1007, 'Invalid JSON');
          return;
        }
        if (
          message &&
          message.type === 'join' &&
          Number.isSafeInteger(message.documentId) &&
          message.documentId > 0 &&
          store.role('document', message.documentId, member.id)
        ) {
          const old = member.document;
          member.document = message.documentId;
          member.live = message.live === true;
          member.incremental = message.protocol === 2;
          member.cursor = null;
          if (old && old !== member.document) {
            broadcast(old);
            awareness(old);
          }
          broadcast(message.documentId);
          try {
            let vector: Uint8Array | undefined;
            if (member.incremental && message.vector !== undefined) {
              if (
                typeof message.vector !== 'string' ||
                message.vector.length > 100000 ||
                !/^[A-Za-z0-9+/]*={0,2}$/.test(message.vector)
              )
                throw new Error('Invalid vector');
              vector = Buffer.from(message.vector, 'base64');
              Y.decodeStateVector(vector);
            }
            sync(ws, member, undefined, undefined, vector);
            awareness(message.documentId);
          } catch {
            ws.close(1008, 'Invalid state vector');
          }
        } else if (
          message?.type === 'resync' &&
          member.document &&
          member.live &&
          member.incremental
        ) {
          try {
            if (Date.now() - member.window > 10000) {
              member.window = Date.now();
              member.updates = 0;
            }
            if (++member.updates > 200) throw new Error('Too many updates');
            if (
              typeof message.vector !== 'string' ||
              message.vector.length > 100000 ||
              !/^[A-Za-z0-9+/]*={0,2}$/.test(message.vector)
            )
              throw new Error('Invalid vector');
            const vector = Buffer.from(message.vector, 'base64');
            Y.decodeStateVector(vector);
            sync(ws, member, undefined, undefined, vector);
          } catch {
            ws.close(1008, 'Invalid state vector or rate limit');
          }
        } else if (
          message?.type === 'awareness' &&
          member.document &&
          member.incremental &&
          member.live
        ) {
          if (!store.role('document', member.document, member.id)) {
            ws.close(1008, 'Access removed');
            return;
          }
          if (Date.now() - (member.awarenessWindow ?? 0) > 1000) {
            member.awarenessWindow = Date.now();
            member.awarenessCount = 0;
          }
          if ((member.awarenessCount = (member.awarenessCount ?? 0) + 1) > 30)
            return;
          try {
            const cursor = message.cursor;
            if (cursor !== null) {
              for (const key of ['anchor', 'head']) {
                if (
                  typeof cursor?.[key] !== 'string' ||
                  cursor[key].length > 512 ||
                  !/^[A-Za-z0-9+/]*={0,2}$/.test(cursor[key])
                )
                  throw new Error('Invalid cursor');
                Y.decodeRelativePosition(Buffer.from(cursor[key], 'base64'));
              }
            }
            member.cursor =
              cursor === null
                ? null
                : { anchor: cursor.anchor, head: cursor.head };
            member.seen = Date.now();
            awareness(member.document);
          } catch {
            ws.close(1008, 'Invalid cursor');
          }
        } else if (
          message?.type === 'update' &&
          member.document &&
          member.live
        ) {
          if (
            !['owner', 'edit'].includes(
              store.role('document', member.document, member.id) ?? '',
            )
          ) {
            ws.close(1008, 'Editing access removed');
            return;
          }
          if (Date.now() - member.window > 10000) {
            member.window = Date.now();
            member.updates = 0;
          }
          if (++member.updates > 200) {
            ws.close(1008, 'Too many updates');
            return;
          }
          try {
            if (
              typeof message.update !== 'string' ||
              message.update.length > 2000000 ||
              !/^[A-Za-z0-9+/]*={0,2}$/.test(message.update) ||
              !Number.isSafeInteger(message.seq) ||
              message.seq < 1
            )
              throw new Error('Invalid update');
            const update = Buffer.from(message.update, 'base64');
            store.apply(member.document, update);
            changed(member.document, ws, message.seq, update);
          } catch {
            ws.close(1008, 'Invalid update or document limit');
          }
        } else if (message && message.type === 'ping') {
          ws.send(JSON.stringify({ type: 'pong' }));
        } else {
          ws.send(
            JSON.stringify({
              type: 'error',
              error: 'Invalid event or document.',
            }),
          );
        }
      });
      ws.on('close', () => {
        connections.delete(ws);
        if (member.document) {
          broadcast(member.document);
          awareness(member.document);
        }
      });
    });
  });
  const timer = setInterval(() => {
    for (const document of new Set(
      [...connections.values()]
        .map((m) => m.document)
        .filter((id): id is number => !!id),
    ))
      awareness(document);
    for (const [ws, member] of connections) {
      if (ws.readyState !== WebSocket.OPEN) {
        ws.terminate();
        continue;
      }
      // A policy close lets the UI distinguish expiry from a temporary outage.
      if (
        !store.session(member.token) ||
        (member.document && !store.role('document', member.document, member.id))
      ) {
        ws.close(1008, 'Session expired');
        continue;
      }
      if (!member.alive) {
        ws.terminate();
        continue;
      }
      member.alive = false;
      ws.ping();
    }
  }, heartbeatMs);
  timer.unref();
  return {
    changed,
    revoke(token: string) {
      // Includes authenticated sockets that have not joined a document yet.
      for (const [ws, member] of connections)
        if (member.token === token) ws.close(1008, 'Signed out');
    },
    async close() {
      clearInterval(timer);
      for (const ws of sockets.clients) ws.terminate();
      await new Promise<void>((resolve) => sockets.close(() => resolve()));
    },
  };
}
