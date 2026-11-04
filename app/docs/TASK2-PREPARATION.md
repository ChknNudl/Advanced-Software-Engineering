# Task 2 preparation: synchronisation and testing

Historical preparation notes from 27 October 2026. The supplied Task 2 brief has now been checked; see [Task 2 implementation and evidence](TASK2.md) for the current protocol, chaos tests and submission steps. These notes record the earlier work and are not the current assessment checklist.

## What users can do

- Edit shared Markdown and see another editor's named cursor and selected text.
- Use Undo/Redo (Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z; Ctrl+Y also supported) without undoing another person's edits. History belongs to the current editor session and resets on refresh/document change.
- See whether the connection is active and whether edits await acknowledgement. Titles are still saved separately and use optimistic version checks.
- Recover queued edits and an unsaved title after refreshing the same browser tab. Recovery copies are removed after acknowledgement or sign-out. Browser storage limits can prevent recovery; a visible message instructs the user to download their Markdown.
- Keep reading and downloading a draft when disconnected. Editing is paused until the server confirms access again. This is not a full offline editing mode.

## Architecture and protocol

`public/collaboration.js` contains the browser-independent Replica and RecoveryStore. The UI in `public/app.js` uses exactly this Replica; generated tests exercise it with the production SQLite store. `public/cursors.js` renders cursor overlays over the native textarea. `src/presence.ts` handles authentication, room membership, message validation and broadcast. `src/store.ts` persists merged Yjs state and Markdown.

1. The browser joins with `{type: "join", documentId, live: true, protocol: 2, vector}`. The base64 vector describes the Yjs operations already present in that replica.
2. The server checks the signed-in session and document access, then returns a `sync` message containing the missing Yjs state, title, version and role.
3. Local transactions enter a sequence-numbered pending queue. A short 120 ms debounce merges pending operations into one update, reducing chatter and avoiding a large reconnect burst. The queue is saved in sessionStorage before transmission.
4. The server validates editing permission and size/rate limits, applies the update, persists it, then broadcasts the incremental update. The sender receives an `ack` matching the batch sequence. Other clients receive no acknowledgement for that batch.
5. Only acknowledgement removes a pending batch. Duplicate updates are safe and do not increment the stored document version. On reconnect, the state-vector exchange catches up missed server edits; the browser resends any remaining pending batch.
6. Legacy clients without protocol 2 continue receiving full-state synchronisation. REST title saves can still trigger full-state messages. This retains compatibility with the existing transport tests.

Yjs supplies the CRDT conflict-resolution algorithm. This project implements its transport, acknowledgement/recovery rules, persistence and permission boundaries; it does not claim to have invented Yjs. Eventual convergence assumes valid operations are eventually delivered and the document remains within configured limits. Characters use the editor's UTF-16 indexing; replacements avoid splitting surrogate pairs.

## Presence and personal undo

Cursor messages contain encoded Yjs relative positions, not fixed offsets. Positions resolve against the latest document, so remote insertions can move a selection without leaving it at a stale offset. Cursor names and user IDs come from the server session, not client-supplied identity fields. Separate connection IDs distinguish two tabs from the same account. The user roster still counts unique accounts.

Cursor updates are limited to 30 per second per connection and validated before broadcast. The UI throttles selection events, renews active presence with its heartbeat, and clears cursors on disconnect. Stale cursor records expire after 30 seconds and are removed on a subsequent awareness broadcast/heartbeat. Cursor information is ephemeral and not saved in SQLite. Text is rendered as text nodes, including names, rather than interpolated HTML.

A Yjs UndoManager tracks only local text transactions. Remote transactions are excluded. Undo and redo produce ordinary collaborative updates and pass through the same persistence/acknowledgement flow. Title edits retain the browser's native input undo behaviour.

## Recovery and privacy

Recovery keys are scoped to account ID and document ID within sessionStorage. A refreshed tab reads a copy only after an authenticated document fetch; a read-only user does not restore it into the editor. Every outgoing update is separately checked by the server. Revoked access cannot be regained by replaying a queued update.

Recovery state and update encodings are validated before changing a live replica. The stored state includes pending operations, sequence and optional unsaved title. It is not encrypted local storage and is not a long-term backup. Closing a tab, clearing browser data, private-browsing policies or quota limits may remove/prevent it. Sign-out deliberately clears the current account's recovery copies in that tab; users are warned about unsaved changes before leaving. Download Markdown when a separate durable copy is needed.

## Automated evidence

Run from `app/`:

```powershell
pnpm check
```

The check runs lint, formatting, strict backend TypeScript checking, tests and production build. Frontend JavaScript is linted, bundled and tested; it is not covered by strict TypeScript checking.

`test/collaboration.test.ts` includes 150 generated scenarios per run using fast-check. Each scenario uses three replicas and the production store. It generates Unicode edits, concurrent local work, delayed and reordered delivery, duplicate updates, and tab-state restoration. It checks local edits against an ordinary string model, duplicate version stability, eventual client/server convergence and clearing acknowledged queues. fast-check reports a seed and shrink path on failure for reproducing and minimising the counterexample.

Additional regression tests check personal undo/redo preserving remote edits, relative-position movement, malformed cursors and account-scoped recovery (including an empty unsaved title). Real WebSocket tests verify small delta payloads, vector-based reconnect, server-controlled cursor names, departure cleanup, malformed-cursor rejection and read-only replay rejection. Earlier tests cover session revocation, persistence across restart, room isolation and authentication.

These are bounded generated tests, not a mathematical proof or a load benchmark. Network scenarios intentionally include conditions harsher than an ordered WebSocket connection. The protocol integration tests separately check real WebSockets.

## Team review and demonstration

1. Start the app and open the same shared document as two editors. Type in each; confirm equal content and visible cursor labels/selections.
2. Undo one editor's change; verify the other editor's contribution remains. Redo it.
3. Interrupt the local connection during an edit, restore the connection and verify convergence and a saved indicator. Repeat with a page refresh while an acknowledgement is pending.
4. Change a collaborator to read-only or revoke their invitation. Confirm no pending replay changes the server document.
5. Run `pnpm check`; save the actual output and any discovered counterexample/reproduction steps with the assessment evidence.

Suggested work allocation, subject to team agreement: Algiz reviews browser/recovery behaviour; Tom reviews generated tests and CI execution; Dhanvin updates architecture and test rationale; Jakub coordinates scope, review and integration. Each author should obtain a real peer review rather than treating this document as approval.

Before a Task 2 submission, compare every item with the Canvas brief: whether a particular synchronisation algorithm, test framework, property count, coverage target, performance experiment or report format is mandated. Also review narrow-screen cursor layouts and IME behaviour on supported browsers. Larger-scale deployment needs a persistent server and storage; GitHub Pages alone cannot host this authenticated WebSocket/SQLite backend.

No remote CI, merge, deployment or submission is implied by local test results. Integrate the latest group `main` and review the complete branch, including the existing profile/publication changes, before publishing it.

## Comments, online collaborators and quick search

Choose **Edit document**, select up to 2,000 characters in the Markdown source, wait for text to sync, then use the speech-bubble **Comments** button. A comment stores the quoted passage and its document version. Quotes are historical context: they do not move/highlight a live range after later edits. The server rejects a stale selection if the document changes before submission; reselect the passage and try again. Comments support up to 2,000 characters, persist in SQLite and refresh every five seconds while the window is open.

Anyone with document access may read its comments. Only owners/editors may add them. The comment author (while retaining editing access) or the document owner may resolve/reopen a comment. Comments are never included in public publication snapshots. Trashed documents and revoked access cannot expose comments through the API. This first version has no threaded replies or comment deletion.

Initials beside the online roster identify connected collaborators. Hover an avatar for their name. Up to five avatars are shown, followed by an overflow count; multiple tabs for one account count once.

Use **Quick search** or **Ctrl+K / Cmd+K** to find documents, projects and folders from the loaded workspace list. Tab through the results and press Enter to open an item; Escape closes the window. Search currently matches names/titles, not document bodies. Refresh the document list to discover newly shared items.

Validation on 28 October 2026: all 28 automated tests passed, including access/selection-version/resolve rules for comments. Browser checks covered adding and resolving a selected-text comment, online avatar display, and opening a document through keyboard quick search.
