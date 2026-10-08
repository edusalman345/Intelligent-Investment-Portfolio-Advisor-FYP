# Repository management instructions

These instructions apply throughout this repository. Read [the supplied management protocol](docs/repository-management-protocol.md) and [the setup status](docs/repository-management-setup.md) when managing repository settings or releases. The owner's current instructions take precedence. The automatic branching rule below forbids bypassing protections even where the supplied protocol discusses emergency exceptions.

## Automatic task workflow

For every requested build, fix, change, refactor, or feature:

1. Inspect the repository, relevant issues, existing pull requests, configuration, and working tree. Confirm the task, acceptance criteria, and correct current base branch. Treat `main` as production-ready unless repository evidence establishes another production branch.
2. Create a new task branch from the updated approved base. Never develop or commit directly on `main`. Use `feature/<description>`, `fix/<description>`, `bugfix/<description>`, `refactor/<description>`, `hotfix/<description>`, `docs/<description>`, `test/<description>`, or `chore/<description>`; include an existing issue number where available. Do not invent issue numbers or reuse old branches for unrelated tasks.
3. Make all requested changes on that branch. Preserve unrelated work, existing workflows, environments, configuration, and branches. Keep changes focused and do not choose a technology stack or change application source solely to satisfy management requirements.
4. Run the relevant available tests, build checks, linting, type checks, and other appropriate validation before proposing the change. Review the full diff for correctness, regressions, accidental files, and secrets.
5. Commit logical changes with clear messages, push only the task branch to GitHub, and open a pull request into the correct protected integration or production branch. Branch creation, commits, pushes, and pull request creation are authorized by default without separate permission requests.
6. Include what changed, why, the affected files, acceptance criteria or related task, testing performed and results, and database, security, configuration, and deployment impacts. Include UI evidence and rollback notes when relevant. Use the repository pull request template.
7. Use a draft pull request for unfinished, failing, or unverified work. If tests or CI fail, fix the issue on the same task branch, push a correction, and let CI run again. Report any blocker rather than claiming validation passed.

Continuing the same task, including review corrections and updates to its open pull request, stays on the same task branch. Each unrelated task gets a new branch.

## Validation and reviews

- Determine actual validation commands from project documentation and configuration. Clearly distinguish passed, failed, skipped, not applicable, and unavailable checks, and record the commands and results.
- Add or update meaningful tests for changed behavior and regressions when appropriate. Do not create placeholder checks that report success without exercising the code.
- Do not treat missing tests as passed tests. Documentation-only changes can use documented manual validation when application checks do not apply; required repository checks and reviews still apply.
- Review the latest proposed revision and its interaction with the current target branch. Resolve conflicts intentionally, then re-run relevant validation and obtain renewed review where required.
- A green CI result does not replace code review. Verify that required checks ran against the latest proposed commit.
- When application code is introduced, document dependency installation and validation commands, and add suitable CI for the chosen stack. Require only checks that actually exist and provide relevant validation.

## Merge authorization

Do not automatically merge any pull request. Merge only after the owner explicitly authorizes that merge and every applicable protection has passed.

Before an authorized merge, verify the correct target branch, acceptance criteria, latest-commit checks, required independent and CODEOWNER reviews, resolved blocking conversations, conflicts, and any required preview or staging results. Flag unavailable protection settings and do not describe `main` as protected until GitHub enforcement is verified.

Never bypass branch protection, required reviews, CI checks, or deployment protections. Never disable or weaken a protection to make a merge possible. Never force-push or delete `main`; do not force-push shared branches.

## High-risk and destructive changes

Authentication, authorization, database migrations, payments, infrastructure, CI/CD, permissions, secret handling, and production configuration are high-risk areas.

Clearly mark a high-risk pull request in its title and risk section. Describe its impact, required specialist or independent review, and rollback or recovery considerations. Follow repository reviewer requirements; the protocol recommends one independent reviewer for normal work and preferably two for high-risk changes. Do not invent reviewers or self-approve a change to satisfy independent-review requirements.

Stop before any destructive or difficult-to-reverse action and obtain explicit approval for that specific action. This includes destructive production data changes, history rewrites, and removal of important existing configuration.

## Secrets and production

Never commit secrets, passwords, API keys, `.env` files, tokens, private keys, service-account credentials, or production credentials. Never expose secret values in pull requests, issues, logs, or reports. `.gitignore` helps avoid accidental environment-file additions but is not secret scanning and does not protect already tracked files.

Use development or staging credentials for testing. Keep staging and production separate where applicable. A merge approval is not production deployment approval: require authorized release approval, successful applicable staging and QA, an identified release version, and a known rollback approach before production deployment.

Do not change production deployment behavior without explaining the impact first. Follow the protocol's migration, backup, smoke-test, rollback, and incident procedures when applicable, while preserving the owner's prohibition on bypassing protections.

## Repository enforcement and current state

Prefer GitHub rulesets, branch protection, required reviews, real CI checks, environment approvals, and appropriate CODEOWNERS over informal instructions. Apply supported safe controls within the authorized scope and report settings blocked by connection permissions, GitHub plan, organization policy, or missing project requirements.

At bootstrap, the repository has no application code, dependency configuration, tests, or CI workflow. Re-inspect this state for each task and use the setup status document to track gaps. These files do not themselves enable branch protection, production environments, or continuous monitoring.


## AI orchestration workflow

For substantial application features, fixes, refactors, integrations, security-sensitive work, and deployment-related changes, use the repository skills under `.agents/skills/`.

### Required sequence

1. Use `orchestrate-task` as the overall workflow.
2. Use `preflight` before implementation.
3. If preflight returns `ACTION_REQUIRED` or `BLOCKED`, stop implementation and report the required owner action or blocker.
4. When an external API, dataset, SDK, hosted service, or integration choice is involved, use `integration-research` before implementation.
5. Use `implementation` only after preflight is `READY`.
6. Use `code-review` as an independent pass after implementation.
7. Return valid review findings to implementation and repeat review/fix no more than three times.
8. Use `testing` after implementation and after required fixes. A required failing check blocks progression.
9. Use `security-review` when authentication, authorization, APIs, uploads, secrets, databases, webhooks, user data, or infrastructure security are affected.
10. Use `release-readiness` before opening/finalizing a PR or promoting a release.

### Role behavior

Use only the roles required for the task: requirements/preflight, integration research, frontend, backend, database, reviewer, tester, security, and devops/release.

If the installed Codex runtime provides independent task/subagent delegation, bounded independent work may be delegated. Do not allow concurrent writers to edit the same files.

If independent subagent delegation is unavailable, execute the roles as explicit separate passes in the same Codex workflow. A reviewer pass must remain independent in purpose and must report findings instead of silently rewriting the implementation.

### Supervised autonomy level

This repository uses Level-2 supervised autonomy:

- task branches, local implementation, review/fix iterations, testing, PR preparation, and eligible staging automation may proceed without per-step approval;
- do not merge pull requests automatically;
- do not create paid services, install system-wide software, change IAM/production permissions, or create production resources without owner action;
- production deployment always requires explicit owner approval;
- never request or expose secret values in source code, issues, pull requests, logs, or chat.

The detailed setup and current limitations are documented in [docs/ai-orchestration-setup.md](docs/ai-orchestration-setup.md).
