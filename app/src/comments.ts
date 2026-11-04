import rateLimit from 'express-rate-limit';
import type { Express } from 'express';
import type { createStore } from './store.js';

export function attachComments(
  app: Express,
  store: ReturnType<typeof createStore>,
) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS comments (
    id INTEGER PRIMARY KEY, document_id INTEGER NOT NULL REFERENCES documents(id),
    author INTEGER NOT NULL REFERENCES users(id), body TEXT NOT NULL, quote TEXT NOT NULL,
    version INTEGER NOT NULL, resolved INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE INDEX IF NOT EXISTS comments_document ON comments(document_id, id);`);
  app.use('/api/documents/:id/comments', (req, res, next) => {
    if (!store.role('document', Number(req.params.id), res.locals.user.id)) {
      res.status(404).json({ error: 'Document not found.' });
      return;
    }
    next();
  });
  app.get('/api/documents/:id/comments', (req, res) => {
    res.json(
      db
        .prepare(
          `SELECT c.*, u.name AS authorName FROM comments c JOIN users u ON u.id=c.author
      WHERE c.document_id=? ORDER BY c.id DESC`,
        )
        .all(Number(req.params.id)),
    );
  });
  app.post(
    '/api/documents/:id/comments',
    rateLimit({
      windowMs: 60000,
      limit: 60,
      message: { error: 'Too many comments. Try again shortly.' },
    }),
    (req, res) => {
      const id = Number(req.params.id),
        user = res.locals.user.id;
      if (store.role('document', id, user) === 'read') {
        res
          .status(403)
          .json({ error: 'Editing access is required to comment.' });
        return;
      }
      const { body, start, end, version } = req.body ?? {};
      if (
        typeof body !== 'string' ||
        !body.trim() ||
        body.length > 2000 ||
        !Number.isSafeInteger(start) ||
        !Number.isSafeInteger(end) ||
        start < 0 ||
        end <= start ||
        end - start > 2000 ||
        !Number.isSafeInteger(version)
      ) {
        res.status(400).json({
          error:
            'Select 1–2,000 characters and write a comment of up to 2,000 characters.',
        });
        return;
      }
      const doc = store.document(id)!;
      if (version !== doc.version) {
        res.status(409).json({
          error:
            'The document changed. Close comments and select the passage again.',
        });
        return;
      }
      if (end > doc.markdown.length) {
        res.status(400).json({ error: 'Invalid selection.' });
        return;
      }
      const result = db
        .prepare(
          'INSERT INTO comments(document_id,author,body,quote,version) VALUES(?,?,?,?,?)',
        )
        .run(id, user, body.trim(), doc.markdown.slice(start, end), version);
      res.status(201).json({ id: Number(result.lastInsertRowid) });
    },
  );
  app.patch('/api/documents/:id/comments/:comment', (req, res) => {
    const id = Number(req.params.id),
      cid = Number(req.params.comment),
      user = res.locals.user.id;
    const row = Number.isSafeInteger(cid)
      ? db
          .prepare('SELECT author FROM comments WHERE id=? AND document_id=?')
          .get(cid, id)
      : undefined;
    if (!row) {
      res.status(404).json({ error: 'Comment not found.' });
      return;
    }
    if (
      store.role('document', id, user) === 'read' ||
      (row.author !== user && !store.owner('document', id, user))
    ) {
      res.status(403).json({
        error: 'Only the comment author or document owner can resolve it.',
      });
      return;
    }
    if (typeof req.body?.resolved !== 'boolean') {
      res.status(400).json({ error: 'Invalid comment status.' });
      return;
    }
    db.prepare('UPDATE comments SET resolved=? WHERE id=?').run(
      Number(req.body.resolved),
      cid,
    );
    res.json({ ok: true });
  });
}
