# Repository management setup status

This is an inspection record. Re-check live GitHub settings before each merge or release.

## Verified repository state

- Repository: `edusalman345/Intelligent-Investment-Portfolio-Advisor-FYP`.
- Pull request #1 targets `main` from `chore/repository-management` and remains a draft awaiting review and explicit owner merge authorization.
- `main` is the default branch, and GitHub reports it as protected.
- The active [Protect main ruleset](https://github.com/edusalman345/Intelligent-Investment-Portfolio-Advisor-FYP/rules/24410479), ID `24410479`, targets `refs/heads/main` with no exclusions.
- `main` still contains only the project-title README. No application code, dependency configuration, test suite, or workflow exists.
- This draft proposes management instructions, the supplied protocol, an expanded PR template, and environment-file ignore rules. They are not yet merged into `main`.

## Verified main protections

| Control | Current setting |
| --- | --- |
| Require a pull request | Enabled |
| Approving reviews | At least 1 required |
| Resolve review conversations | Required |
| Block branch deletion | Enabled |
| Block force pushes | Enabled |
| Bypass actors | None configured |
| Current connection can bypass | Never |
| Dismiss stale approvals on push | Disabled |
| Approval after latest reviewable push | Disabled |
| CODEOWNER review | Disabled |
| Required named status checks | None configured |
| Require status checks against an up-to-date target | Disabled |

The required-status-checks rule is present, but its list is empty. This does not currently enforce any particular test, lint, or build result. Do not describe it as enforced CI coverage.

The ruleset permits merge, squash, and rebase merge methods. The supplied protocol recommends a consistent strategy, with squash as a common default.

## Administration access

The owner configured the active protection. The current GitHub connection can inspect the ruleset but provides no administrative write tool for branch protection, rulesets, or deployment environments. The manager has not changed these settings.

Use an authorized administrator for any further settings changes. Availability may depend on the repository's GitHub plan and organization policy. Never weaken or bypass the active rules to make a pull request merge.

## Remaining protection improvements

- Consider dismissing stale approvals when code is pushed and requiring approval of the latest reviewable push.
- Confirm eligible independent reviewers and specialist owners. The protocol recommends at least one independent reviewer and preferably two for high-risk changes; do not substitute the PR author for an independent reviewer.
- Add real required status checks after project CI exists and has run successfully. Consider validation against the current target branch.
- Configure appropriate CODEOWNERS using confirmed eligible people or teams.

These settings do not replace the owner's explicit authorization for each merge.

## Configure when the project is available

- Choose the actual application stack and document install, test, build, lint, and type-check commands.
- Add meaningful PR CI for those commands; preserve any workflows added in the meantime.
- Select preview or staging and production deployment targets; configure production approvals and branch restrictions where supported.
- Confirm deployment behavior before any future authorized merge, including whether a merge automatically triggers a deployment.
- Define release identification, QA, rollback, production smoke tests, and monitoring.
- Define production backup and restoration arrangements separately from Git history.
- Review least-privilege access and available secret scanning without exposing secret values.

Do not invent a technology stack, nonexistent status-check names, reviewers, production services, credentials, or backup claims merely to complete this checklist.

## Secret prevention

The proposed `.gitignore` excludes `.env` and `.env.*` files. This is a starter safeguard, not a scanner. Inspect every diff for embedded credentials and extend ignore rules according to the chosen stack. Do not commit environment files or production credentials.

## Required approval boundaries

Branch creation, task commits, pushes, and pull request creation are automatic by default. Every merge requires explicit owner authorization and satisfied repository protections. Production deployment requires its own authorized approval. Destructive or difficult-to-reverse actions require explicit approval before execution.
