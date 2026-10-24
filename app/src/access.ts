import { randomBytes, createHash } from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export type Role = 'owner' | 'edit' | 'read';
export type Scope = 'document' | 'project';
export interface Project {
  id: number;
  name: string;
  owner: number;
}
export interface Folder {
  id: number;
  name: string;
  project_id: number;
}
export function accessStore(db: DatabaseSync) {
  const columns = db.prepare('PRAGMA table_info(documents)').all();
  if (!columns.some((c) => c.name === 'project_id')) {
    // A consistent SQLite backup includes committed WAL contents before migration.
    const file = db.prepare('PRAGMA database_list').get()?.file;
    if (typeof file === 'string' && file) {
      db.prepare('VACUUM INTO ?').run(
        `${file}.before-collaboration-${Date.now()}.bak`,
      );
    }
    db.exec(`BEGIN;
      ALTER TABLE documents ADD COLUMN project_id INTEGER REFERENCES projects(id);
      ALTER TABLE documents ADD COLUMN folder_id INTEGER REFERENCES folders(id);
      ALTER TABLE documents ADD COLUMN deleted_at TEXT;
      ALTER TABLE documents ADD COLUMN y_state BLOB;
      COMMIT;`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS projects (id INTEGER PRIMARY KEY, name TEXT NOT NULL, owner INTEGER NOT NULL REFERENCES users(id));
    CREATE TABLE IF NOT EXISTS folders (id INTEGER PRIMARY KEY, name TEXT NOT NULL, project_id INTEGER NOT NULL REFERENCES projects(id));
    CREATE TABLE IF NOT EXISTS share_links (id INTEGER PRIMARY KEY, hash TEXT NOT NULL UNIQUE, scope TEXT NOT NULL CHECK(scope IN ('document','project')), target INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('read','edit')), created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE IF NOT EXISTS link_members (link_id INTEGER NOT NULL REFERENCES share_links(id) ON DELETE CASCADE, user_id INTEGER NOT NULL REFERENCES users(id), PRIMARY KEY(link_id,user_id));`);
  const hash = (value: string) =>
    createHash('sha256').update(value).digest('hex');
  const api = {
    project(id: number) {
      return db
        .prepare('SELECT * FROM projects WHERE id=?')
        .get(id) as unknown as Project | undefined;
    },
    folder(id: number) {
      return db
        .prepare('SELECT * FROM folders WHERE id=?')
        .get(id) as unknown as Folder | undefined;
    },
    owner(scope: Scope, id: number, user: number): boolean {
      if (scope === 'project') return api.project(id)?.owner === user;
      const doc = db
        .prepare('SELECT author,project_id FROM documents WHERE id=?')
        .get(id);
      return (
        !!doc &&
        (doc.author === user ||
          api.project(Number(doc.project_id))?.owner === user)
      );
    },
    role(scope: Scope, id: number, user: number): Role | undefined {
      const record =
        scope === 'project'
          ? api.project(id)
          : db
              .prepare(
                'SELECT * FROM documents WHERE id=? AND deleted_at IS NULL',
              )
              .get(id);
      if (!record) return;
      if (api.owner(scope, id, user)) return 'owner';
      const roles = db
        .prepare(
          'SELECT l.role FROM share_links l JOIN link_members m ON m.link_id=l.id WHERE l.scope=? AND l.target=? AND m.user_id=?',
        )
        .all(scope, id, user)
        .map((r) => r.role);
      if (scope === 'document' && 'project_id' in record && record.project_id)
        roles.push(api.role('project', Number(record.project_id), user) ?? '');
      if (roles.includes('edit') || roles.includes('owner')) return 'edit';
      if (roles.includes('read')) return 'read';
    },
    projects(user: number) {
      return (
        db
          .prepare('SELECT * FROM projects ORDER BY name')
          .all() as unknown as Project[]
      )
        .filter((p) => api.role('project', p.id, user))
        .map((p) => ({ ...p, role: api.role('project', p.id, user) }));
    },
    folders(user: number) {
      return (
        db
          .prepare('SELECT * FROM folders ORDER BY name')
          .all() as unknown as Folder[]
      ).filter((f) => api.role('project', f.project_id, user));
    },
    createProject(name: string, owner: number) {
      const r = db
        .prepare('INSERT INTO projects(name,owner) VALUES (?,?)')
        .run(name, owner);
      return api.project(Number(r.lastInsertRowid))!;
    },
    createFolder(name: string, project: number) {
      const r = db
        .prepare('INSERT INTO folders(name,project_id) VALUES (?,?)')
        .run(name, project);
      return api.folder(Number(r.lastInsertRowid))!;
    },
    place(id: number, project: number | null, folder: number | null) {
      db.prepare(
        'UPDATE documents SET project_id=?,folder_id=? WHERE id=?',
      ).run(project, folder, id);
    },
    trash(id: number, deleted: boolean) {
      db.prepare('UPDATE documents SET deleted_at=? WHERE id=?').run(
        deleted ? new Date().toISOString() : null,
        id,
      );
    },
    links(scope: Scope, target: number) {
      return db
        .prepare(
          'SELECT id,role,created_at,(SELECT count(*) FROM link_members WHERE link_id=share_links.id) AS members FROM share_links WHERE scope=? AND target=?',
        )
        .all(scope, target);
    },
    createLink(
      scope: Scope,
      target: number,
      role: 'read' | 'edit',
      user: number,
    ) {
      const token = randomBytes(32).toString('hex');
      const r = db
        .prepare(
          'INSERT INTO share_links(hash,scope,target,role,created_by) VALUES (?,?,?,?,?)',
        )
        .run(hash(token), scope, target, role, user);
      return { id: Number(r.lastInsertRowid), token, role };
    },
    redeem(token: string, user: number) {
      const link = db
        .prepare('SELECT * FROM share_links WHERE hash=?')
        .get(hash(token));
      if (!link) return;
      const valid =
        link.scope === 'project'
          ? api.project(Number(link.target))
          : db
              .prepare(
                'SELECT id FROM documents WHERE id=? AND deleted_at IS NULL',
              )
              .get(link.target);
      if (!valid) return;
      db.prepare('INSERT OR IGNORE INTO link_members VALUES (?,?)').run(
        link.id,
        user,
      );
      return { scope: link.scope, target: link.target, role: link.role };
    },
    revokeLink(id: number, scope: Scope, target: number) {
      return db
        .prepare('DELETE FROM share_links WHERE id=? AND scope=? AND target=?')
        .run(id, scope, target).changes;
    },
  };
  return api;
}
