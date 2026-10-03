# Repository management setup status

This is an inspection record, not a claim that the desired controls are enabled. Re-check live GitHub settings before each merge or release.

## Verified during setup

- Repository: `edusalman345/Intelligent-Investment-Portfolio-Advisor-FYP`.
- Pull request #1 targets `main` from `chore/repository-management` and is a draft.
- `main` is the default branch and GitHub reports it as unprotected.
- The repository ruleset listing is empty.
- `main` contains only the project-title README. No application code, dependency configuration, test suite, or workflow exists.
- This draft proposes management instructions, the supplied protocol, an expanded PR template, and environment-file ignore rules. They are not yet merged into `main`.

## Enforcement gap

The current GitHub connection supports content and pull request operations but provides no administrative write tool for branch protection, rulesets, or deployment environments. The GitHub CLI was not available, and the browser-control session could not start. Administrative settings have not been changed.

Use the repository's GitHub settings to enable controls below with an authorized administrator. Availability may depend on the repository's GitHub plan and organization policy. Do not claim a setting is enabled until it can be verified.

## Configure main protection

1. Target `main` with an active ruleset or branch protection.
2. Require pull requests and independent approvals. Follow the team's reviewer count; the protocol recommends at least one independent reviewer and preferably two for high-risk work.
3. Require resolution of review conversations; dismiss stale approvals and consider approval after the latest reviewable push.
4. Block force pushes and branch deletion, restrict direct pushes, and apply protections to administrators or prevent routine bypass where supported.
5. Add required CI checks only after real project checks exist and have run successfully. Consider validation against the current target branch.
6. Configure appropriate CODEOWNERS using confirmed eligible people or teams. Do not substitute the PR author for independent review.

These settings do not replace the owner's explicit authorization for each merge.

## Configure when the project is available

- Choose the actual application stack and document install, test, build, lint, and type-check commands.
- Add meaningful PR CI for those commands; preserve any workflows added in the meantime.
- Establish confirmed reviewers and specialist owners for sensitive areas.
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
