import express from 'express';
import { attachAccessRoutes } from './access-routes.js';
import rateLimit from 'express-rate-limit';
import { createServer } from 'node:http';
import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { attachPresence } from './presence.js';
import { digest, tokenFrom } from './session.js';
import { createStore } from './store.js';
import { renderMarkdown } from './markdown.js';

const derive = promisify(scrypt);
export function createApplication(
  database: string,
  origin: string,
  options: { heartbeatMs?: number } = {},
) {
  const store = createStore(database);
  const app = express();
  const server = createServer(app);
  const presence = attachPresence(server, store, origin, options.heartbeatMs);
  app.disable('x-powered-by');
  app.use((_req, res, next) => {
    res.setHeader(
      'Content-Security-Policy',
      "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
    );
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');
    next();
  });
  app.use('/api', (_req, res, next) => {
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(express.json({ limit: '512kb' }));
  app.use('/api', (req, res, next) => {
    if (
      !['GET', 'HEAD'].includes(req.method) &&
      req.headers.origin !== origin
    ) {
      res.status(403).json({ error: 'Untrusted request origin.' });
      return;
    }
    next();
  });
  const authLimit = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 30,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { error: 'Too many attempts. Try again in 15 minutes.' },
  });
  app.post(['/api/signup', '/api/login'], authLimit, async (req, res, next) => {
    try {
      const { email, password, name } = req.body ?? {};
      if (
        typeof email !== 'string' ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
        email.length > 254 ||
        typeof password !== 'string' ||
        password.length < 12 ||
        password.length > 128
      ) {
        res.status(400).json({
          error: 'Enter a valid email and a password of 12–128 characters.',
        });
        return;
      }
      const normalized = email.trim().toLowerCase();
      let user = store.user(normalized);
      if (req.path === '/api/signup') {
        if (typeof name !== 'string' || !name.trim() || name.length > 60) {
          res.status(400).json({ error: 'Name must be 1–60 characters.' });
          return;
        }
        if (user) {
          res
            .status(409)
            .json({ error: 'Unable to create this account. Try signing in.' });
          return;
        }
        const salt = randomBytes(16).toString('hex');
        const hash = (await derive(password, salt, 64)) as Buffer;
        // Concurrent signups may race after the async hash; the database UNIQUE constraint remains authoritative.
        if (store.user(normalized)) {
          res
            .status(409)
            .json({ error: 'Unable to create this account. Try signing in.' });
          return;
        }
        store.addUser(
          normalized,
          name.trim(),
          `${salt}:${hash.toString('hex')}`,
        );
        user = store.user(normalized)!;
      } else {
        const [salt, expected] = (
          user?.password ?? `${'0'.repeat(32)}:${'0'.repeat(128)}`
        ).split(':');
        const actual = (await derive(password, salt, 64)) as Buffer;
        if (!user || !timingSafeEqual(actual, Buffer.from(expected, 'hex'))) {
          res.status(401).json({ error: 'Email or password is incorrect.' });
          return;
        }
      }
      const token = randomBytes(32).toString('hex');
      store.addSession(digest(token), user.id);
      res.cookie('session', token, {
        httpOnly: true,
        sameSite: 'strict',
        secure: origin.startsWith('https:'),
        maxAge: 86400000,
        path: '/',
      });
      res.json({ id: user.id, name: user.name, email: user.email });
    } catch (error) {
      next(error);
    }
  });
  app.use('/api', (req, res, next) => {
    const user = store.session(digest(tokenFrom(req.headers.cookie)));
    if (!user) {
      res.status(401).json({ error: 'Please sign in.' });
      return;
    }
    res.locals.user = user;
    next();
  });
  app.get('/api/me', (_req, res) => {
    const { id, name, email } = res.locals.user;
    res.json({ id, name, email });
  });
  app.post('/api/logout', (req, res) => {
    const token = digest(tokenFrom(req.headers.cookie));
    store.removeSession(token);
    presence.revoke(token);
    res.clearCookie('session', { path: '/' }).json({ ok: true });
  });
  app.get('/api/documents', (_req, res) =>
    res.json(store.list(res.locals.user.id)),
  );
  const view = (id: number, user: number) => {
    const doc = store.document(id)!;
    const { y_state: _state, ...safe } = doc;
    void _state;
    return {
      ...safe,
      role: store.role('document', id, user),
      canManage: store.owner('document', id, user),
    };
  };
  const content = (
    body: unknown,
  ): body is {
    title: string;
    markdown: string;
    version: number;
    projectId?: number;
    folderId?: number;
  } => {
    if (!body || typeof body !== 'object') return false;
    const b = body as Record<string, unknown>;
    return (
      typeof b.title === 'string' &&
      b.title.trim().length > 0 &&
      b.title.length <= 160 &&
      typeof b.markdown === 'string' &&
      b.markdown.length <= 100000
    );
  };
  app.post('/api/documents', (req, res) => {
    if (!content(req.body)) {
      res.status(400).json({
        error:
          'Provide a title (1–160 characters) and Markdown (up to 100,000 characters).',
      });
      return;
    }
    const project = req.body.projectId ?? null,
      folder = req.body.folderId ?? null;
    if (
      project !== null &&
      (!Number.isSafeInteger(project) ||
        !['owner', 'edit'].includes(
          store.role('project', project, res.locals.user.id) ?? '',
        ))
    ) {
      res.status(403).json({ error: 'Project editing access required.' });
      return;
    }
    if (
      folder !== null &&
      (!Number.isSafeInteger(folder) ||
        store.folder(folder)?.project_id !== project)
    ) {
      res.status(400).json({ error: 'Invalid folder.' });
      return;
    }
    const doc = store.create(
      req.body.title.trim(),
      res.locals.user.id,
      req.body.markdown,
    );
    store.place(doc.id, project, folder);
    res.status(201).json(view(doc.id, res.locals.user.id));
  });
  app.param('id', (_req, res, next, value) => {
    if (!/^[1-9][0-9]*$/.test(value) || !Number.isSafeInteger(Number(value))) {
      res.status(400).json({ error: 'Invalid document ID.' });
      return;
    }
    next();
  });
  attachAccessRoutes(app, store, () => presence.changed());
  app.get('/api/documents/:id', (req, res) => {
    const doc = store.document(Number(req.params.id));
    if (!doc || !store.role('document', doc.id, res.locals.user.id)) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    res.json(view(doc.id, res.locals.user.id));
  });
  app.put('/api/documents/:id', (req, res) => {
    if (
      !content(req.body) ||
      !Number.isSafeInteger(req.body.version) ||
      req.body.version < 1
    ) {
      res.status(400).json({ error: 'Invalid document or version.' });
      return;
    }
    const id = Number(req.params.id);
    if (!store.role('document', id, res.locals.user.id)) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    if (store.role('document', id, res.locals.user.id) === 'read') {
      res.status(403).json({ error: 'Read-only access.' });
      return;
    }
    if (
      !store.save(
        id,
        req.body.title.trim(),
        req.body.markdown,
        req.body.version,
      )
    ) {
      res.status(409).json({
        error:
          'Another editor saved a newer version. Copy your changes, then reload the document.',
      });
      return;
    }
    presence.changed(id);
    res.json(view(id, res.locals.user.id));
  });
  app.post('/api/preview', (req, res) => {
    if (
      typeof req.body?.markdown !== 'string' ||
      req.body.markdown.length > 100000
    ) {
      res.status(400).json({ error: 'Invalid Markdown.' });
      return;
    }
    res.json({ html: renderMarkdown(req.body.markdown) });
  });
  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'API route not found.' });
  });
  app.use(express.static('public'));
  app.use(
    (
      error: { status?: number },
      _req: express.Request,
      res: express.Response,
      _next: express.NextFunction,
    ) => {
      res
        .status(error.status === 413 ? 413 : error.status === 400 ? 400 : 500)
        .json({
          error:
            error.status === 413
              ? 'Request too large.'
              : 'Request could not be processed.',
        });
    },
  );
  return {
    app,
    server,
    store,
    async close() {
      await presence.close();
      await new Promise<void>((resolve) => server.close(() => resolve()));
      store.db.close();
    },
  };
}
