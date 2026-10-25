# Verification - 24 October 2026

The local lint, formatting, strict backend type check, 19 automated tests and browser/server builds pass with Node 24 and pnpm 11.25.0. A separate source copy also passed frozen-lockfile installation and the full checks, including all 19 tests and both builds.

Automated evidence covers authentication, expiry/revocation, origin checks, malformed input, Unicode sizes, Markdown sanitization, presence, room isolation, duplicate tabs, restart persistence and stale REST saves. New checks cover private-document isolation; read-only versus editing grants; project access inherited by folders/documents; sharing restricted to owners; revoked tokens; move validation; Trash/restore; two independent Yjs clients inserting concurrently; persistence of CRDT state and permissions; rejected read-only socket writes; immediate revoked/deleted-room disconnection; idempotent retransmission after reconnect; denied private-room joins; and migration of an old schema with a backup and preserved document.

Browser checks used disposable accounts and an isolated database in the system temporary directory, not the user's database. Verified:

- Sign in, create a project and folder, then create a document in the selected folder.
- Edit Markdown with automatic acknowledgement; save a title separately.
- Generate a read-only project invitation, sign out, open it and sign in as a different recipient. The shared document appeared with editing, sharing and project creation-within-that-project controls disabled appropriately.
- Open two tabs on the same document and observe text from one appear in the other's rendered preview without reloading. The automated concurrent test uses two different users; the two-tab browser test uses one account.
- Move a document to Trash, restore it and reopen the preserved contents.
- Inspect desktop sharing at 1440px and mobile dialog bounds at 390px. Mobile document width was 375px and the dialog stayed within the viewport.

The test server uses the same application code but a separate database. No real invitations were sent. Docker, live hosting, production load testing, prolonged offline recovery and multi-server use have not been verified. Remote repository setup/reviews remain pending as agreed. Existing Task 1 PDF/ADRs are historical draft records; COLLABORATION.md describes the new extension.
