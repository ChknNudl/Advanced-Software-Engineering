# MarkSync sync protocol: plain-English rules

Source for the TLA+ model in `MarkSyncProtocol.tla`. Write each rule from the code, not from memory, and cite the file/lines it comes from. Each rule should say: who acts, when it can happen, and what state changes.

## Participants and state

<!-- Clients, server, what each one holds (clock, known operations, pending queue, connected flag, state vector). -->

## Client rules

<!--
1. Local edit — public/collaboration.js:16-27
2. Retry / batching of pending edits — public/collaboration.js:50-57
3. Receiving an update with an ack — public/collaboration.js:59-61
4. Heartbeat (retry pending, then resync) — public/app.js:217-229
5. Reconnect with backoff — public/app.js:272-273
6. Restoring the queue after a tab refresh — public/collaboration.js:136-181, public/app.js:450
-->

## Server rules

<!--
1. Join: check access, reply with missing state — src/presence.ts:176-206, src/presence.ts:105
2. Resync: reply with state the client lacks — src/presence.ts:209-230
3. Update: check edit access, merge, persist, ack sender, send delta to peers — src/presence.ts:271-304, src/presence.ts:126-134
4. Access removed / read-only: close the socket — src/presence.ts:95, src/presence.ts:280
-->

## Network assumptions

<!-- Loss, duplication, reordering, socket closes at any time. -->

## Abstractions (what is not modelled)

<!-- e.g. text replaced by <<client, clock>> tokens; timers become actions that can happen at any time; rate limits, size caps and cursors omitted. Say why each omission is safe. -->

## Invariants in English

<!--
- Monotonicity: ...
- Convergence: ...
- Acknowledged edits are never lost: ...
-->
