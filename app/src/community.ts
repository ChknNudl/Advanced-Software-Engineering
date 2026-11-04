import type express from 'express';
import { randomBytes } from 'node:crypto';
import type { createStore } from './store.js';
import { renderMarkdown } from './markdown.js';

type Store = ReturnType<typeof createStore>;
type Profile = {
  displayName: string;
  headline: string;
  bio: string;
  location: string;
  website: string;
  visible: boolean;
  directory: boolean;
  showHeadline: boolean;
  showBio: boolean;
  showLocation: boolean;
  showWebsite: boolean;
};
const fields = {
  displayName: 60,
  headline: 120,
  bio: 2000,
  location: 100,
  website: 500,
};
const flags = [
  'visible',
  'directory',
  'showHeadline',
  'showBio',
  'showLocation',
  'showWebsite',
] as const;

export function community(store: Store) {
  const db = store.db;
  db.exec(`CREATE TABLE IF NOT EXISTS profiles (user_id INTEGER PRIMARY KEY REFERENCES users(id), data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS publications (slug TEXT PRIMARY KEY, document_id INTEGER NOT NULL UNIQUE REFERENCES documents(id), author INTEGER NOT NULL REFERENCES users(id), title TEXT NOT NULL, markdown TEXT NOT NULL, listed INTEGER NOT NULL, published_at TEXT);
    CREATE TRIGGER IF NOT EXISTS unpublish_trashed AFTER UPDATE OF deleted_at ON documents WHEN NEW.deleted_at IS NOT NULL BEGIN UPDATE publications SET published_at=NULL WHERE document_id=NEW.id; END;`);
  function profile(id: number): Profile {
    const row = db.prepare('SELECT data FROM profiles WHERE user_id=?').get(id);
    const user = db.prepare('SELECT name FROM users WHERE id=?').get(id);
    return row
      ? JSON.parse(String(row.data))
      : {
          displayName: String(user?.name ?? ''),
          headline: '',
          bio: '',
          location: '',
          website: '',
          visible: false,
          directory: false,
          showHeadline: false,
          showBio: false,
          showLocation: false,
          showWebsite: false,
        };
  }
  function projection(id: number) {
    const p = profile(id);
    return {
      id,
      displayName: p.displayName,
      headline: p.showHeadline ? p.headline : '',
      bio: p.showBio ? p.bio : '',
      location: p.showLocation ? p.location : '',
      website: p.showWebsite ? p.website : '',
    };
  }
  function posts(author?: number, own = false) {
    return db
      .prepare(
        'SELECT slug,author,title,markdown,listed,published_at FROM publications WHERE published_at IS NOT NULL ORDER BY published_at DESC,slug',
      )
      .all()
      .filter((p) =>
        author === undefined
          ? p.listed
          : p.author === author && (own || p.listed),
      )
      .map((p) => ({
        slug: p.slug,
        title: p.title,
        publishedAt: p.published_at,
        listed: !!p.listed,
        authorName: profile(Number(p.author)).displayName,
        profileId: profile(Number(p.author)).visible ? p.author : null,
        excerpt: String(p.markdown)
          .replace(/[#*`>]/g, '')
          .slice(0, 180),
        minutes: Math.max(
          1,
          Math.ceil(String(p.markdown).split(/\s+/).length / 200),
        ),
      }));
  }
  return {
    publicRoutes(app: express.Express) {
      app.get('/api/public/people', (_req, res) =>
        res.json(
          db
            .prepare('SELECT user_id FROM profiles')
            .all()
            .filter((r) => {
              const p = profile(Number(r.user_id));
              return p.visible && p.directory;
            })
            .map((r) => projection(Number(r.user_id))),
        ),
      );
      app.get('/api/public/profiles/:profileId', (req, res) => {
        const id = Number(req.params.profileId);
        if (!Number.isSafeInteger(id) || id < 1 || !profile(id).visible) {
          res.status(404).json({ error: 'Profile is private or unavailable.' });
          return;
        }
        res.json({ ...projection(id), publications: posts(id) });
      });
      app.get('/api/public/publications', (_req, res) => res.json(posts()));
      app.get('/api/public/publications/:slug', (req, res) => {
        const p = db
          .prepare(
            'SELECT author,title,markdown,published_at FROM publications WHERE slug=? AND published_at IS NOT NULL',
          )
          .get(String(req.params.slug));
        if (!p) {
          res
            .status(404)
            .json({ error: 'This work is unavailable or unpublished.' });
          return;
        }
        res.json({
          title: p.title,
          html: renderMarkdown(String(p.markdown)),
          publishedAt: p.published_at,
          authorName: profile(Number(p.author)).displayName,
          profileId: profile(Number(p.author)).visible ? p.author : null,
        });
      });
    },
    privateRoutes(app: express.Express) {
      app.get('/api/me/profile', (_req, res) =>
        res.json(profile(res.locals.user.id)),
      );
      app.get('/api/me/profile-preview', (_req, res) =>
        res.json(projection(res.locals.user.id)),
      );
      app.put('/api/me/profile', (req, res) => {
        const b = req.body;
        if (
          !b ||
          Object.entries(fields).some(
            ([key, max]) => typeof b[key] !== 'string' || b[key].length > max,
          ) ||
          !b.displayName.trim() ||
          flags.some((key) => typeof b[key] !== 'boolean')
        ) {
          res.status(400).json({
            error: 'Complete the profile fields within their limits.',
          });
          return;
        }
        if (b.website && !/^https?:\/\/[^\s]+$/i.test(b.website)) {
          res
            .status(400)
            .json({ error: 'Website must start with https:// or http://.' });
          return;
        }
        const clean = Object.fromEntries([
          ...Object.keys(fields).map((key) => [key, b[key].trim()]),
          ...flags.map((key) => [key, b[key]]),
        ]);
        db.prepare(
          'INSERT INTO profiles VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
        ).run(res.locals.user.id, JSON.stringify(clean));
        res.json(profile(res.locals.user.id));
      });
      app.get('/api/me/publications', (_req, res) =>
        res.json(posts(res.locals.user.id, true)),
      );
      app.delete('/api/me/publications/:slug', (req, res) => {
        const result = db
          .prepare(
            'UPDATE publications SET published_at=NULL WHERE slug=? AND author=?',
          )
          .run(String(req.params.slug), res.locals.user.id);
        res
          .status(result.changes ? 200 : 404)
          .json(
            result.changes ? { ok: true } : { error: 'Publication not found.' },
          );
      });
      app.get('/api/documents/:id/publication-preview', (req, res) => {
        const d = store.document(Number(req.params.id));
        if (!d || d.deleted_at || d.author !== res.locals.user.id) {
          res
            .status(403)
            .json({ error: 'Only the document author can publish it.' });
          return;
        }
        res.json({
          title: d.title,
          html: renderMarkdown(d.markdown),
          version: d.version,
          authorName: profile(d.author).displayName,
        });
      });
      app.post('/api/documents/:id/publication', (req, res) => {
        const d = store.document(Number(req.params.id));
        if (!d || d.deleted_at || d.author !== res.locals.user.id) {
          res
            .status(403)
            .json({ error: 'Only the document author can publish it.' });
          return;
        }
        if (
          req.body?.confirmed !== true ||
          typeof req.body?.listed !== 'boolean'
        ) {
          res.status(400).json({
            error: 'Confirm public publication and choose visibility.',
          });
          return;
        }
        if (req.body.version !== d.version) {
          res.status(409).json({
            error:
              'The document changed. Close and reopen Publish to review the latest saved version.',
          });
          return;
        }
        const existing = db
          .prepare('SELECT slug FROM publications WHERE document_id=?')
          .get(d.id);
        const slug = String(existing?.slug ?? randomBytes(24).toString('hex'));
        db.prepare(
          'INSERT INTO publications VALUES (?,?,?,?,?,?,CURRENT_TIMESTAMP) ON CONFLICT(document_id) DO UPDATE SET title=excluded.title,markdown=excluded.markdown,listed=excluded.listed,published_at=CURRENT_TIMESTAMP',
        ).run(
          slug,
          d.id,
          d.author,
          d.title,
          d.markdown,
          Number(req.body.listed),
        );
        res.json({ slug });
      });
    },
  };
}
