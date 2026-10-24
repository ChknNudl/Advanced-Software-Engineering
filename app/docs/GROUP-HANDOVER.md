> **24 October update:** This document records the earlier Task 1 baseline. Projects, private permissions, invitations, Trash and Yjs live text editing are now implemented. See [COLLABORATION.md](COLLABORATION.md) and [VALIDATION.md](VALIDATION.md) for the current behaviour. Earlier statements that all accounts share every document or that CRDT editing is unimplemented are superseded. GitHub/submission evidence remains pending.

# Group handover - 21 October 2026

## Read this first

MarkSync is a working local Task 1 foundation, not a completed group submission. It has signup/login, database-backed sessions, shared Markdown documents and sanitized preview, a real two-way WebSocket presence/heartbeat channel, stale-save protection and Markdown export. Task 2 character-level collaboration is not implemented. Work has not been pushed to the final shared repository; its URL and access remain unconfirmed.

The project-plan deadline in the course overview is 21 October 2026 at 16:00 Europe/London. Task 1 is due 28 October at 16:00. Check Canvas and coordinate submission immediately; this file does not claim either submission has occurred.

## Get running without ChatGPT

Use Node 24 and pnpm 11.25.0. Open the source folder containing package.json. Run `pnpm install --frozen-lockfile`, then `pnpm dev`, and visit http://localhost:3000. On Windows use `npm.cmd install --global pnpm@11.25.0` to install pnpm and `pnpm.cmd` if necessary. After dependency installation `npm.cmd run dev` also works. Keep the terminal running and stop it with Ctrl+C. The frontend and backend share one process; SQLite starts automatically.

Do not copy Node installers, node.exe, node_modules, data, .git or temporary folders into a different repository. Each member installs their own tools. Never share real passwords or local databases as submission assets.

## Explain the project in five minutes

1. `public/`: login screen, document list, Markdown editor and preview. Browser sends requests; it is not the trusted storage authority.
2. `src/app.ts`: authenticated HTTP routes and validation.
3. `src/store.ts`: users, hashed sessions, documents and conditional save.
4. `src/presence.ts`: authenticated socket upgrades, room rosters, disconnects and heartbeat.
5. `src/markdown.ts`: parse and sanitize Markdown. `test/app.test.ts`: executable evidence.

Read ARCHITECTURE.md for contracts and diagrams. Read THEORY-GUIDE.md before writing the theoretical part. Read TASK1-AUDIT.md before claiming compliance.

## Suggested work allocation (agree names yourselves)

| Work package                | Concrete contribution                                                                                       | Independent review                                                |
| --------------------------- | ----------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| Repository/CI owner         | Confirm shared repo, install bot, enforce main protection, record successful runs                           | Another member verifies saved settings and blocked direct changes |
| Architecture/research owner | Challenge both ADRs, run actual LLM comparisons, cite primary sources and record decision                   | A member familiar with implementation checks claims               |
| Verification owner          | Run on a second machine; two-browser demo; review race/expiry tests and add one meaningful missing scenario | Another member reproduces the failure and fix                     |
| Documentation/release owner | README clarity, plan, diagrams, evidence register, final ADR PDF and release instructions                   | Everyone confirms their sections and contributions                |

These are roles, not fabricated assignments. If the group is smaller, combine roles while retaining independent PR review. Record each person's real contribution for Buddycheck.

## Two genuine PRs

PR 1 can integrate the foundation after the group agrees the architecture and reads the code. It must receive CI, bot review and a teammate's substantive comments before merging. PR 2 should resolve a real review finding or add meaningful coverage/usability improvements owned by another member. Examples: keyboard/mobile acceptance tests; a clearer expired-session recovery flow; frontend type checking; or an agreed framework migration. Do not create empty PRs to manufacture assessment evidence.

For every review, record the issue, proposed change, reasoning, test evidence and response. Ask 'what happens when the session expires during editing?' or 'what proves two stale saves cannot overwrite each other?' rather than only approving formatting.

## Ideas for the next meeting

- Is open signup with one shared workspace acceptable to the customer?
- Is no frontend framework acceptable under the brief, or should we use React/Svelte/Vue?
- What is the expected behavior when two people save different versions?
- What must the UI preserve when a session expires or network fails?
- Which CRDT/library experiment will validate the Task 2 direction?
- Who has tested the README on a clean machine and who owns the submission?

Prioritise demonstrable Task 1 correctness and review quality over adding unrelated features. Public hosting is optional for this milestone.

## Release conditions

All requirement evidence in TASK1-AUDIT.md is complete; two real PRs are merged; required checks are green; peer approvals are genuine; ADR status and AI logs reflect actual group decisions; final PDF matches Markdown; the tagged main commit runs on the marker's machine. Only then create `task1`, email the tag, submit the Canvas evidence and arrange the customer demo. Do not tag this local review branch as the accepted submission.
