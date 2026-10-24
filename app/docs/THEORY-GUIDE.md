> **24 October update:** This document records the earlier Task 1 baseline. Projects, private permissions, invitations, Trash and Yjs live text editing are now implemented. See [COLLABORATION.md](COLLABORATION.md) and [VALIDATION.md](VALIDATION.md) for the current behaviour. Earlier statements that all accounts share every document or that CRDT editing is unimplemented are superseded. GitHub/submission evidence remains pending.

# Guide for the group's theoretical discussion

This is a working analysis guide, not a record of group agreement. Use it to prepare ADRs and the demonstration in your own words, verify primary references and add actual research evidence. Every member should be able to explain the chosen trade-offs.

## 1. Problem and walking skeleton

Explain why a collaborative document platform needs more than CRUD: simultaneous writers may act on stale states; network delay separates what users see; reconnecting clients must recover; presence is temporary while saved content is durable. Task 1 proves the end-to-end path through UI, authenticated server, database and full-duplex transport. It deliberately does not solve character-level merge yet.

Evidence: show one signup, one saved Markdown document after restart and both directions of `/ws` frames. Link the relevant automated tests. Distinguish a working feature from an assumption about future scale.

## 2. Concurrency alternatives

| Criterion          | Yjs-style CRDT                                                                               | ShareDB-style OT                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Conflict mechanism | Merge updates using identifiers/causal structure                                             | Transform concurrent operations relative to other operations                                          |
| Ordering           | Delivery can be reordered/duplicated within the library's algorithm and protocol assumptions | Server coordinates versions/order and transforms through type plugins                                 |
| Reconnection       | Exchange missing state/updates; durable delivery remains an application concern              | Library supports reconnect/offline change synchronization; do not claim OT cannot support offline use |
| Main complexity    | Metadata, update storage, compaction, bindings and migration                                 | Correct transformation types, history/version tracking and server coordination                        |
| Central server     | Optional for merge mathematics, useful for auth, relay and durability                        | Natural fit for the selected ShareDB architecture                                                     |
| Security           | Must authorize updates separately                                                            | Must authorize submissions separately                                                                 |
| Proposed fit       | Yjs with a central relay for Task 2                                                          | Credible alternative if team experience or prototypes favour it                                       |

Convergence means replicas eventually agree after receiving the required updates under the algorithm's assumptions. It does not mean every edit is durably stored, every user's intent is preserved, or unauthorized users cannot modify data. Avoid saying a CRDT 'solves packet loss': an update that is never delivered or persisted cannot be magically recovered.

The current version field solves a different problem: it detects a stale whole-document save and rejects it. Illustrate with Alice and Bob both reading version 1; Alice commits version 2; Bob's version 1 save returns 409. Explain why this is not full real-time editing.

Primary references: [Yjs](https://docs.yjs.dev/), [ShareDB](https://share.github.io/sharedb/). These describe library capabilities; our product recommendation is a design judgement, not an empirical benchmark.

## 3. Network topology

| Topic                 | Client-server relay                                      | WebRTC peer mesh with fallback                                         |
| --------------------- | -------------------------------------------------------- | ---------------------------------------------------------------------- |
| Local demonstration   | One known endpoint, easier logs and restart              | Signalling plus peer connection lifecycle                              |
| Access and revocation | Central admission and session checks                     | Each peer/fallback path must enforce policy                            |
| Durability            | One storage boundary                                     | A durable authority still needs deciding                               |
| Failure               | Relay outage interrupts live presence/editing            | Peer availability and NAT traversal complicate recovery                |
| Cost/scale            | Central traffic load; scale later with coordinated rooms | Peer traffic and signalling complexity; fallback still costs resources |

Our proposal selects client-server. The server is authoritative for access and persistence, not a claim that it changes Yjs merge rules. Avoid simplistic statements that P2P is automatically faster, cheaper, more private or more reliable.

## 4. Stack evaluation

| Choice                         | Why it fits Task 1                                                     | Cost or alternative                                                                                                |
| ------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| Browser modules / HTML / CSS   | Small UI, readable source, no frontend build required                  | Less structured state management than React/Svelte/Vue; reassess with editor bindings                              |
| Node 24 / TypeScript / Express | One ecosystem, strict backend types, simple HTTP/WebSocket integration | Synchronous SQLite can block event loop; Go/Python remain viable                                                   |
| SQLite                         | Embedded, reproducible local setup, transactional conditional saves    | Single writer; multi-instance operation needs new storage/coordination                                             |
| PostgreSQL alternative         | Suitable for shared service storage and richer operational needs       | Extra service, credentials and deployment work                                                                     |
| MongoDB alternative            | Flexible document model                                                | No demonstrated need for its trade-off over simple relational accounts/authors                                     |
| ws / native browser WebSocket  | Direct full-duplex protocol with small event vocabulary                | Reconnect and room semantics are application responsibilities; Socket.IO adds these conveniences with its protocol |
| marked + sanitize-html         | Explicit parser boundary and filtered output                           | Library behavior needs regression tests; not a custom AST parser yet                                               |

Because the brief explicitly mentions a frontend framework selection, ask the convenor whether a documented no-framework choice is acceptable. Do not call vanilla JavaScript React or invent a requirement that React must be used. If a framework is required, implement that change through a genuine reviewed PR.

## 5. Verification and security

Explain which fault each check targets: lint catches suspicious patterns; formatting makes diffs consistent; strict types catch incompatible backend values; unit/integration tests assert behavior; compilation proves a runnable output can be produced. None alone proves correctness. Peer review tests understanding and design, while an AI bot supplies suggestions to assess, not unquestioned approval.

Discuss parameterized SQL, salted scrypt passwords, hashed random session tokens, HttpOnly/SameSite cookies, Origin checking on HTTP and WebSocket upgrade, expiry/revocation, output sanitization and content policy. Also state limits: open registration, a single shared workspace, no password recovery, no brute-force protection shared across multiple servers and no production load evidence. Do not claim 'enterprise-grade security' has been independently assessed.

## 6. AI-use appendix and critical evaluation

For each real architecture discussion record: date; participant; model/tool if known; exact prompt; useful advice; rejected/qualified advice; evidence used to decide. Suggested prompts are not completed prompts. Use a follow-up such as: 'Challenge our choice under disconnects, conflicting writes, session expiry and marker setup constraints. Which claims need experiments?'

The current ADR appendices honestly record assistant-generated reasoning. The team must add its own actual prompts and critical commentary before presenting this as the team's research process. Useful critiques include the earlier untested assumption that tools available to the assistant would be available in a normal VS Code terminal, and the distinction between optimistic saves and CRDT convergence.

## 7. Suggested written structure

1. Context, stakeholders and Task 1 boundaries.
2. Functional requirements and evidence matrix.
3. ADR 001: alternatives, topology, decision, consequences and AI critique.
4. ADR 002: stack/storage/transport trade-offs and AI critique.
5. Component/data/sequence diagrams and implementation mapping.
6. Testing, CI, peer review and configuration management evidence.
7. Limitations, risk register, improvements and next milestone.

Use actual PR URLs, CI runs and screenshots only when they exist. Finish with an explanation of what changed because of peer feedback. That is stronger evidence than an unqualified claim that all requirements are done.
