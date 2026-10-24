# Draft project plan

Prepared 14 October 2026. This is a planning draft for group agreement, not evidence of meetings or completed assignments. All submission times below use Europe/London.

## Milestones

| Date               | Outcome                                                     | Acceptance evidence                                           |
| ------------------ | ----------------------------------------------------------- | ------------------------------------------------------------- |
| 14-16 October      | Kick-off, repository, role allocation, initial architecture | Agreed backlog and owners; GitHub permissions checked         |
| 17-19 October      | Review ADRs and first implementation                        | Real PR review discussion; automated checks                   |
| 20 October         | Finalise project plan                                       | Whole group reviews schedule, risks and responsibilities      |
| 21 October, 16:00  | Project plan deadline (5%)                                  | Email submission recorded by group                            |
| 22-25 October      | Follow-up PR, failure-path tests and demo rehearsal         | Two substantive PRs, bot comments and teammate reviews        |
| 26-27 October      | Clean-clone rehearsal, documentation/PDF review             | Marker setup succeeds; checklist completed                    |
| 28 October, 16:00  | Task 1 deadline (10%)                                       | Accepted main commit tagged; GitHub/Canvas evidence submitted |
| As announced       | Tasks 2-5 (20%, 20%, 15%, 20%)                              | Re-plan from each new customer requirement                    |
| 11 December, 16:00 | Reflective essay deadline (10%)                             | Evidence-based reflection emailed by group                    |

Arrange the customer demonstration promptly around each software delivery. Complete required Buddycheck peer assessments. Dates for Tasks 2-5 were not supplied; do not invent them.

## Initial backlog and allocation

| Story                 | Acceptance                                                      | Owner / reviewer   |
| --------------------- | --------------------------------------------------------------- | ------------------ |
| Repository and CI     | PR checks reject failing lint, format, types, tests or build    | Assign at kick-off |
| Authentication        | Valid login persists; invalid or expired sessions rejected      | Assign at kick-off |
| Documents and preview | Title, author and Markdown survive restart; unsafe HTML removed | Assign at kick-off |
| Presence              | Two browsers exchange join/roster; leaving updates roster       | Assign at kick-off |
| Architecture          | CRDT/OT, topology and stack trade-offs reviewed                 | Assign at kick-off |
| Handover              | Fresh setup, demo, ADR export and submission evidence           | Assign at kick-off |

Capacity must be estimated after learning group size and availability. Prefer vertical slices and one independent reviewer per story over assigning one person permanent ownership of an isolated layer.

## Risks and responses

| Risk                                            | Response                                                               |
| ----------------------------------------------- | ---------------------------------------------------------------------- |
| Concurrent edits lose data                      | Version-based conditional update now; CRDT convergence tests in Task 2 |
| Setup differs across machines                   | Node version and lockfile; clean-clone rehearsal; optional container   |
| AI-generated code appears correct but is flawed | Human review, actual integration tests, critical ADR commentary        |
| GitHub gates configured only on paper           | Owner verifies branch settings and a real PR before submission         |
| Scope grows beyond Task 1                       | Keep explicit backlog exclusions and ask customer about ambiguity      |
| Uneven participation or absence                 | Transparent allocation, check-ins, rotation and early escalation       |

Review progress twice weekly, record decisions and blockers, and update this plan when requirements or capacity change. The group must choose concrete meeting times.
