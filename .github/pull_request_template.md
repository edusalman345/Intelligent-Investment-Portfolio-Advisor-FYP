## What changed and why

Describe the problem, resulting behavior, and reason for the change.

## Related task and acceptance criteria

Link the issue or requirement and list the acceptance criteria. Use a closing keyword only when merging fully resolves the issue.

## Affected files

List the affected files or components and the purpose of their changes.

## Validation

Record actual commands or manual checks, results, and the commit tested. For each applicable area, state passed, failed, skipped, unavailable, or not applicable with an explanation.

- Tests:
- Build:
- Lint / formatting / type checks:
- Security / dependency checks:
- Manual or UI verification:
- Preview / staging:
- Missing checks or remaining failures:

For documentation-only work, explain manual validation and why application checks do not apply. Do not mark absent tests as passed.

## Risk and impacts

Risk level: Normal / HIGH RISK. Put HIGH RISK in the PR title for authentication, authorization, migrations, payments, infrastructure, CI/CD, permissions, secret handling, or production configuration.

- Database changes or migrations:
- Security and permission impact:
- Configuration or dependency changes:
- Deployment impact:
- Required independent or specialist review:

Explicitly state "None" where applicable.

## UI evidence

Include screenshots or recordings for relevant UI changes, or state not applicable.

## Deployment and rollback

Describe deployment requirements, staging or QA evidence, and how to reverse the change. Identify backup or migration recovery requirements when relevant. Merge approval does not authorize a production deployment.

## Readiness checklist

- [ ] Correct base and target branch; changes remain on the task branch.
- [ ] Acceptance criteria are satisfied.
- [ ] Full diff reviewed; no unrelated files, debug code, secrets, credentials, or environment files.
- [ ] Appropriate tests and documentation added or updated.
- [ ] Relevant validation and required CI checks pass on the latest revision.
- [ ] Required independent and CODEOWNER reviews are satisfied; blocking conversations are resolved.
- [ ] Changes validated against the current target branch; conflicts resolved and re-tested.
- [ ] Database, security, configuration, and deployment impacts reviewed.
- [ ] Required preview, staging, and QA verification complete where applicable.
- [ ] Owner explicitly authorized this merge; repository protections are satisfied.

Keep incomplete or failing work in draft. Fix validation failures on the same task branch. Do not bypass protections.
