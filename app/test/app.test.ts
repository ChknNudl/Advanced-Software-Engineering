import * as Y from 'yjs';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readdirSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { createApplication } from '../src/app.js';
import { renderMarkdown } from '../src/markdown.js';
import { digest, tokenFrom } from '../src/session.js';

async function fixture(options: { heartbeatMs?: number } = {}) {
  const dir = mkdtempSync(join(tmpdir(), 'marksync-test-'));
  const app = createApplication(
    join(dir, 'test.sqlite'),
    'http://localhost:3000',
    options,
  );
  app.server.listen(0, '127.0.0.1');
  await once(app.server, 'listening');
  const address = app.server.address();
  assert(address && typeof address !== 'string');
  const url = `http://127.0.0.1:${address.port}`;
  const request = (
    path: string,
    method = 'GET',
    body?: unknown,
    cookie = '',
    origin = 'http://localhost:3000',
  ) =>
    fetch(url + '/api' + path, {
      method,
      headers: { 'Content-Type': 'application/json', origin, cookie },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  async function signup(name: string) {
    const res = await request('/signup', 'POST', {
      email: `${name}@example.com`,
      name,
      password: 'a long test password',
    });
    assert.equal(res.status, 200);
    return res.headers.get('set-cookie')!.split(';')[0];
  }
  return {
    ...app,
    url,
    request,
    signup,
    grant(
      id: number,
      cookie: string,
      role: 'read' | 'edit' = 'edit',
      scope: 'document' | 'project' = 'document',
    ) {
      const user = app.store.session(digest(tokenFrom(cookie)))!;
      const owner =
        scope === 'document'
          ? app.store.document(id)!.author
          : app.store.project(id)!.owner;
      const link = app.store.createLink(scope, id, role, owner);
      app.store.redeem(link.token, user.id);
      return link;
    },
    async cleanup() {
      await app.close();
      rmSync(dir, { recursive: true, force: true });
    },
  };
}

test('concurrent duplicate signups create exactly one account', async () => {
  const f = await fixture();
  try {
    const body = {
      name: 'Same',
      email: 'same@example.com',
      password: 'a long test password',
    };
    const results = await Promise.all([
      f.request('/signup', 'POST', body),
      f.request('/signup', 'POST', body),
    ]);
    assert.deepEqual(results.map((r) => r.status).sort(), [200, 409]);
    assert.equal(
      f.store.db.prepare('SELECT COUNT(*) AS count FROM users').get()!.count,
      1,
    );
  } finally {
    await f.cleanup();
  }
});

test('invalid IDs, versions, JSON and cross-origin writes are rejected', async () => {
  const f = await fixture();
  try {
    const cookie = await f.signup('Ada');
    for (const id of ['NaN', '-1', '1.5', '9007199254740992'])
      assert.equal(
        (await f.request(`/documents/${id}`, 'GET', undefined, cookie)).status,
        400,
      );
    const doc = await (
      await f.request(
        '/documents',
        'POST',
        { title: 'Plan', markdown: '' },
        cookie,
      )
    ).json();
    for (const version of [0, -1, 1.5, '1'])
      assert.equal(
        (
          await f.request(
            `/documents/${doc.id}`,
            'PUT',
            { title: 'Changed', markdown: '', version },
            cookie,
          )
        ).status,
        400,
      );
    assert.equal(
      (
        await f.request(
          '/documents',
          'POST',
          { title: 'Injected', markdown: '' },
          cookie,
          'https://attacker.example',
        )
      ).status,
      403,
    );
    const invalid = await fetch(f.url + '/api/documents', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        origin: 'http://localhost:3000',
        cookie,
      },
      body: '{',
    });
    assert.equal(invalid.status, 400);
    assert.equal(
      (await f.request('/missing', 'GET', undefined, cookie)).status,
      404,
    );
    assert.equal(f.store.document(doc.id)!.title, 'Plan');
  } finally {
    await f.cleanup();
  }
});

test('valid multilingual documents fit the advertised character limit', async () => {
  const f = await fixture();
  try {
    const cookie = await f.signup('Ada');
    const markdown = '文'.repeat(100000);
    const created = await f.request(
      '/documents',
      'POST',
      { title: 'Unicode', markdown },
      cookie,
    );
    assert.equal(created.status, 201);
    assert.equal((await created.json()).markdown, markdown);
  } finally {
    await f.cleanup();
  }
});

test(
  'expired sessions reject HTTP and close idle sockets with a policy code',
  { timeout: 10000 },
  async () => {
    const f = await fixture({ heartbeatMs: 50 });
    let ws: WebSocket | undefined;
    try {
      const cookie = await f.signup('Ada');
      ws = new WebSocket(f.url.replace('http:', 'ws:') + '/ws', {
        headers: { cookie, origin: 'http://localhost:3000' },
      });
      await once(ws, 'open');
      const closed = once(ws, 'close');
      f.store.db
        .prepare('UPDATE sessions SET expires=0 WHERE token=?')
        .run(digest(tokenFrom(cookie)));
      assert.equal(
        (await f.request('/me', 'GET', undefined, cookie)).status,
        401,
      );
      assert.equal((await closed)[0], 1008);
    } finally {
      ws?.terminate();
      await f.cleanup();
    }
  },
);

test(
  'logout revokes sockets even before they join a document',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    let ws: WebSocket | undefined;
    try {
      const cookie = await f.signup('Ada');
      ws = new WebSocket(f.url.replace('http:', 'ws:') + '/ws', {
        headers: { cookie, origin: 'http://localhost:3000' },
      });
      await once(ws, 'open');
      const closed = once(ws, 'close');
      await f.request('/logout', 'POST', {}, cookie);
      assert.equal((await closed)[0], 1008);
    } finally {
      ws?.terminate();
      await f.cleanup();
    }
  },
);

test(
  'rosters isolate rooms, deduplicate tabs and support reconnect',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    const clients: WebSocket[] = [];
    const message = (ws: WebSocket) =>
      once(ws, 'message').then(([data]) => JSON.parse(data.toString()));
    async function connect(cookie: string) {
      const ws = new WebSocket(f.url.replace('http:', 'ws:') + '/ws', {
        headers: { cookie, origin: 'http://localhost:3000' },
      });
      clients.push(ws);
      await once(ws, 'open');
      return ws;
    }
    async function joinRoom(ws: WebSocket, id: number) {
      const pending = message(ws);
      ws.send(JSON.stringify({ type: 'join', documentId: id }));
      return pending;
    }
    try {
      const a = await f.signup('Ada');
      const b = await f.signup('Grace');
      const one = f.store.create(
        'One',
        f.store.user('ada@example.com')!.id,
        '',
      );
      const two = f.store.create(
        'Two',
        f.store.user('ada@example.com')!.id,
        '',
      );
      f.grant(one.id, b);
      f.grant(two.id, b);
      const wa = await connect(a);
      const wa2 = await connect(a);
      const wb = await connect(b);
      assert.equal((await joinRoom(wa, one.id)).users.length, 1);
      assert.equal((await joinRoom(wa2, one.id)).users.length, 1);
      assert.deepEqual(
        (await joinRoom(wb, two.id)).users.map((u: { name: string }) => u.name),
        ['Grace'],
      );
      const presence = message(wa);
      await joinRoom(wb, one.id);
      assert.equal((await presence).users.length, 2);
      const afterClose = message(wa);
      wb.close();
      assert.equal((await afterClose).users.length, 1);
      const reconnected = await connect(b);
      assert.equal((await joinRoom(reconnected, one.id)).users.length, 2);
    } finally {
      for (const ws of clients) ws.terminate();
      await f.cleanup();
    }
  },
);

test(
  'WebSocket rejects malformed JSON and oversized messages',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    const clients: WebSocket[] = [];
    try {
      const cookie = await f.signup('Ada');
      for (const [payload, code] of [
        ['{', 1007],
        ['x'.repeat(2100001), 1009],
      ] as const) {
        const ws = new WebSocket(f.url.replace('http:', 'ws:') + '/ws', {
          headers: { cookie, origin: 'http://localhost:3000' },
        });
        clients.push(ws);
        await once(ws, 'open');
        const closed = once(ws, 'close');
        ws.send(payload);
        assert.equal((await closed)[0], code);
      }
    } finally {
      for (const ws of clients) ws.terminate();
      await f.cleanup();
    }
  },
);

test('Markdown preserves safe links, tables and escaped code', () => {
  const html = renderMarkdown(
    '[safe](https://example.com)\n\n| A | B |\n|---|---|\n| 1 | 2 |\n\n```html\n<script>alert(1)</script>\n```',
  );
  assert.match(html, /href="https:\/\/example.com"/);
  assert.match(html, /<table>/);
  assert.match(html, /&lt;script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});

test('database-backed signup, cookie login, logout, and invalid input', async () => {
  const f = await fixture();
  try {
    assert.equal((await f.request('/documents')).status, 401);
    assert.equal(
      (await f.request('/signup', 'POST', { email: 'bad', password: 'short' }))
        .status,
      400,
    );
    const cookie = await f.signup('Ada');
    assert.equal(
      (await f.request('/me', 'GET', undefined, cookie)).status,
      200,
    );
    assert.equal(
      (
        await f.request('/login', 'POST', {
          email: 'Ada@example.com',
          password: 'incorrect password',
        })
      ).status,
      401,
    );
    const login = await f.request('/login', 'POST', {
      email: 'Ada@example.com',
      password: 'a long test password',
    });
    assert.equal(login.status, 200);
    assert.match(login.headers.get('set-cookie')!, /HttpOnly/);
    assert.match(login.headers.get('set-cookie')!, /SameSite=Strict/);
    assert.notEqual(
      f.store.user('ada@example.com')!.password,
      'a long test password',
    );
    assert.equal(
      (
        await f.request(
          '/logout',
          'POST',
          {},
          cookie,
          'https://attacker.example',
        )
      ).status,
      403,
    );
    assert.equal((await f.request('/logout', 'POST', {}, cookie)).status, 200);
    assert.equal(
      (await f.request('/me', 'GET', undefined, cookie)).status,
      401,
    );
  } finally {
    await f.cleanup();
  }
});

test('documents preserve authorship and reject stale concurrent saves', async () => {
  const f = await fixture();
  try {
    const a = await f.signup('Ada');
    const b = await f.signup('Grace');
    const created = await f.request(
      '/documents',
      'POST',
      { title: 'Plan', markdown: '# Hello' },
      a,
    );
    assert.equal(created.status, 201);
    const doc = await created.json();
    f.grant(doc.id, b);
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'GET', undefined, b)).status,
      200,
    );
    const saves = await Promise.all(
      [a, b].map((cookie) =>
        f.request(
          `/documents/${doc.id}`,
          'PUT',
          { title: 'Updated', markdown: '# Changed', version: doc.version },
          cookie,
        ),
      ),
    );
    assert.deepEqual(saves.map((r) => r.status).sort(), [200, 409]);
    const saved = await (
      await f.request(`/documents/${doc.id}`, 'GET', undefined, a)
    ).json();
    assert.equal(saved.version, 2);
    assert.equal(saved.author, doc.author);
    assert.equal(saved.markdown, '# Changed');
    assert.equal(
      (await f.request('/documents/9999', 'GET', undefined, a)).status,
      404,
    );
    assert.equal(
      (await f.request('/documents', 'POST', { title: '', markdown: '' }, a))
        .status,
      400,
    );
    assert.equal(
      (
        await f.request(
          '/documents',
          'POST',
          { title: 'Long', markdown: 'x'.repeat(100001) },
          a,
        )
      ).status,
      400,
    );
    const preview = await (
      await f.request('/preview', 'POST', { markdown: '# Heading' }, a)
    ).json();
    assert.match(preview.html, /<h1>Heading<\/h1>/);
  } finally {
    await f.cleanup();
  }
});

test('accounts, sessions and documents survive application restart', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'marksync-persist-'));
  const path = join(dir, 'db.sqlite');
  const first = createApplication(path, 'http://localhost:3000');
  const user = first.store.addUser(
    'persist@example.com',
    'Persist',
    'test-only',
  );
  first.store.addSession('test-token-hash', user.id);
  const doc = first.store.create('Persisted', user.id, '# Still here');
  await first.close();
  const second = createApplication(path, 'http://localhost:3000');
  try {
    assert.equal(second.store.session('test-token-hash')!.id, user.id);
    assert.equal(second.store.document(doc.id)!.markdown, '# Still here');
  } finally {
    await second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('Markdown renders structure while stripping executable HTML and unsafe links', () => {
  const html = renderMarkdown(
    '# Heading\n\n**bold**\n\n<script>alert(1)</script>\n\n[bad](javascript:alert(1))\n\n<img src=x onerror=alert(1)>',
  );
  assert.match(html, /<h1>Heading<\/h1>/);
  assert.match(html, /<strong>bold<\/strong>/);
  assert.doesNotMatch(html, /script|javascript:|onerror|<img/);
  assert.match(
    renderMarkdown('- one\n- two\n\n```js\nconst x = 1;\n```'),
    /<ul>/,
  );
});

test(
  'real WebSockets receive join roster, ping-pong, disconnect and logout',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    const clients: WebSocket[] = [];
    const message = (ws: WebSocket) =>
      once(ws, 'message').then(([data]) => JSON.parse(data.toString()));
    async function connect(cookie: string) {
      const ws = new WebSocket(f.url.replace('http:', 'ws:') + '/ws', {
        headers: { cookie, origin: 'http://localhost:3000' },
      });
      clients.push(ws);
      await once(ws, 'open');
      return ws;
    }
    try {
      const a = await f.signup('Ada');
      const b = await f.signup('Grace');
      const doc = await (
        await f.request(
          '/documents',
          'POST',
          { title: 'Room', markdown: '' },
          a,
        )
      ).json();
      f.grant(doc.id, b);
      const wa = await connect(a);
      let pending = message(wa);
      wa.send(JSON.stringify({ type: 'join', documentId: doc.id }));
      assert.equal((await pending).users.length, 1);
      const wb = await connect(b);
      pending = message(wa);
      const other = message(wb);
      wb.send(JSON.stringify({ type: 'join', documentId: doc.id }));
      assert.equal((await pending).users.length, 2);
      assert.equal((await other).users.length, 2);
      pending = message(wb);
      wb.send(JSON.stringify({ type: 'ping' }));
      assert.equal((await pending).type, 'pong');
      pending = message(wa);
      wb.close();
      assert.equal((await pending).users.length, 1);
      const closed = once(wa, 'close');
      await f.request('/logout', 'POST', {}, a);
      assert.equal((await closed)[0], 1008);
    } finally {
      for (const ws of clients) ws.terminate();
      await f.cleanup();
    }
  },
);

test(
  'WebSocket rejects unauthenticated and cross-origin upgrades',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    try {
      const cookie = await f.signup('Ada');
      for (const headers of [
        { origin: 'http://localhost:3000', cookie: '' },
        { origin: 'https://attacker.example', cookie },
      ]) {
        const status = await new Promise<number>((resolve, reject) => {
          const ws = new WebSocket(f.url.replace('http:', 'ws:') + '/ws', {
            headers,
          });
          ws.on('unexpected-response', (_req, res) => {
            resolve(res.statusCode!);
            res.resume();
            ws.terminate();
          });
          ws.on('error', () => {});
          ws.on('open', () => {
            ws.terminate();
            reject(new Error('Unauthorized socket opened'));
          });
        });
        assert.equal(status, 401);
      }
    } finally {
      await f.cleanup();
    }
  },
);

test('projects, folders, invitation permissions, trash and ownership boundaries', async () => {
  const f = await fixture();
  try {
    const a = await f.signup('Owner'),
      b = await f.signup('Viewer'),
      c = await f.signup('Editor'),
      stranger = await f.signup('Stranger');
    const project = await (
      await f.request('/projects', 'POST', { name: 'Team project' }, a)
    ).json();
    const folder = await (
      await f.request(
        '/folders',
        'POST',
        { name: 'Research', projectId: project.id },
        a,
      )
    ).json();
    const doc = await (
      await f.request(
        '/documents',
        'POST',
        {
          title: 'Private',
          markdown: 'hello',
          projectId: project.id,
          folderId: folder.id,
        },
        a,
      )
    ).json();
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'GET', undefined, b)).status,
      404,
    );
    assert.deepEqual(
      await (await f.request('/documents', 'GET', undefined, stranger)).json(),
      [],
    );
    const read = await (
      await f.request(
        `/projects/${project.id}/shares`,
        'POST',
        { role: 'read' },
        a,
      )
    ).json();
    assert.equal(
      (await f.request('/shares/redeem', 'POST', { token: read.token }, b))
        .status,
      200,
    );
    assert.equal(
      (
        await (
          await f.request(`/documents/${doc.id}`, 'GET', undefined, b)
        ).json()
      ).role,
      'read',
    );
    assert.equal(
      (
        await f.request(
          `/documents/${doc.id}`,
          'PUT',
          { title: 'No', markdown: 'No', version: 1 },
          b,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          '/folders',
          'POST',
          { name: 'No', projectId: project.id },
          b,
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          `/documents/${doc.id}/shares`,
          'POST',
          { role: 'edit' },
          b,
        )
      ).status,
      403,
    );
    const edit = f.grant(project.id, c, 'edit', 'project');
    assert.equal(
      (
        await f.request(
          `/documents/${doc.id}`,
          'PUT',
          { title: 'Updated', markdown: 'hello', version: 1 },
          c,
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'DELETE', undefined, c)).status,
      403,
    );
    assert.equal(
      (
        await f.request(
          '/documents',
          'POST',
          { title: 'Shared draft', markdown: '', projectId: project.id },
          c,
        )
      ).status,
      201,
    );
    assert.equal(
      (
        await f.request(
          `/projects/${project.id}/shares/${edit.id}`,
          'DELETE',
          undefined,
          a,
        )
      ).status,
      200,
    );
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'GET', undefined, c)).status,
      404,
    );
    assert.equal(
      (await f.request('/shares/redeem', 'POST', { token: edit.token }, c))
        .status,
      404,
    );
    const other = await (
      await f.request('/projects', 'POST', { name: 'Other' }, a)
    ).json();
    assert.equal(
      (
        await f.request(
          `/documents/${doc.id}/location`,
          'PATCH',
          { projectId: other.id, folderId: folder.id },
          a,
        )
      ).status,
      400,
    );
    assert.equal(
      (
        await f.request(
          `/documents/${doc.id}/location`,
          'PATCH',
          { projectId: other.id },
          b,
        )
      ).status,
      403,
    );
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'DELETE', undefined, a)).status,
      200,
    );
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'GET', undefined, b)).status,
      404,
    );
    assert.equal(
      (await (await f.request('/trash', 'GET', undefined, a)).json()).length,
      1,
    );
    assert.equal(
      (await f.request(`/documents/${doc.id}/restore`, 'POST', {}, b)).status,
      403,
    );
    await f.request(`/documents/${doc.id}/restore`, 'POST', {}, a);
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'GET', undefined, b)).status,
      200,
    );
    await f.request(
      `/documents/${doc.id}/location`,
      'PATCH',
      { projectId: other.id },
      a,
    );
    assert.equal(
      (await f.request(`/documents/${doc.id}`, 'GET', undefined, b)).status,
      404,
    );
  } finally {
    await f.cleanup();
  }
});

async function liveClient(
  f: Awaited<ReturnType<typeof fixture>>,
  cookie: string,
  id: number,
) {
  const ws = new WebSocket(f.url.replace('http:', 'ws:') + '/ws', {
    headers: { cookie, origin: 'http://localhost:3000' },
  });
  const messages: Record<string, unknown>[] = [];
  const waiters: {
    type: string;
    resolve: (message: Record<string, unknown>) => void;
  }[] = [];
  ws.on('message', (raw) => {
    const m = JSON.parse(raw.toString());
    const index = waiters.findIndex((w) => w.type === m.type);
    if (index >= 0) waiters.splice(index, 1)[0].resolve(m);
    else messages.push(m);
  });
  const next = (type: string): Promise<Record<string, unknown>> => {
    const index = messages.findIndex((m) => m.type === type);
    if (index >= 0) return Promise.resolve(messages.splice(index, 1)[0]);
    return new Promise((resolve) => waiters.push({ type, resolve }));
  };
  await once(ws, 'open');
  ws.send(JSON.stringify({ type: 'join', documentId: id, live: true }));
  return { ws, next };
}

test(
  'simultaneous Yjs edits converge, persist and reject read-only updates',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    const clients: WebSocket[] = [];
    try {
      const a = await f.signup('Alice'),
        b = await f.signup('Bob'),
        r = await f.signup('Reader');
      const doc = f.store.create(
        'Concurrent',
        f.store.user('alice@example.com')!.id,
        'Hello',
      );
      f.grant(doc.id, b);
      f.grant(doc.id, r, 'read');
      const ca = await liveClient(f, a, doc.id),
        cb = await liveClient(f, b, doc.id),
        cr = await liveClient(f, r, doc.id);
      clients.push(ca.ws, cb.ws, cr.ws);
      const ya = new Y.Doc(),
        yb = new Y.Doc();
      Y.applyUpdate(
        ya,
        Buffer.from(String((await ca.next('sync')).update), 'base64'),
      );
      Y.applyUpdate(
        yb,
        Buffer.from(String((await cb.next('sync')).update), 'base64'),
      );
      await cr.next('sync');
      const updates: Uint8Array[] = [];
      ya.on('update', (u) => updates.push(u));
      yb.on('update', (u) => updates.push(u));
      ya.getText('markdown').insert(5, ' Alice');
      yb.getText('markdown').insert(5, ' Bob');
      ca.ws.send(
        JSON.stringify({
          type: 'update',
          seq: 1,
          update: Buffer.from(updates[0]).toString('base64'),
        }),
      );
      cb.ws.send(
        JSON.stringify({
          type: 'update',
          seq: 1,
          update: Buffer.from(updates[1]).toString('base64'),
        }),
      );
      let ack = await ca.next('sync');
      while (ack.ack !== 1) ack = await ca.next('sync');
      ack = await cb.next('sync');
      while (ack.ack !== 1) ack = await cb.next('sync');
      const saved = f.store.document(doc.id)!;
      assert.match(saved.markdown, /Alice/);
      assert.match(saved.markdown, /Bob/);
      const recovered = new Y.Doc();
      Y.applyUpdate(recovered, saved.y_state!);
      assert.equal(recovered.getText('markdown').toString(), saved.markdown);
      Y.applyUpdate(ya, saved.y_state!);
      Y.applyUpdate(yb, saved.y_state!);
      assert.equal(
        ya.getText('markdown').toString(),
        yb.getText('markdown').toString(),
      );
      const before = saved.markdown,
        closed = once(cr.ws, 'close');
      cr.ws.send(
        JSON.stringify({
          type: 'update',
          seq: 2,
          update: Buffer.from(updates[0]).toString('base64'),
        }),
      );
      assert.equal((await closed)[0], 1008);
      assert.equal(f.store.document(doc.id)!.markdown, before);
      ya.destroy();
      yb.destroy();
      recovered.destroy();
    } finally {
      for (const ws of clients) ws.terminate();
      await f.cleanup();
    }
  },
);

test(
  'revoking a document invitation disconnects joined collaborators immediately',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    let ws: WebSocket | undefined;
    try {
      const a = await f.signup('Owner'),
        b = await f.signup('Guest');
      const doc = f.store.create(
        'Restricted',
        f.store.user('owner@example.com')!.id,
        '',
      );
      const link = f.grant(doc.id, b);
      const client = await liveClient(f, b, doc.id);
      ws = client.ws;
      await client.next('sync');
      const closed = once(ws, 'close');
      await f.request(
        `/documents/${doc.id}/shares/${link.id}`,
        'DELETE',
        undefined,
        a,
      );
      assert.equal((await closed)[0], 1008);
      assert.equal(
        (await f.request(`/documents/${doc.id}`, 'GET', undefined, b)).status,
        404,
      );
    } finally {
      ws?.terminate();
      await f.cleanup();
    }
  },
);

test('legacy migration preserves documents, backs up SQLite and persists collaborative state and grants', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'marksync-migration-')),
    path = join(dir, 'legacy.sqlite');
  const db = new DatabaseSync(path);
  db.exec(`CREATE TABLE users(id INTEGER PRIMARY KEY,email TEXT NOT NULL UNIQUE,name TEXT NOT NULL,password TEXT NOT NULL);
  CREATE TABLE documents(id INTEGER PRIMARY KEY,title TEXT NOT NULL,author INTEGER NOT NULL REFERENCES users(id),markdown TEXT NOT NULL DEFAULT '',version INTEGER NOT NULL DEFAULT 1,updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
  INSERT INTO users VALUES(1,'original@example.test','Original','test-only');
  INSERT INTO documents(id,title,author,markdown) VALUES(1,'Keep me',1,'Original content');`);
  db.close();
  const first = createApplication(path, 'http://localhost:3000');
  assert.equal(first.store.document(1)!.markdown, 'Original content');
  assert.equal(readdirSync(dir).filter((n) => n.endsWith('.bak')).length, 1);
  const user = first.store.addUser('guest@example.test', 'Guest', 'test-only');
  const link = first.store.createLink('document', 1, 'read', 1);
  first.store.redeem(link.token, user.id);
  const y = first.store.state(1);
  y.getText('markdown').insert(16, ' + change');
  first.store.apply(1, Y.encodeStateAsUpdate(y));
  y.destroy();
  await first.close();
  const second = createApplication(path, 'http://localhost:3000');
  try {
    assert.equal(
      second.store.document(1)!.markdown,
      'Original content + change',
    );
    assert.equal(second.store.role('document', 1, user.id), 'read');
    assert.equal(second.store.role('document', 1, 999), undefined);
    const loaded = second.store.state(1);
    assert.equal(
      loaded.getText('markdown').toString(),
      'Original content + change',
    );
    loaded.destroy();
    assert.equal(readdirSync(dir).filter((n) => n.endsWith('.bak')).length, 1);
  } finally {
    await second.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test(
  'reconnect resends merge idempotently and private document joins reveal no state',
  { timeout: 10000 },
  async () => {
    const f = await fixture();
    const sockets: WebSocket[] = [];
    try {
      const a = await f.signup('Author'),
        b = await f.signup('Guest');
      const doc = f.store.create(
        'Private',
        f.store.user('author@example.com')!.id,
        'base',
      );
      const rejected = await liveClient(f, b, doc.id);
      sockets.push(rejected.ws);
      assert.equal(
        (await rejected.next('error')).error,
        'Invalid event or document.',
      );
      f.grant(doc.id, b);
      const first = await liveClient(f, b, doc.id);
      sockets.push(first.ws);
      const y = new Y.Doc();
      Y.applyUpdate(
        y,
        Buffer.from(String((await first.next('sync')).update), 'base64'),
      );
      y.getText('markdown').insert(4, ' guest');
      const update = Buffer.from(Y.encodeStateAsUpdate(y)).toString('base64');
      first.ws.send(JSON.stringify({ type: 'update', seq: 1, update }));
      await first.next('sync');
      first.ws.terminate();
      const second = await liveClient(f, b, doc.id);
      sockets.push(second.ws);
      await second.next('sync');
      second.ws.send(JSON.stringify({ type: 'update', seq: 1, update }));
      await second.next('sync');
      assert.equal(f.store.document(doc.id)!.markdown, 'base guest');
      y.destroy();
      const closed = once(second.ws, 'close');
      await f.request(`/documents/${doc.id}`, 'DELETE', undefined, a);
      assert.equal((await closed)[0], 1008);
    } finally {
      for (const ws of sockets) ws.terminate();
      await f.cleanup();
    }
  },
);
