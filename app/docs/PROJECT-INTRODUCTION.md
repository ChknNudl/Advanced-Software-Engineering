# Project inception: MarkSync

## Vision

Give small teams a shared, browser-based place to write Markdown notes and decisions. The longer-term challenge is preserving a coherent document when multiple people edit simultaneously, reconnect after network loss, or work from different versions.

The product is the vehicle for practising collaborative software engineering: controlled changes, quality gates, explicit trade-offs, repeatable builds and maintainable handover. The module convenor acts as customer and introduces requirements in stages.

## Task 1 scope

An authenticated user can create, open and save a titled Markdown document. Accounts, sessions and document text persist in SQLite. A preview renders the Markdown safely. Opening a document establishes a two-way WebSocket channel and shows live presence. A clean clone has clear setup and verification instructions.

Full character-level collaboration, offline editing, document permissions and new requirements from later tasks are outside this milestone. Task 1 does not claim enterprise production readiness.

## Stakeholders and ways of working

- Customer: module convenor, responsible for requirement clarification and acceptance.
- Development team: group members, responsible for implementation, research, review, verification and documentation.
- Marker/maintainer: needs reproducible local execution and traceable architectural decisions.
- Users: members of a trusted group workspace writing shared documents.

Names, roles and availability must be filled in by the actual group. No team composition has been assumed. Use short iterations, regular check-ins, peer review and a demonstrable increment at each milestone.

## Kick-off agenda

1. Confirm each person's availability, preferred role and learning goals.
2. Agree the shared-workspace policy with the customer: every registered account can read and edit every document.
3. Review the two proposed ADRs and choose whether to accept or amend them.
4. Assign story owners and independent reviewers; invite teammates to GitHub.
5. Confirm branch protection, CI and bot installation with a real PR.
6. Run the demo from a second machine and record any setup gaps.

## Opening presentation outline

1. Problem: keeping team knowledge shared while changes remain reliable.
2. Scope: authentication, persistent Markdown, rendering and WebSocket presence.
3. Architecture: browser -> HTTP/API and WebSocket relay -> SQLite.
4. Engineering evidence: passing checks, reviewed PRs, ADR trade-offs and reproducible execution.
5. Next increment: introduce a CRDT only once the foundation is accepted.
