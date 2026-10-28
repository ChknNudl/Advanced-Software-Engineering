# ADR 001: CRDT collaboration through a server relay

## Status

Implemented choice; formal group acceptance pending peer review. Corrected on 28 October 2026 against GitHub main at ac472ae35abfe129064e90de9e1e8f55dce19aee. This record describes that implementation, not unpushed local development. It supersedes the earlier presence-only description.

## Context

The final platform must preserve edits from multiple users despite concurrency, delay and reconnection. We need a design the group can explain and test. Document content, ephemeral presence and durable storage have different lifecycles.

Operational Transformation (OT) transforms operations relative to concurrent operations. A central ordering/versioning service can fit an online editor well, but transformation correctness and history/reconnect handling must remain consistent across the chosen text operations. ShareDB supplies an OT-based backend, so the alternative is a mature library, not a request to invent transforms from scratch.

A CRDT encodes mergeable updates with identifiers and causal information. Yjs offers shared types, editor bindings and transport providers. Under its algorithm's assumptions, replicas that eventually receive the same updates converge; the application must still deliver updates, authorize users, persist state and bound resource use. CRDT metadata and compaction complicate storage and debugging. It does not eliminate all user-visible edit surprises.

## Decision

Evaluation criteria, in priority order: correctness under reconnection, availability of maintained text/editor bindings, testability, local reproducibility, and operational complexity. These are qualitative criteria, not measured benchmark scores. Both Yjs and ShareDB are credible: ShareDB supports offline change synchronization too, so offline support alone does not decide the choice. Select Yjs because mergeable text updates and its editor ecosystem fit collaborative Markdown, while retaining a server for authorization and durability. Yjs is already integrated into the GitHub baseline. This is an engineering choice, not a measured claim that Yjs outperforms ShareDB. Revisit it if later requirements or experiments favour another approach.

Use a Yjs text CRDT connected through an authenticated client-server WebSocket relay. The relay is authoritative for access, admission and persistence, while CRDT merging determines text convergence. Keep presence ephemeral and separate from persistent document state.

Reject a peer-to-peer WebRTC mesh with cloud fallback for the initial product. It adds signalling, NAT traversal, relay fallback, peer lifecycle, access revocation and distributed persistence decisions before they serve an accepted requirement. A server relay is simpler to operate and observe locally, at the cost of a central availability dependency.

The GitHub baseline already merges live text through Yjs, beyond the Task 1 minimum. The browser joins a document over /ws and sends incremental Yjs updates with sequence numbers. The server checks editing permission, applies the update, persists Markdown and encoded Yjs state, and broadcasts full state with document metadata; the originating client receives an acknowledgement. Presence rosters and ping/pong demonstrate the required two-way channel. HTTP saves additionally use a conditional version check and return 409 for stale versions. That check protects snapshot saves; it is not the CRDT merge algorithm.

## Consequences

- Future CRDT tests must simulate duplicate, reordered, delayed and dropped updates followed by reconnection, and assert convergence and durability.
- SQLite currently stores an encoded Yjs state alongside raw Markdown, version and update time. Keep these representations consistent when saving. State-vector/delta optimisation and a durable browser outbox are not implemented in this baseline.
- Define document authorization at both HTTP and socket boundaries. A convergent data structure does not provide access control.
- A single relay is sufficient for this milestone. Horizontal scaling needs coordinated rooms and shared durable state and is not implemented here.
- Pending client updates are held in memory, so page reload or closure can lose unsent work. A CRDT alone does not make this editor offline-first or guarantee recovery. Full-state broadcasts and CRDT metadata increase bandwidth/storage; future optimisation must preserve correctness.

## AI Prompt Appendix

### Actual prompts and use

These are genuine prompts from the project conversation. They are broad implementation/review requests, not a fabricated specialist research session or evidence of group approval.

1. "create repository for the beginning and do the task 1 and intro moments for the projcet" - supplied together with the Task 1 brief, including its CRDT-versus-OT and network-topology questions; used to draft the initial architecture evaluation.
2. "need to make architecture of the project(task1 and some more maybe idk just architecture). add it in marksync pdf make it clear and understandable and being 100% accurate for requirements and our project" - prompted a review of the implementation and architecture boundaries.
3. "make sure u writing about the version of the site from github because after we made repository in github and made a clone there i didnt change the version of the site in github" - constrained this correction to the published baseline rather than newer local features.

### Critical commentary

The AI usefully separated transient presence, durable document state and transport, and explained that CRDT convergence does not provide authorization or message delivery. However, its earlier ADR described Yjs as future work even though the published code already used it: plausible architectural prose had become stale. The correction was checked against presence.ts, store.ts and public/app.js at the cited commit. Advice that CRDTs guarantee no lost work or that OT cannot reconnect would be misleading; delivery, unsent browser state and application recovery remain engineering responsibilities, and ShareDB supports offline synchronization. No performance benchmark or completed group acceptance is claimed. The group should review the actual code and later test convergence under reordered, duplicate and temporarily lost updates rather than treating AI recommendations as proof.

## Implementation evidence and verification boundary

- app/src/presence.ts: authenticated document rooms, permissions, roster, heartbeat, Yjs update admission, broadcast and acknowledgement.
- app/src/store.ts: SQLite state, Yjs application/persistence and versioned document saves.
- app/public/app.js: Yjs client, local changes, pending updates and socket reconnection.
- app/test/app.test.ts: existing integration tests; test presence is not a claim of exhaustive distributed-systems correctness or complete Task 2 property-based testing.
- Code baseline: https://github.com/ChknNudl/Advanced-Software-Engineering/tree/ac472ae35abfe129064e90de9e1e8f55dce19aee

## Primary references

- Yjs documentation: https://docs.yjs.dev/
- Yjs awareness and presence: https://docs.yjs.dev/getting-started/adding-awareness
- ShareDB introduction: https://share.github.io/sharedb/
