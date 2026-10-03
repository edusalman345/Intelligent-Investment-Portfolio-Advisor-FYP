# Repository working rules

These instructions apply to the whole repository. Follow the owner's current task instructions and any more specific instructions in subdirectories.

## Start each task

- Read the README, existing code, relevant issues, and current pull requests before deciding how to implement a change.
- Identify the task's expected behavior and acceptance criteria. Ask for missing requirements that materially affect the implementation; do not invent a technology stack or product requirements.
- Keep changes focused. Use issues to track agreed work and blockers; do not invent priorities or close issues before their acceptance criteria are satisfied.

## Branches and pull requests

- Keep `main` as the stable integration branch.
- Start each independent change from the latest `main` in a short-lived branch, for example `feat/<description>`, `fix/<description>`, or `chore/<description>`.
- Use the change's branch for development and testing. Introduce a shared integration or staging branch only if the project's release workflow needs one.
- Open a draft pull request for unfinished work. Include the problem, resulting behavior, validation evidence, and any material limitations.
- Do not push changes directly to `main`, force-push shared branches, or bypass repository protections.
- Preserve unrelated changes and existing files.

## Testing and review

- Determine the project's actual test, build, and lint commands from its configuration and documentation.
- Run checks appropriate to the change. For code changes, add or update meaningful tests for changed behavior and regressions where applicable.
- Review the complete diff for correctness, compatibility, unintended changes, and exposed credentials.
- Record the commands run and their results in the pull request. Clearly distinguish passed, failed, skipped, and unavailable checks.
- A green check alone is not sufficient: verify that relevant tests actually ran and exercised the changed behavior.
- When introducing the first application code, document how to install dependencies and run checks, and add an appropriate GitHub Actions workflow. Avoid workflows that report success without validating code.

## Merge decisions

A pull request is ready to recommend for merging only when:

1. Its agreed acceptance criteria are met and its scope is understood.
2. Relevant tests and all repository-required checks pass on the latest proposed revision.
3. Required reviews are satisfied and blocking review findings are resolved.
4. It has no merge conflicts and is validated against the current target branch; update and re-test when intervening changes affect the result.
5. Its description accurately records validation and any remaining limitations.

Keep incomplete, failing, or unverified application changes in their branch. Missing application tests are a validation gap, not a passing result. Documentation-only changes can use an explicit manual review when application checks do not apply.

Request the owner's approval before merging into `main` unless the owner explicitly delegates merges under a defined policy. Such delegation must specify eligible changes and required checks. Follow any stricter repository rules and do not bypass required reviews.

## Current bootstrap state

The repository currently contains a project-title README and no application code, dependency configuration, test suite, or CI workflow. No application test command has been established. Reassess this state when code is added.

These instructions and the pull request checklist guide the workflow; they do not enable GitHub branch protection or continuous monitoring. Configure required checks and branch protection separately when applicable.
