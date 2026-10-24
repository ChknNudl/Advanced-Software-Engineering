# MarkSync | ASE-project

MarkSync is our Advanced Software Engineering group project: a Markdown workspace with projects, folders, permission-based sharing and live collaborative text editing. Task 1 establishes a runnable end-to-end foundation, explicit architecture boundaries, and repeatable quality checks.

Final group repository: the groupmate’s repository (URL pending). The current local Git remote is the original personal repository, https://github.com/skydayrainy/ASE-project. This implementation has not been pushed there. Do not assume a fresh clone of that URL contains this work.

## Run in Visual Studio Code

Install **Node.js 24 LTS**, **pnpm 11.25.0**, and Git. Install Node in its normal system location with Add to PATH enabled; downloading the installer is not installation. Restart VS Code afterward. In Windows PowerShell, run `npm.cmd install --global pnpm@11.25.0` once. Use `npm` instead of `npm.cmd` on macOS/Linux.

Open the project folder (the folder containing package.json) in VS Code. For the existing local copy or an extracted source handover, run:

```sh
pnpm install --frozen-lockfile
pnpm dev
```

Open http://localhost:3000 and create an account. Use **File > Open Folder** to open this repository in VS Code. The included launch configuration lets you debug with F5 after installing dependencies. Stop `pnpm dev` before starting the debugger, because both use port 3000.

On Windows use `pnpm.cmd` if PowerShell blocks the `.ps1` wrapper. If pnpm is not recognised, check `node --version` and `npm.cmd --version`, install pnpm as above, then open a new terminal. After dependencies are installed, `npm.cmd run dev` also starts the site. No ChatGPT installation or account is required. In this particular local folder, `node.exe` was installed into the project directory: `.\node.exe --import tsx --watch src/main.ts` is a temporary local fallback. Do not upload that executable to GitHub.

Keep the terminal open; Ctrl+C stops the site. If port 3000 is occupied, stop the other instance or set `PORT` and matching `APP_ORIGIN`. After the group publishes its source, teammates can clone the confirmed group URL and follow these same installation steps.

The backend serves the frontend; there is no separate frontend process. SQLite runs inside Node and creates `data/marksync.sqlite` automatically. No database installation or cloud account is needed. Keep the whole `data/` directory for local persistence; it is ignored by Git.

For a compiled run:

```sh
pnpm build
pnpm start
```

`pnpm build` bundles the browser editor (including Yjs) into `public/client.js` and compiles TypeScript into `dist/`. `pnpm dev` builds the browser bundle before starting the server; restart it after changing browser source files. This is a Node application, not a standalone native executable. A marker needs Node 24, installed dependencies, `dist/`, and `public/`. Docker is optional:

```sh
docker compose up --build
```

The container stores SQLite in a named volume. `docker compose down` preserves it; removing the volume deletes your local data. Docker was not required to run the verified local checks.

## Current implementation (24 October extension)

- Signup and login with salted scrypt password hashes, random HttpOnly session cookies, and database-backed session expiry.
- Private documents, projects and project folders. Project invitations cover current and future documents in the project. Document invitations share just one document. Owners choose read-only or edit links, revoke them, move documents, and use Trash/restore. Recipients sign in before accepting access.
- Markdown rendering with HTML sanitization and a restrictive browser content policy.
- A real WebSocket connection: opening a document sends `join`; the server broadcasts its online roster. Every 15 seconds the browser sends application `ping`; the returned `pong` updates a visible verification time. Dead connections are detected with server control-frame heartbeats; transient failures reconnect with capped backoff.
- Yjs merges concurrent Markdown edits over authenticated WebSockets. Accepted updates persist both CRDT state and raw Markdown in SQLite, then broadcast to connected collaborators. Text saves automatically; titles save separately using version checks. Permission checks apply to HTTP and every socket update.
- Download the current editor contents as Markdown before loading the latest saved version. Refresh the document list to discover a teammate's new documents. Drafts are held in the page, not a durable offline store.
- Automated lint, format enforcement, strict backend type checking, tests and compilation in GitHub Actions.

This is a coursework walking skeleton. Password recovery, invitation expiry, individual member removal, nested folders and multi-server operation are not implemented. Links can be forwarded: every signed-in recipient of a valid link may accept it. Revoking a link removes grants from that link, but other grants or ownership may still permit access.

## Quality checks

```sh
pnpm check
```

Tests use temporary databases and real HTTP/WebSocket servers. They cover authentication, invalid input, session revocation, persistence across restart, concurrent saves, Markdown sanitization, presence join/leave, ping-pong and rejected upgrades. The frontend is linted; strict TypeScript checking currently covers backend code. CI runs on every PR to `main` and pushes to `main`.

## Structure

```text
src/store.ts          SQLite and persistent Yjs state
src/access.ts         Projects, folders, permissions and migration
src/access-routes.ts  Organisation, invitations and Trash APIs
src/markdown.ts       Markdown parsing and sanitization boundary
src/app.ts            HTTP authentication and document API
src/presence.ts       WebSocket transport, rooms, heartbeat and revocation
src/session.ts        Cookie-token extraction and one-way hashing
src/main.ts           Runtime configuration and lifecycle
public/               Browser UI, editor and reconnect behavior
test/                 Automated integration and rendering tests
docs/adr/             Task 1 architecture records (see dated extension guide)
docs/                 Introduction, project plan, collaboration and demo guide
.github/              CI and pull request template
.vscode/              Editor/debug configuration
```

Runtime options: `PORT` (3000), `HOST` (127.0.0.1), `DATABASE_PATH` (`data/marksync.sqlite`), and `APP_ORIGIN` (`http://localhost:<PORT>`). The origin must exactly match the browser address, including port. No `.env` loader is used: set variables in your shell or container. Cookies become Secure for an HTTPS origin. An expired session requires signing in again; unsaved text is not automatically uploaded.

## Coursework handover

Read [project introduction](docs/PROJECT-INTRODUCTION.md), [draft project plan](docs/PROJECT-PLAN.md), [contribution guide](CONTRIBUTING.md), [demo script](docs/DEMO.md), and [submission checklist](docs/TASK1-CHECKLIST.md).

Start with [GROUP-HANDOVER.md](docs/GROUP-HANDOVER.md) for team responsibilities, [THEORY-GUIDE.md](docs/THEORY-GUIDE.md) for the written analysis, and [ARCHITECTURE.md](docs/ARCHITECTURE.md) for diagrams and API contracts. [TASK1-AUDIT.md](docs/TASK1-AUDIT.md) maps every requirement to implementation and outstanding evidence.

**Repository files alone do not enable branch protection or install an AI reviewer.** The owner must complete the GitHub setup in [GITHUB-SETUP.md](docs/GITHUB-SETUP.md). The checked-in CodeRabbit configuration takes effect after its GitHub App is installed. Do not claim passing remote CI or bot reviews until real PR runs demonstrate them.

Task 1 is due **28 October 2026, 16:00 Europe/London**. The project plan was due **21 October 2026, 16:00 Europe/London**. Team approval, two genuinely reviewed/merged PRs, final release tagging and submission remain human delivery steps; no peer comments or submission evidence have been fabricated.

## Reading and editing documents

Open a document from the sidebar to read it with a generated contents list. Choose **Edit document** for the Markdown editor and preview, text saves automatically while connected. Use **Save title** for title changes. **Read document** switches the layout without discarding your draft. **Share** creates a read-only or editing invitation. **Share project** grants access to all project documents. Recipients must sign in. A localhost link only works on the same computer. New documents open directly in edit mode.

See [deployment instructions](docs/DEPLOYMENT.md) for publishing after the group repository is ready, and [the requirement audit](docs/TASK1-AUDIT.md) for what still needs team evidence.

## Upgrading existing data

On the first run of this version, SQLite creates a consistent `*.before-collaboration-*.bak` file beside the database before adding organisation and collaboration tables/columns. Existing documents and authors are preserved. The previous everyone-can-edit policy is replaced: old documents become private to their authors until shared. Stop older server instances before upgrading. Do not run old and new versions against the same database. Backups contain account and document data; keep them private.

See [COLLABORATION.md](docs/COLLABORATION.md) for workflows, access rules and current limits.
