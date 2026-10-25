> **24 October update:** This document records the earlier Task 1 baseline. Projects, private permissions, invitations, Trash and Yjs live text editing are now implemented. See [COLLABORATION.md](COLLABORATION.md) and [VALIDATION.md](VALIDATION.md) for the current behaviour. Earlier statements that all accounts share every document or that CRDT editing is unimplemented are superseded. GitHub/submission evidence remains pending.

# Task 1 requirement audit - 21 October 2026

Status meanings: **Implemented** = local code exists with automated evidence; **Prepared** = files exist but external activation/evidence or team review remains; **Outstanding** = cannot claim complete. The source brief is the user's pasted Task 1 specification. No percentages or guarantees of marks are inferred.

| ID  | Requirement                                                | Status      | Location / verification                                  | Remaining action                                                         |
| --- | ---------------------------------------------------------- | ----------- | -------------------------------------------------------- | ------------------------------------------------------------------------ |
| A1  | One group GitHub repository                                | Outstanding | Personal origin exists; group URL awaited                | Confirm final repo and integrate safely                                  |
| A2  | Block direct main commits; PR + one peer approval + CI     | Outstanding | docs/GITHUB-SETUP.md                                     | Owner configures protection, including admins/no bypass, and verifies it |
| A3  | Every PR to main runs lint/format/types/tests              | Prepared    | .github/workflows/ci.yml; pnpm check                     | Push and record actual remote run                                        |
| A4  | AI bot runs on opened PRs, summarises and comments         | Prepared    | .coderabbit.yaml                                         | Install GitHub App; verify real bot comments, not just config            |
| B1  | Two ADRs with Context/Decision/Status/Consequences         | Prepared    | docs/adr/001 and 002                                     | Group reviews and accepts or amends proposed decisions                   |
| B2  | CRDT versus OT analysis                                    | Prepared    | ADR 001 + THEORY-GUIDE.md                                | Team validates recommendation and adds actual research                   |
| B3  | Client-server versus P2P/cloud fallback                    | Prepared    | ADR 001                                                  | Confirm topology choice                                                  |
| B4  | Frontend/backend/database/transport justified              | Prepared    | ADR 002                                                  | Confirm no-framework choice with customer if required                    |
| B5  | Actual team LLM prompt log and critical paragraph per ADR  | Partial     | Honest assistant input log and critique included         | Add real team architecture prompts; suggested prompts are not evidence   |
| C1  | Signup/login, auth persisted in database                   | Implemented | app.ts/store.ts; login, expiry, revocation tests         | Independent browser acceptance                                           |
| C2  | Authenticated create/view/save title, author, raw Markdown | Implemented | store.ts; persistence and conflicting-save tests         | Clean-machine demo                                                       |
| C3  | Basic Markdown rendering                                   | Implemented | markdown.ts; heading/list/table/code/link and XSS tests  | Team acceptance of supported subset                                      |
| C4  | Actual bidirectional WebSocket on document open            | Implemented | presence.ts + public/app.js; join/roster/ping-pong tests | Two-browser demonstration and frame evidence                             |
| C5  | Runnable locally with explicit startup documentation       | Implemented | README, lockfile, launch config, optional Docker         | Second-machine rehearsal; Docker not verified locally                    |
| D1  | Final accepted main commit tagged and emailed              | Outstanding | GITHUB-SETUP.md                                          | Do after peer-approved merges; email by deadline                         |
| D2  | Canvas repository link                                     | Outstanding | Evidence register below                                  | Supply final group URL                                                   |
| D3  | ADR directory exported as PDF                              | Prepared    | output/pdf/marksync-task1-adrs.pdf                       | Regenerate after final team edits                                        |
| D4  | Two merged PRs with CI + AI + substantive peer discussion  | Outstanding | Contribution guide and PR template                       | Actual group PRs and direct URLs                                         |

## Additional quality work already included

Conditional versioned saves and conflict recovery controls; Markdown download; explicit session revocation for all sockets; capped reconnect backoff; heartbeat status; rejected foreign origins; sanitized Markdown; rate-limited authentication; UTF-8 body sizing; strict positive IDs/versions; compiled CI artifact; separate transport/storage/rendering modules; Git/Docker exclusions for local runtime files.

These improve the foundation but do not replace external review evidence. No CRDT implementation, production load test or public deployment is claimed.

## Evidence register - fill with actual records

| Evidence                                        | Value   |
| ----------------------------------------------- | ------- |
| Final group repository                          | Pending |
| Protection settings verified by/date            | Pending |
| PR 1 URL / peer reviewer / AI comments / CI run | Pending |
| PR 2 URL / peer reviewer / AI comments / CI run | Pending |
| Clean-machine tester / OS / date / result       | Pending |
| Two-browser demo / network interruption result  | Pending |
| ADR group approval and actual prompt-log date   | Pending |
| Final main SHA / tag / release URL              | Pending |
| Canvas and email submission confirmation        | Pending |

Task 1 deadline: 28 October 2026 at 16:00 Europe/London. Do not replace pending entries with invented links or approvals.

## 22 October interface and repository update

The workspace now has a light navigation sidebar, reading mode, generated contents links, explicit editing mode and document links, inspired by the supplied reference. Login, storage, version conflicts and full-duplex presence remain intact. The user confirmed that the groupmate's repository will be used later. Remote setup and deployment remain pending. DEPLOYMENT.md and render.example.yaml prepare a persistent hosting option; they do not provision it. See VALIDATION.md for observed checks and limits.
