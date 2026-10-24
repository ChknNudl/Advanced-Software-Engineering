# GitHub owner setup

Target repository: the groupmate’s repository, URL pending. Confirmed with the user on 22 October 2026. The current local origin still points to the earlier personal ASE-project repository; do not push there. Clone the final group repository separately, inspect its existing files/history, then integrate this source on a feature branch without overwriting teammates’ changes. Work must be reviewed before merging.

## Access and first PR

1. Authenticate Git/VS Code with an account allowed to push to this repository. Invite actual teammates with appropriate access.
2. Push `task1/walking-skeleton` and open a PR against `main`. Do not merge until a teammate reviews and CI passes.
3. Install the CodeRabbit GitHub App for this repository and enable automatic PR reviews. The root `.coderabbit.yaml` requests summaries and actionable review comments. Configuration alone does not install the bot or establish that a review ran. Check the service's current plan/access for the chosen repository.
4. Open the non-draft PR and verify both CI and the AI review actually run. Ask a teammate for substantive code and architecture review. Keep discussion and fixes in the PR history.

## Protect main

In Settings > Branches (or an equivalent branch ruleset), protect `main`:

- Require pull requests and at least **one approving review**.
- Dismiss stale approvals when new commits are pushed; require conversation resolution.
- Require status checks before merging; select the actual **quality** check emitted by `.github/workflows/ci.yml` after its first run.
- Require branches to be up to date before merging.
- Apply protections to administrators / do not allow bypassing.
- Disable force pushes and branch deletion. No direct feature commits to main.

Confirm the saved settings in GitHub. This document cannot enforce repository settings by itself. See https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches.

## Submission release

After all changes have been peer-reviewed, checks have passed and the accepted version is on main:

```sh
git switch main
git pull --ff-only
git tag -a task1 -m "Task 1 reviewed walking skeleton"
git push origin task1
```

Do not tag an unreviewed feature branch as the completed submission. Record the two real merged PR URLs and the final tag in TASK1-CHECKLIST.md. Email the tag and arrange the customer demonstration; submit the repository link and ADR PDF to Canvas as required. No messages have been sent on the group's behalf.
