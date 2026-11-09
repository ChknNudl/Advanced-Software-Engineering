# AI engineering and debugging log - Task 2

Recorded from actual implementation/debugging on 4 November 2026. AI assistance produced code and tests; this log does not invent independent group review or claim that a teammate performed these experiments. Team members should inspect the evidence and add their own review observations.

## 1. Reconnect-only recovery did not cover a healthy socket losing a message

**AI-generated starting point.** Earlier preparation sent pending edits after typing or reconnect and fetched missing state on join. Its generated test delayed/reordered updates, then directly gave clients the store's final state. That test exercised Yjs merging but could conceal an incomplete application recovery protocol.

**Why insufficient.** Dropping the last client update or a server acknowledgement without closing the socket left no new typing/reconnect event to trigger recovery. A missed remote delta could leave a reader stale indefinitely. CRDT convergence requires delivery; it does not deliver missing updates itself.

**Observed evidence.** The new real-WebSocket regression `lost updates and acknowledgements recover while sockets remain connected` was run before server repair support. It failed at `valid recovery messages must be accepted`, with repeated `Invalid event or document.` responses to the new resync requests. This exposed the missing recovery endpoint rather than a Yjs algorithm failure.

**Resolution.** Added authenticated, bounded `resync` handling and shared `Replica.repairMessages()`. The browser retries unacknowledged updates and exchanges state vectors every three seconds, including while the socket is open; a lost initial response retries join. Tests repair through those ordinary messages, never by writing the final oracle into clients. The negative control disables repair and asserts that a dropped edit is detected. Two actual browser sessions with their first outgoing edit dropped recovered automatically, converged and displayed named cursors without page errors.

**Learning.** Keep the original merge/recovery unit tests, but distinguish them from end-to-end delivery evidence. Test the application protocol and quiescent lost-message case, not merely the CRDT library.

## 2. A random-drop test initially failed to exercise the fault it claimed

**AI-generated code.** The first new regression used two edits under a seeded random-loss scheduler and asserted both upstream and downstream loss.

**Observed failure.** After fixing resync, the regression failed at `assert(n.metrics.droppedDown > 0)` for network seed 42. Both outgoing edits could be discarded before the server emitted any update, so no downstream message existed to drop. The 25-scenario property run passed, demonstrating that a green property run alone did not prove the named regression's coverage.

**Resolution.** Introduced explicit coverage probes: drop the first upstream update, ensure a second update reaches the server, and drop the first downstream sync and first acknowledgement. Keep seeded random delays, loss and duplication around those probes. Every generated scenario now asserts upstream loss, downstream loss, acknowledgement loss and latency. A separate fixed scenario verifies actual duplication/reordering. Collect broadcasts behind processing barriers and fix test-only replica IDs so replay does not depend on OS callback order or random Yjs identities; a replay test compares two complete outcomes.

**Learning.** Fault injection must be measured, not inferred from a random probability or test name. Negative controls and fault counters help reject superficial chaos tests. The protected coverage probe is disclosed in the strategy; the channel is not falsely described as uniformly independent random loss.

## Commands and evidence locations

- `pnpm test:chaos`: dedicated regressions, negative control, deterministic replay and 100 property scenarios by default.
- `CHAOS_SEED` / `CHAOS_RUNS` / `CHAOS_PATH`: control random exploration and replay the counterexample path emitted by fast-check.
- `test/chaos/network.ts`, `test/chaos/sync.chaos.ts`: executable evidence.
- `pnpm check`: lint, formatting, types, existing tests, chaos and build.
- CI runs two seed configurations; the PR check logs provide remote evidence after publication. An open PR or a local pass is not proof of a merged submission.
