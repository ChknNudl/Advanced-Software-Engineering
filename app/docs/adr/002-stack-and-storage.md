# ADR 002: TypeScript service, browser modules and SQLite

## Status

Proposed on 14 October 2026; implemented in the initial skeleton and awaiting group acceptance.

## Context

The marker must run the application on a commodity machine. Task 1 needs authentication, persistent document storage, Markdown rendering and genuine WebSockets. Later tasks change the parser and collaboration behavior, so transport, persistence and rendering need visible boundaries. A small team also needs a reproducible build and understandable tests.

## Decision

Priorities are reproducible marker setup, understandable module boundaries, verifiable behavior and room for later changes. A framework is not currently used: this is an explicit no-framework frontend selection, not an omitted React implementation. The brief's examples should be clarified with the convenor if a framework is expected. A group decision to use React/Svelte/Vue should be recorded here and implemented through peer review rather than silently relabelling the existing UI.

Use Node.js 24 and TypeScript for the backend, Express for HTTP routing, the ws library for WebSockets, and SQLite through Node's built-in node:sqlite module. Use parameterized SQL, a versioned conditional update for save conflicts, WAL journaling and foreign keys. Store users, salted password hashes, session-token hashes and expiry, and titled documents with author references.

Use browser-native JavaScript modules and semantic HTML/CSS for the first editor. React, Svelte or Vue could improve state management in a larger application, but this milestone has a small number of screens and no requirement for a framework. Avoiding a frontend bundler keeps the walking skeleton inspectable. Revisit the frontend choice when introducing a CRDT editor binding; it is not an irreversible product-wide ban on frameworks.

Use marked for parsing and sanitize-html for output filtering, behind src/markdown.ts. Raw HTML must not become executable. Serve frontend and API from one origin to simplify session cookies and origin checks. Native WebSockets meet the required full-duplex channel without the additional application protocol supplied by Socket.IO; ws supplies server framing and control-frame handling.

Use pnpm with a committed lockfile. CI enforces ESLint, Prettier, strict backend TypeScript, Node test runner integration tests and compilation. The application works without cloud services. CodeRabbit is the proposed PR review integration, activated separately by the repository owner.

## Consequences

- The 21 October audit moved WebSocket rooms, heartbeat and revocation into src/presence.ts, leaving HTTP handling in src/app.ts. This creates a concrete transport boundary; it does not imply distributed service isolation.

- SQLite gives a one-file local setup and transactions; concurrent writers serialize. It is appropriate for this small single-instance skeleton, not evidence that enterprise-scale throughput is solved.
- PostgreSQL would improve multi-service operations and scaling options but adds a service and setup burden. MongoDB's document model is unnecessary for this relational account/session/author model. Revisit storage when requirements justify it.
- A Node/TypeScript backend shares concepts with browser code. Go or Python are reasonable alternatives but add a language/toolchain for this team to maintain; this choice is provisional until the group confirms skills.
- Synchronous SQLite calls briefly block Node's event loop. Keep queries bounded and migrate or isolate work if measured load demands it. Password derivation uses asynchronous scrypt.
- The UI is linted JavaScript; backend TypeScript is strictly checked. Large frontend state changes may justify TypeScript and a framework later.
- Every signed-in user belongs to one shared workspace. Signup is open for local demonstration; production requires a separately designed admission/authorization policy.
- node:sqlite is version-sensitive, so Node 24 is explicitly required. Back up the data directory with the application stopped; do not copy an active database without its WAL state.

## AI prompt appendix

Actual follow-up input on 21 October 2026 requested a full requirement analysis, stronger development, group handover and help with the theoretical part. The assistant found that its original startup instructions assumed the assistant's tool PATH matched the user's terminal. That assumption was wrong. The revised README explains independent Node/pnpm installation and the local runtime files are excluded from Git; this is a concrete example of why AI advice needs clean-machine validation.

Actual input: the user asked to "create repository for the beginning and do the task 1 and intro moments for the projcet" and supplied the Task 1 requirements. The assistant selected and implemented this stack from that context. No separate team prompt log, performance benchmark or completed team review was supplied.

Suggested follow-up prompt (not yet run): "Critique Node 24, SQLite, ws and a vanilla JavaScript frontend for our Task 1 skeleton. Compare PostgreSQL and React, identify upgrade boundaries, and challenge security and local reproducibility assumptions."

Critical commentary: The assistant's small local stack makes the requirement-to-code mapping easy to inspect and avoids unnecessary service setup. Separating persistence and Markdown rendering is useful for later changes. Its simplicity argument is incomplete without knowing team experience, expected workload and the next editor integration. A superficial claim that SQLite or scrypt alone makes the product production-ready would ignore authorization, signup admission, rate limiting across instances, recovery and operational monitoring. The group should validate the trade-off with a clean-clone rehearsal, inspect real CI evidence, and amend this record with its own reasoning.

## Primary references

- Node SQLite API: https://nodejs.org/api/sqlite.html
- ws implementation and examples: https://github.com/websockets/ws
- Marked security guidance: https://marked.js.org/#usage
- CodeRabbit configuration: https://docs.coderabbit.ai/reference/configuration
