# Profiles and publishing

MarkSync now supports a personal profile and a public portfolio alongside private collaborative documents.

## Using the features

1. Sign in and choose **My profile & settings** in the sidebar. Add a display name or pen name, headline, biography, location and website.
2. Choose privacy settings and save. Profiles start private, directory membership is optional, and each optional field has its own visibility checkbox. **Preview saved public details** shows only the saved fields selected for public display without making the profile public.
3. To publish, open a document you authored, wait for text to sync and save its title. Choose **Publish**, review the saved snapshot, optionally list it in Explore, then explicitly confirm publication.
4. The public link opens without signing in. Unlisted works are still public to anyone with the link. Listed works appear in **Explore works & people** and, if enabled, the author's public profile.
5. To update a publication, open its original document and publish a new snapshot. The link stays the same. Later draft edits remain private until republished.
6. Manage published works in **My profile & settings**: open a work, copy its public link, or unpublish it. Unpublishing disables the public reader and removes the work from lists. It cannot recall copies already saved elsewhere.

Explore includes title/author/excerpt search and estimated reading times. Public profiles use initials instead of photo uploads.

## Privacy and access rules

- Account email and password data never appear in public profile or publication responses.
- The display name is public on each published work even when the profile is private. It follows the author's current saved display name.
- Making a profile private removes its profile page and directory listing; it does not unpublish separately published works.
- Only the original document author can publish it. Editing permission and project ownership alone do not grant publication rights. The author should agree publication with collaborators.
- Publishing checks the reviewed document version; a concurrent edit requires a fresh preview.
- Trashing a document unpublishes it automatically. Restoring it does not republish it.
- Sharing invitations remain separate: collaboration requires an account and permissions; publications are read-only public snapshots.

## Implementation and group documentation

`src/community.ts` adds profile/publication routes and additive SQLite tables. Public GET routes run before session authentication, exposing explicit projections rather than full database records. Profile edits and publication management require a session and the existing same-origin protection. A SQLite trigger unpublishes trashed source documents. Published Markdown uses the existing sanitizing renderer.

`public/community.js` provides profile/privacy forms, Explore, publication preview and signed-out public readers. It is bundled with the existing browser entry point. Profiles and publications persist in the application's existing SQLite database and are excluded from Git with the rest of user data.

These features extend the project; they do not by themselves demonstrate completion of all Task 1 assessment requirements. The group should document the privacy defaults, snapshot-versus-live-editing design, access-control tests, and rationale for separating sharing from publication.

## Running and hosting

From the group repository run `cd app`, then `pnpm.cmd dev` in the VS Code terminal (or `pnpm dev` on other shells). Open the URL printed by the server. Stop it with Ctrl+C.

Public links on localhost work only on the machine running the application. Internet access requires deploying the Node/WebSocket application with persistent SQLite storage and HTTPS. These changes do not deploy a public service. GitHub Pages alone cannot run this backend.
