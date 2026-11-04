# Task 2: real-time synchronisation and property-based testing

Implementation and evidence prepared on 4 November 2026. This branch includes the earlier local profile/publication, comments, search, UI and optional writing-tool integration work. External AI/plagiarism providers are not needed for Task 2 and remain unconfigured by default.

## Requirement map

| Requirement                                                | Implementation / evidence                                                                                                                                                                                                                                                              |
| ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Simultaneous editing and deterministic conflict resolution | Yjs text replicas in `public/collaboration.js`, used by `public/app.js`; authenticated `src/presence.ts` transport; `src/store.ts` persists Markdown and Yjs state. No document-wide editing lock.                                                                                     |
| Cursor / selection presence                                | `public/cursors.js` draws named selections/carets from Yjs relative positions. Server-derived identity, separate connection IDs, expiry and disconnect cleanup. Existing real-socket tests cover identity and departure.                                                               |
| Property-based network chaos                               | `test/chaos/sync.chaos.ts` uses fast-check and `test/chaos/network.ts`. Three editors plus a read-only observer connect through real WebSockets to the production application and SQLite store.                                                                                        |
| Latency, drops, out-of-order edits                         | Seeded virtual-time application-message queue: 1–12 tick delay, random loss (~23% except explicit coverage probes), duplicates (~20%), reordering; concurrent Unicode insertions/deletions. Initial probes guarantee upstream, downstream and acknowledgement loss.                    |
| Strong eventual consistency                                | After edits stop and delivery becomes reliable, only normal retry/resync messages repair the replicas. Assert all four client strings, server Markdown, persisted CRDT text and operation frontiers agree with an oracle that saw every generated edit before loss. Queues must drain. |
| CI                                                         | Root `.github/workflows/ci.yml`, `checks` job, runs `pnpm test:chaos` with seeds 20261104 and 11042026, 100 scenarios each. Failure fails the job. Repository owner must require `checks` in main's ruleset.                                                                           |
| AI evaluation / PDF                                        | [Debugging log](TASK2-AI-LOG.md) and [two-page report](../output/pdf/marksync-task2-report.pdf). No invented team review or benchmark.                                                                                                                                                 |
| Local instructions                                         | Both repository README and app README explain `pnpm test:chaos`, fixed seeds and shrink-path replay.                                                                                                                                                                                   |

## Protocol and recovery

1. A signed-in client joins with document ID, protocol 2 and a Yjs state vector. The server checks document access and replies with missing state, title, version and role.
2. Local edits produce updates in a sequence-numbered pending queue. A 120 ms debounce batches updates; the queue is saved to sessionStorage when available before sending. Server acknowledgement removes the matching pending batch.
3. The server validates session/role, message size and update rate, merges the Yjs update, saves CRDT state and Markdown, then sends a delta to protocol-2 peers. Legacy clients still receive full-state updates. Duplicate updates do not advance the database version.
4. Every three seconds an open browser session sends a heartbeat, retries its pending batch and requests missing state using `resync`. A missing first join response causes another join. This repairs lost updates, server deltas and acknowledgements even without a socket disconnect. Recovery uses the same `Replica.repairMessages()` method as the chaos harness.
5. A closed socket triggers capped reconnect backoff. Editing pauses until access is confirmed again. A refreshed tab can restore unacknowledged operations; read-only access cannot replay edits. Expired/revoked access is enforced server-side on updates and resync.

Cursor information is ephemeral, not part of the durable CRDT. It uses relative positions so insertions before a caret do not leave a stale fixed offset. Personal undo tracks local transactions only. Titles use a separate version-checked HTTP save; the browser does not roll metadata versions backward on stale sync packets.

## Test design and assumptions

Each scenario starts with a fresh application/database and independent client replicas. The harness uses the same browser replica and real WebSocket handlers; it does not directly write server state during recovery. A separate reference Y.Doc receives generated updates before fault injection. It checks preservation/delivery relative to Yjs semantics, not a second independent implementation of the CRDT algorithm. Local string edits are additionally checked against ordinary JavaScript string operations.

Application messages are intercepted before send / after receive: TCP/WebSocket framing remains ordered, while the simulated application channel can lose, duplicate or reorder messages. Virtual ticks model latency without wall-clock sleeps. Ping/pong barriers only wait for server processing; they do not transfer document state. Incoming broadcasts are collected per receiver before assigning seeded delays, and test replicas use fixed client IDs. A replay test runs an identical schedule twice and checks both final text and fault metrics.

Each generated scenario has 8–35 random operations plus two coverage probes. Operations can be insertions, deletions or replacements. One editor restores its queued state halfway through. Quiescence is followed by three reliable protocol-repair rounds; they must converge without injecting the oracle/server snapshot into clients. The read-only observer never sends edits. A negative-control test disables recovery and must detect a permanently lost update. A dedicated seeded scenario asserts that duplication and reordering actually occurred. Coverage totals are printed in CI.

Finite randomized tests provide evidence, not a mathematical proof. Claims assume eventual delivery, valid authorised updates and configured document limits (100,000 UTF-16 code units / 1.5 MB encoded state). A permanently partitioned or revoked client cannot be promised convergence. Tests do not claim server crash atomicity, enterprise load capacity, multi-instance support or preservation of unsent work after all browser recovery storage is lost. Yjs can deterministically merge overlapping edits into text that still needs human revision.

## Demonstration

1. Start the application, sign in as two different accounts, share a document with edit access and open it in both sessions.
2. Enter Edit document mode in each window. Type concurrently; show equal text, named cursors and selected ranges.
3. Interrupt and restore a connection, then check equal text and Saved status. Show that read-only access prevents editing.
4. Run `pnpm test:chaos`; explain generated operations, actual loss counters, replay seeds and the negative control.
5. Show the PR's named chaos steps in GitHub Actions and substantive peer review before merging.

## Remaining group submission steps

- Repository owner: require status check `checks` on main. Public rules checked on 4 November required one peer approval but listed no required status check; the author's account has push, not admin, access.
- Obtain a real peer review, resolve findings, and merge only after CI passes. Do not describe this branch or an open PR as merged evidence.
- Tag the final merged main commit `task2` (or another agreed name). Preserve the Task 1 tag. No Task 2 tag is created before merge.
- One group email by 11 November 2026, 16:00 UK: final tag, the 1–2-page report and direct URL to the merged PR whose chaos checks passed before merge. Sending is a team action; this document does not imply submission.
