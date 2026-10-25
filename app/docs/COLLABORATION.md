# Projects, permissions and live collaboration

Implemented locally on 24 October 2026 at the user's request. This extends the original Task 1 walking skeleton; it does not replace the outstanding group reviews, protected GitHub main branch, AI reviewer and submission evidence. The original two ADRs/PDF describe the earlier baseline and proposed direction; review this implementation as a group before declaring the proposal accepted.

## Using the app

1. Choose **+ Project**, give it a name, then **+ Folder** to organise documents within that project. Folders are one level deep. Select a project/folder before creating a document.
2. Use **Move** on a document you own to put it into a project you own, a folder in that project, or your personal documents. The dialog explains that project membership changes who can access it. Direct document invitations remain valid.
3. Choose **Share** for one document or **Share project** for its entire collection. Select **Read only** or **Can edit**, create a link and copy it. The recipient opens it and signs in or creates an account. Keep the link private to intended recipients: anyone who receives it can accept the same role.
4. Open **Edit document** to co-author the Markdown. Text changes save automatically and appear in other connected tabs/users. Save titles with **Save title**. Online presence and ping/pong remain visible.
5. Choose **Move to Trash** and confirm to remove a document. Collaborators lose access immediately. Open **Trash** and select a document to restore it. Restoration restores previous sharing. Permanent deletion is deliberately not included.
6. Open Share again to see active links, their roles and accepted-user counts. **Revoke** disables the link and removes grants made through it. If the person has another valid grant, their remaining access still applies. A read-only link cannot downgrade a separate edit grant: revoke the edit link first.

Localhost invitations only work on the computer running the server. Cross-device use requires a reachable deployment with the correct APP_ORIGIN; hosting remains deferred until the group's repository/hosting setup is ready.

## Permission model

| Capability                                     | Read only | Can edit | Owner         |
| ---------------------------------------------- | --------- | -------- | ------------- |
| Read/render/download accessible documents      | Yes       | Yes      | Yes           |
| See live presence and incoming text            | Yes       | Yes      | Yes           |
| Change text and title                          | No        | Yes      | Yes           |
| Create folders/documents within shared project | No        | Yes      | Yes           |
| Share/revoke links, move or trash a document   | No        | No       | Yes           |
| Share entire project                           | No        | No       | Project owner |

The document author and current project owner manage that document. A project editor owns documents they create, so keeps access to their own documents if a project invitation is later revoked. This is an explicit ownership policy. Project and direct-document grants combine using the strongest available permission. Unshared documents cannot be listed, read or joined by unrelated accounts. Documents in Trash are unavailable to collaborators.

## Implementation and transport

`src/access.ts` owns projects, folders, invitation hashes and link-derived memberships. `src/access-routes.ts` applies HTTP permission rules. `src/store.ts` persists Yjs snapshots and raw Markdown in one SQLite update. `src/presence.ts` handles authenticated rooms, sync, edits, revocation and heartbeats. `public/app.js` uses Y.Text with textarea changes expressed as insertion/deletion operations, and preserves cursor positions with relative positions when remote changes arrive. Composition input delays remote rendering until composition ends.

The browser bundle is generated with esbuild during dev/build and is excluded from Git. It is served locally, without a third-party runtime CDN.

- `join {documentId, live:true}` checks current access, then sends presence and a full `sync` state.
- `update {seq, update}` carries a base64 Yjs update. The server rechecks the session and editing permission, applies the update to a fresh copy of persisted state, enforces size limits, persists it and broadcasts the new state. Only the sender receives its sequence acknowledgement.
- The browser retains unacknowledged updates in memory and retries them after reconnect. Yjs updates are idempotent, so a lost acknowledgement does not duplicate text. Editing pauses while disconnected. Refreshing/closing a tab can lose unacknowledged drafts; download before leaving if sync is blocked.
- Every HTTP save, membership revocation, move and deletion refreshes or closes affected sockets. Read-only users receive live changes but their attempted writes are rejected by the server.

Invitation tokens contain 32 random bytes; only their SHA-256 hashes are stored. The invitation is placed in the URL fragment, then redeemed by a same-origin authenticated POST and removed from the address bar. Grant rows reference their link with cascading deletion. The normal document URL itself is not an access grant.

## API additions

- GET/POST `/api/projects`, GET/POST `/api/folders`
- GET `/api/trash`
- PATCH `/api/documents/:id/location` with projectId/folderId (nullable)
- DELETE `/api/documents/:id` (soft delete), POST `/api/documents/:id/restore`
- GET/POST `/api/documents/:id/shares` and `/api/projects/:id/shares`
- DELETE the matching shares route plus `/:linkId`
- POST `/api/shares/redeem` with token

## Migration and operational limits

Before adding columns to an older database, the app uses SQLite VACUUM INTO to write a consistent backup beside it. Existing title, author, Markdown, account and session records remain. Documents initially have no project/folder and become private to their author. Yjs state is created lazily from the preserved text. Backups and runtime databases must stay out of Git.

This is a single-server coursework implementation. It sends full state after edits, so bandwidth and synchronous SQLite work grow with document size and room membership. Limits are 100,000 Markdown characters, 1.5 MB serialized collaboration state, approximately 2.1 MB socket messages, and 200 update messages per connection per 10 seconds. Reaching an edit limit closes the socket and preserves the user's local text for download. It is not a production-scale collaboration system; state compaction, granular update fan-out, durable offline storage, load testing and multi-server coordination remain future work. Invitations do not expire automatically and individual member management is not yet provided.

## Primary references

- [Yjs document updates and idempotent synchronization](https://docs.yjs.dev/api/document-updates)
- [Y.Text operations](https://docs.yjs.dev/api/shared-types/y.text)

The implementation follows these APIs; passing local tests is not proof of all distributed-system failure cases.
