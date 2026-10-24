> **24 October update:** This document records the earlier Task 1 baseline. Projects, private permissions, invitations, Trash and Yjs live text editing are now implemented. See [COLLABORATION.md](COLLABORATION.md) and [VALIDATION.md](VALIDATION.md) for the current behaviour. Earlier statements that all accounts share every document or that CRDT editing is unimplemented are superseded. GitHub/submission evidence remains pending.

# Task 1 demonstration

1. Start from a clean clone, install locked dependencies and run `pnpm check`. Explain each CI gate and show an actual GitHub Actions run when available.
2. Start the app. Create Alice's account in one browser and Bob's account in a private window (separate cookie stores). Passwords need at least 12 characters.
3. Alice creates a document titled "Architecture meeting". Write a heading, a list, bold text and a code block. Show the rendered preview and save.
4. Bob refreshes the workspace and opens that document. Both browsers should show two names online. Close Bob's document tab; Alice's roster updates. This proves client join -> server broadcast over real WebSockets.
5. In browser developer tools, inspect `/ws` frames: the outgoing `join` includes the document ID and incoming `presence` contains the roster. The automated test also sends application `ping` and verifies `pong`; control-frame heartbeats detect dead connections.
6. Open the same version in both browsers. Save Alice's changes, then save Bob's stale copy. Bob sees the conflict message; the stored newer version is preserved. Copy Bob's local edits before reopening to reconcile manually.
   Use **Download my Markdown** to preserve Bob's draft, then **Load latest saved version** and confirm the discard warning. Demonstrate a second save after manually reconciling. The conflict banner should disappear on reopening.
7. Restart the server, refresh and show that accounts, session and saved text still exist. Sign out and show protected endpoints require a fresh login.
8. Walk through the ADRs and explicitly distinguish Task 1's presence/version checks from Task 2's proposed CRDT collaboration.
   Leave a document open for 15 seconds to show the two-way heartbeat timestamp. Briefly stop and restart the server; the browser should reconnect and rejoin without deleting unsaved editor text. Do not claim offline durable storage.
9. Show two real merged PRs with substantive teammate discussion, successful CI and AI review comments. These must be created by actual group collaboration before the final assessment; the local starter is not that evidence.

Record problems, who will address them, and the customer's acceptance or requested changes. Do not put credentials or real session cookies in screenshots.
