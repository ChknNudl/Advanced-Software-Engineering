import type { Express, Request, Response, NextFunction } from 'express';
import type { createStore } from './store.js';
import type { Scope } from './access.js';
export function attachAccessRoutes(
  app: Express,
  store: ReturnType<typeof createStore>,
  changed: () => void,
) {
  const name = (value: unknown): value is string =>
    typeof value === 'string' && !!value.trim() && value.length <= 100;
  app.get('/api/projects', (_req, res) =>
    res.json(store.projects(res.locals.user.id)),
  );
  app.get('/api/folders', (_req, res) =>
    res.json(store.folders(res.locals.user.id)),
  );
  app.get('/api/trash', (_req, res) =>
    res.json(store.list(res.locals.user.id, true)),
  );
  app.post('/api/projects', (req, res) => {
    if (!name(req.body?.name)) {
      res.status(400).json({ error: 'Project name must be 1–100 characters.' });
      return;
    }
    res
      .status(201)
      .json(store.createProject(req.body.name.trim(), res.locals.user.id));
  });
  app.post('/api/folders', (req, res) => {
    if (!Number.isSafeInteger(req.body?.projectId) || req.body.projectId < 1) {
      res.status(400).json({ error: 'Select a project.' });
      return;
    }
    const role = store.role('project', req.body?.projectId, res.locals.user.id);
    if (!role || role === 'read') {
      res.status(403).json({ error: 'Project editing access required.' });
      return;
    }
    if (!name(req.body?.name)) {
      res.status(400).json({ error: 'Folder name must be 1–100 characters.' });
      return;
    }
    res
      .status(201)
      .json(store.createFolder(req.body.name.trim(), req.body.projectId));
  });
  app.post('/api/shares/redeem', (req, res) => {
    if (
      typeof req.body?.token !== 'string' ||
      !/^[a-f0-9]{64}$/.test(req.body.token)
    ) {
      res.status(400).json({ error: 'Invalid invitation.' });
      return;
    }
    const grant = store.redeem(req.body.token, res.locals.user.id);
    if (!grant) {
      res
        .status(404)
        .json({ error: 'This invitation has expired or was revoked.' });
      return;
    }
    res.json(grant);
  });
  for (const scope of ['project', 'document'] as Scope[]) {
    const path = `/api/${scope}s/:id/shares`;
    const owner = (req: Request, res: Response, next: NextFunction) => {
      if (!store.owner(scope, Number(req.params.id), res.locals.user.id)) {
        res.status(403).json({ error: 'Only an owner can manage access.' });
        return;
      }
      if (
        scope === 'document' &&
        store.document(Number(req.params.id))?.deleted_at
      ) {
        res.status(404).json({ error: 'Document is in Trash.' });
        return;
      }
      next();
    };
    app.get(path, owner, (req, res) =>
      res.json(store.links(scope, Number(req.params.id))),
    );
    app.post(path, owner, (req, res) => {
      if (!['read', 'edit'].includes(req.body?.role)) {
        res.status(400).json({ error: 'Choose read or edit access.' });
        return;
      }
      res
        .status(201)
        .json(
          store.createLink(
            scope,
            Number(req.params.id),
            req.body.role,
            res.locals.user.id,
          ),
        );
    });
    app.delete(path + '/:linkId', owner, (req, res) => {
      const id = Number(req.params.linkId);
      if (!Number.isSafeInteger(id) || id < 1) {
        res.status(400).json({ error: 'Invalid link.' });
        return;
      }
      store.revokeLink(id, scope, Number(req.params.id));
      changed();
      res.json({ ok: true });
    });
  }
  app.delete('/api/documents/:id', (req, res) => {
    const id = Number(req.params.id);
    if (!store.owner('document', id, res.locals.user.id)) {
      res.status(403).json({
        error: 'Only the document or project owner can move this to Trash.',
      });
      return;
    }
    store.trash(id, true);
    changed();
    res.json({ ok: true });
  });
  app.post('/api/documents/:id/restore', (req, res) => {
    const id = Number(req.params.id);
    if (!store.owner('document', id, res.locals.user.id)) {
      res
        .status(403)
        .json({ error: 'Only an owner can restore this document.' });
      return;
    }
    store.trash(id, false);
    res.json({ ok: true });
  });
  app.patch('/api/documents/:id/location', (req, res) => {
    const id = Number(req.params.id),
      user = res.locals.user.id;
    if (!store.owner('document', id, user) || store.document(id)?.deleted_at) {
      res
        .status(403)
        .json({ error: 'Only an owner can move an active document.' });
      return;
    }
    const project = req.body?.projectId ?? null,
      folder = req.body?.folderId ?? null;
    // Moving changes the audience: only project owners can import documents.
    if (
      project !== null &&
      (!Number.isSafeInteger(project) || !store.owner('project', project, user))
    ) {
      res.status(403).json({ error: 'You must own the destination project.' });
      return;
    }
    if (
      folder !== null &&
      (!Number.isSafeInteger(folder) ||
        store.folder(folder)?.project_id !== project)
    ) {
      res
        .status(400)
        .json({ error: 'Choose a folder in the destination project.' });
      return;
    }
    store.place(id, project, folder);
    changed();
    res.json({ ok: true });
  });
}
