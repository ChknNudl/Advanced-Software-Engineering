# ADR 001: CRDT collaboration through a server relay

## Status

Proposed on 14 October 2026; awaiting group review. Task 1 implements presence and conflict detection only. This records the proposed direction for Task 2, not an implemented CRDT engine.

## Context

The final platform must preserve edits from multiple users despite concurrency, delay and reconnection. We need a design the group can explain and test. Document content, ephemeral presence and durable storage have different lifecycles.

Operational Transformation (OT) transforms operations relative to concurrent operations. A central ordering/versioning service can fit an online editor well, but transformation correctness and history/reconnect handling must remain consistent across the chosen text operations. ShareDB supplies an OT-based backend, so the alternative is a mature library, not a request to invent transforms from scratch.

A CRDT encodes mergeable updates with identifiers and causal information. Yjs offers shared types, editor bindings and transport providers. Under its algorithm's assumptions, replicas that eventually receive the same updates converge; the application must still deliver updates, authorize users, persist state and bound resource use. CRDT metadata and compaction complicate storage and debugging. It does not eliminate all user-visible edit surprises.

## Decision

Evaluation criteria, in priority order: correctness under reconnection, availability of maintained text/editor bindings, testability, local reproducibility, and operational complexity. These are qualitative criteria, not measured benchmark scores. Both Yjs and ShareDB are credible: ShareDB supports offline change synchronization too, so offline support alone does not decide the choice. We favour Yjs because mergeable text updates and editor bindings fit the proposed future direction, while retaining a server for authorization and durability. If a group prototype shows materially better understanding or integration with ShareDB, revisit this proposal before Task 2.

Propose Yjs text CRDT for Task 2, connected through an authenticated client-server WebSocket relay. The relay is authoritative for access, admission and persistence, while CRDT merging determines text convergence. Keep presence ephemeral and separate from persistent document state.

Reject a peer-to-peer WebRTC mesh with cloud fallback for the initial product. It adds signalling, NAT traversal, relay fallback, peer lifecycle, access revocation and distributed persistence decisions before they serve an accepted requirement. A server relay is simpler to operate and observe locally, at the cost of a central availability dependency.

For Task 1, use plain text snapshots with a database version number. The save performs one conditional UPDATE and returns 409 for a stale version. This prevents silent overwrites but does not merge edits. The WebSocket service exchanges join/roster events and ping/pong only.

## Consequences

- Future CRDT tests must simulate duplicate, reordered, delayed and dropped updates followed by reconnection, and assert convergence and durability.
- Persist CRDT updates or consistent snapshots and state vectors when Task 2 arrives; do not independently overwrite a plain-text snapshot while CRDT sessions are active.
- Define document authorization at both HTTP and socket boundaries. A convergent data structure does not provide access control.
- A single relay is sufficient for this milestone. Horizontal scaling needs coordinated rooms and shared durable state and is not implemented here.
- Current optimistic versioning protects saves but requires manual conflict reconciliation. The UI explains this limitation.

## AI prompt appendix

Audit input on 21 October 2026: the user asked to "analyze all, we need strong project and fully fill the requirements and more for the task 1 project need to develop also need the text for group mates so they will see the project and understand so they could write documentation, share ideas release it on github and write theoretical part". In response, the assistant checked the specification, separated transport into presence.ts and expanded room/expiry/reconnect tests. This is an actual assistant interaction, not a substitute for the group's own targeted CRDT/OT research log.

Actual user prompts in this session included: "it is group project for Advances Software engineering" and "create repository for the beginning and do the task 1 and intro moments for the projcet", together with the supplied Task 1 specification. This ADR was drafted by an AI coding assistant from those inputs and checked against the primary sources below. No separate team research conversation or team approval has occurred in the available record.

Suggested follow-up prompt for the team (not yet run): "Compare Yjs and ShareDB for our Markdown editor under reconnect, dropped messages, access revocation and a single-server local deployment. Identify what each library does not solve and propose tests."

Critical commentary: Separating ephemeral presence from durable text and distinguishing convergence from access control are useful architectural insights. The assistant's recommendation remains a proposal without workload measurements, a Yjs prototype or evidence of the group's familiarity with either library. Treating 'CRDT' as a guarantee against all lost work would be superficial: update delivery, durable writes, migration and user intent still matter. The group should challenge this draft with a small reconnect experiment and record its own findings rather than present suggested prompts as completed research.

## Primary references

- Yjs documentation: https://docs.yjs.dev/
- Yjs awareness and presence: https://docs.yjs.dev/getting-started/adding-awareness
- ShareDB introduction: https://share.github.io/sharedb/
