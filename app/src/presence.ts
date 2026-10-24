import * as Y from 'yjs';
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
  function sync(ws: WebSocket, member: Connection, ack?: number) {
    if (!member.document || !member.live || ws.readyState !== WebSocket.OPEN)
      return;
    const role = store.role('document', member.document, member.id);
    if (!role || !store.session(member.token)) {
      ws.close(1008, 'Access removed');
      return;
    }
    const doc = store.document(member.document)!;
    const y = store.state(member.document);
    const update = Buffer.from(Y.encodeStateAsUpdate(y)).toString('base64');
    y.destroy();
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
  function changed(document?: number, sender?: WebSocket, ack?: number) {
    for (const [ws, member] of connections) {
      if (!member.document || (document && document !== member.document))
        continue;
      if (!store.role('document', member.document, member.id))
        ws.close(1008, 'Access removed');
      else sync(ws, member, ws === sender ? ack : undefined);
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
          if (old && old !== member.document) broadcast(old);
          broadcast(message.documentId);
          sync(ws, member);
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
              !Number.isSafeInteger(message.seq)
            )
              throw new Error('Invalid update');
            store.apply(member.document, Buffer.from(message.update, 'base64'));
            changed(member.document, ws, message.seq);
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
        if (member.document) broadcast(member.document);
      });
    });
  });
  const timer = setInterval(() => {
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
