import { DatabaseSync } from 'node:sqlite';
import { accessStore } from './access.js';
import * as Y from 'yjs';

export interface User {
  id: number;
  email: string;
  name: string;
  password: string;
}
export interface Document {
  id: number;
  title: string;
  author: number;
  markdown: string;
  version: number;
  updated_at: string;
  project_id: number | null;
  folder_id: number | null;
  deleted_at: string | null;
  y_state: Uint8Array | null;
}

export function createStore(path: string) {
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS users (id INTEGER PRIMARY KEY, email TEXT NOT NULL UNIQUE, name TEXT NOT NULL, password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS sessions (token TEXT PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS documents (id INTEGER PRIMARY KEY, title TEXT NOT NULL, author INTEGER NOT NULL REFERENCES users(id), markdown TEXT NOT NULL DEFAULT '', version INTEGER NOT NULL DEFAULT 1, updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);`);
  const access = accessStore(db);
  return {
    db,
    ...access,
    user(email: string) {
      return db
        .prepare('SELECT * FROM users WHERE email=?')
        .get(email) as unknown as User | undefined;
    },
    addUser(email: string, name: string, password: string) {
      const result = db
        .prepare('INSERT INTO users(email,name,password) VALUES (?,?,?)')
        .run(email, name, password);
      return { id: Number(result.lastInsertRowid), email, name };
    },
    session(token: string) {
      return db
        .prepare(
          'SELECT users.*, sessions.expires FROM sessions JOIN users ON users.id=sessions.user_id WHERE token=? AND expires>?',
        )
        .get(token, Date.now()) as unknown as
        (User & { expires: number }) | undefined;
    },
    addSession(token: string, user: number) {
      db.prepare('DELETE FROM sessions WHERE expires<=?').run(Date.now());
      db.prepare('INSERT INTO sessions VALUES (?,?,?)').run(
        token,
        user,
        Date.now() + 86400000,
      );
    },
    removeSession(token: string) {
      db.prepare('DELETE FROM sessions WHERE token=?').run(token);
    },
    list(user?: number, trash = false) {
      return db
        .prepare(
          'SELECT documents.*, users.name AS author_name FROM documents JOIN users ON users.id=documents.author ORDER BY documents.updated_at DESC, documents.id DESC',
        )
        .all()
        .filter(
          (d) =>
            user === undefined ||
            (trash
              ? !!d.deleted_at && access.owner('document', Number(d.id), user)
              : !d.deleted_at && access.role('document', Number(d.id), user)),
        )
        .map((d) => {
          const { y_state: _state, ...safe } = d;
          void _state;
          return {
            ...safe,
            role:
              user === undefined
                ? undefined
                : access.role('document', Number(d.id), user),
            canManage:
              user === undefined
                ? false
                : access.owner('document', Number(d.id), user),
          };
        });
    },
    document(id: number) {
      return db
        .prepare('SELECT * FROM documents WHERE id=?')
        .get(id) as unknown as Document | undefined;
    },
    create(title: string, author: number, markdown: string) {
      const result = db
        .prepare('INSERT INTO documents(title,author,markdown) VALUES (?,?,?)')
        .run(title, author, markdown);
      return this.document(Number(result.lastInsertRowid))!;
    },
    state(id: number) {
      const doc = this.document(id)!;
      const y = new Y.Doc();
      if (doc.y_state) Y.applyUpdate(y, doc.y_state);
      else y.getText('markdown').insert(0, doc.markdown);
      if (!doc.y_state)
        db.prepare('UPDATE documents SET y_state=? WHERE id=?').run(
          Y.encodeStateAsUpdate(y),
          id,
        );
      return y;
    },
    apply(id: number, update: Uint8Array) {
      const y = this.state(id);
      try {
        Y.applyUpdate(y, update);
        const markdown = y.getText('markdown').toString();
        const state = Y.encodeStateAsUpdate(y);
        if (markdown.length > 100000 || state.length > 1500000)
          throw new Error('Document collaboration limit exceeded.');
        db.prepare(
          'UPDATE documents SET markdown=?,y_state=?,version=version+1,updated_at=CURRENT_TIMESTAMP WHERE id=? AND deleted_at IS NULL',
        ).run(markdown, state, id);
      } finally {
        y.destroy();
      }
      return this.document(id)!;
    },
    save(id: number, title: string, markdown: string, version: number) {
      const y = this.state(id);
      const text = y.getText('markdown');
      if (text.toString() !== markdown)
        y.transact(() => {
          text.delete(0, text.length);
          text.insert(0, markdown);
        });
      const state = Y.encodeStateAsUpdate(y);
      y.destroy();
      if (state.length > 1500000)
        throw Object.assign(
          new Error('Document collaboration limit exceeded.'),
          { status: 413 },
        );
      return (
        db
          .prepare(
            'UPDATE documents SET title=?,markdown=?,version=version+1,updated_at=CURRENT_TIMESTAMP,y_state=? WHERE id=? AND version=? AND deleted_at IS NULL',
          )
          .run(title, markdown, state, id, version).changes === 1
      );
    },
  };
}
