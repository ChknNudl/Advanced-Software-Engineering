# ADR 002: TypeScript service, browser modules and SQLite

## Status

Implemented choice; formal group acceptance pending peer review. Corrected on 28 October 2026 against GitHub main at ac472ae35abfe129064e90de9e1e8f55dce19aee. This record describes the published application, not unpushed local features.

## Context

The marker must run the application on a commodity machine. Task 1 needs authentication, persistent document storage, Markdown rendering and genuine WebSockets. Later tasks change the parser and collaboration behavior, so transport, persistence and rendering need visible boundaries. A small team also needs a reproducible build and understandable tests.

## Decision

Priorities are reproducible marker setup, understandable module boundaries, verifiable behavior and room for later changes. A framework is not currently used: this is an explicit no-framework frontend selection, not an omitted React implementation. The brief's examples should be clarified with the convenor if a framework is expected. A group decision to use React/Svelte/Vue should be recorded here and implemented through peer review rather than silently relabelling the existing UI.

Use Node.js 24 and TypeScript for the backend, Express for HTTP routing, the ws library for WebSockets, and SQLite through Node's built-in node:sqlite module. Use parameterized SQL, a versioned conditional update for save conflicts, WAL journaling and foreign keys. Store users, salted password hashes, session-token hashes and expiry, and titled documents with author references. Persist raw Markdown together with encoded Yjs state; also store projects, folders and sharing grants. The single Node process hosts HTTP and WebSocket services, so this is a modular monolith, not a microservice deployment.

Use browser-native JavaScript modules and semantic HTML/CSS for the first editor. React, Svelte or Vue could improve state management in a larger application, but this milestone has a small number of screens and no requirement for a framework. esbuild bundles the browser entry point and Yjs dependency into public/client.js. This keeps the dependency build explicit without introducing a UI framework. React offers component/state conventions but adds application structure; Svelte offers compiler-based components with another toolchain; Vue offers declarative components but would require migration. The small existing UI and reproducible local setup favour retaining vanilla JavaScript for this milestone. Revisit this decision as UI complexity grows; it is not an irreversible ban on frameworks.

Use marked for parsing and sanitize-html for output filtering, behind src/markdown.ts. Raw HTML must not become executable. Serve frontend and API from one origin to simplify session cookies and origin checks. Native WebSockets meet the required full-duplex channel without the additional application protocol supplied by Socket.IO; ws supplies server framing and control-frame handling.

Use pnpm with a committed lockfile. CI enforces ESLint, Prettier, strict backend TypeScript, Node test runner integration tests and compilation. The application works without cloud services. The repository contains root CodeRabbit configuration and a real root CI workflow after PR #15. Bot installation, actual review evidence and required branch-protection checks are separate repository concerns; configuration alone does not prove enforcement.

## Consequences

- The 21 October audit moved WebSocket rooms, heartbeat and revocation into src/presence.ts, leaving HTTP handling in src/app.ts. This creates a concrete transport boundary; it does not imply distributed service isolation.

- SQLite gives a one-file local setup and transactions; concurrent writers serialize. It is appropriate for this small single-instance skeleton, not evidence that enterprise-scale throughput is solved.
- PostgreSQL would improve multi-service operations and scaling options but adds a service and setup burden. MongoDB's document model is unnecessary for this relational account/session/author model. Revisit storage when requirements justify it.
- A Node/TypeScript backend shares concepts with browser code. Go or Python are reasonable alternatives but add a language/toolchain for this team to maintain; this choice is provisional until the group confirms skills.
- Synchronous SQLite calls briefly block Node's event loop. Keep queries bounded and migrate or isolate work if measured load demands it. Password derivation uses asynchronous scrypt.
- The UI is linted JavaScript; backend TypeScript is strictly checked. Large frontend state changes may justify TypeScript and a framework later.
- Access is scoped through document authorship, project ownership and read/edit sharing grants. Projects, folders, invitation memberships and soft deletion are implemented. Signup remains open for local demonstration; production admission and operational controls need separate decisions.
- node:sqlite is version-sensitive, so Node 24 is explicitly required. Back up the data directory with the application stopped; do not copy an active database without its WAL state.

## AI Prompt Appendix

### Actual prompts and use

These prompts come from the project conversation. No independent team benchmark or separate targeted technology-research conversation is asserted.

1. "create repository for the beginning and do the task 1 and intro moments for the projcet" - supplied with the Task 1 brief and used to select and implement the first local stack.
2. "analyze all, we need strong project and fully fill the requirements and more for the task 1 project need to develop also need the text for group mates so they will see the project and understand so they could write documentation, share ideas release it on github and write theoretical part" - led to a broader review of maintainability, setup and documentation.
3. "make sure u writing about the version of the site from github because after we made repository in github and made a clone there i didnt change the version of the site in github" - required this correction to distinguish the published stack from later local changes.

### Critical commentary

The AI's recommendation of one locally runnable service, a small relational database and separate rendering/transport modules made the skeleton easier to inspect. Its earlier assumptions were nevertheless unreliable: setup advice assumed the assistant's executable PATH matched the user's terminal, and documentation later claimed no bundler and an unrestricted shared workspace even though esbuild and access grants were implemented. The corrected record was compared with package.json, the root CI workflow and the HTTP, access and storage modules. SQLite and scrypt are useful choices, not proof of enterprise readiness: measured capacity, recovery, TLS and operational controls still matter. No framework or database benchmark is claimed. Human review and a clean-machine rehearsal remain necessary to validate the recommendation.

## Implementation evidence and local execution

- app/package.json: Node 24, pnpm 11.25.0, esbuild, strict backend TypeScript, lint/format/test/build scripts. Browser JavaScript is linted; do not describe it as fully TypeScript-checked.
- app/src/app.ts and access.ts/access-routes.ts: HTTP sessions, origin checks, permissions and document routes.
- app/src/store.ts and markdown.ts: SQLite persistence and filtered Markdown rendering.
- app/src/presence.ts: ws transport and room lifecycle, distinct from database storage and browser rendering.
- .github/workflows/ci.yml: PR-to-main checks, installed from the committed lockfile. This file alone does not establish branch protection.
- Local startup from app/: pnpm install --frozen-lockfile, then pnpm dev; open http://localhost:3000. Windows PowerShell can use pnpm.cmd to avoid pnpm.ps1 execution-policy restrictions. SQLite defaults to data/marksync.sqlite. Docker Compose is an alternative with a persistent volume.
- Hosting requires a Node process, WebSocket support and durable database storage; GitHub Pages alone cannot run this application. Cloud deployment is not a Task 1 requirement.
- Code baseline: https://github.com/ChknNudl/Advanced-Software-Engineering/tree/ac472ae35abfe129064e90de9e1e8f55dce19aee

## Primary references

- Node SQLite API: https://nodejs.org/api/sqlite.html
- ws implementation and examples: https://github.com/websockets/ws
- Marked security guidance: https://marked.js.org/#usage
- CodeRabbit configuration: https://docs.coderabbit.ai/reference/configuration
