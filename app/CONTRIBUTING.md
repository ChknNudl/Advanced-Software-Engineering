# Working together

Use short-lived branches and pull requests targeting `main`. Do not push feature changes directly to `main`. Each change needs passing `quality` CI and at least one approving teammate who did not author it. Discuss design and tests, not just formatting. Record why AI suggestions were accepted or rejected; a bot is not a substitute for human peer review.

Before opening a PR, run `pnpm check`. Use `pnpm format` to apply formatting. Keep changes small enough for a teammate to explain. Do not commit databases, credentials, node_modules, generated dist output, or real user data.

Track each story with acceptance criteria, an owner, a reviewer and a milestone. Keep meeting notes recording decisions, blockers and next actions. Rotate review and demonstration responsibilities. Escalate persistent blockers to the group early and agree any scope change with the module convenor.

## Suggested first two PRs

1. Review the Task 1 foundation, architecture, authentication and WebSocket tests. Teammates should challenge the shared-workspace authorization policy and document persistence assumptions.
2. A teammate makes a substantive follow-up based on review (for example an accessible conflict-resolution flow with tests or additional socket expiry coverage). Review that change with the same CI and AI gates.

These are planned PRs, not claims of completed peer review. Do not split empty or cosmetic changes merely to manufacture evidence. Store actual merged PR URLs in the submission checklist only after they exist.

## Definition of done

Acceptance behavior works locally; meaningful tests cover failures; all quality checks pass; a teammate approves; AI findings are assessed; documentation matches the code; the convenor can reproduce the demo from a clean clone.
