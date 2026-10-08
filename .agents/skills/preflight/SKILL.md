---
name: preflight
description: Check whether an FYP task has all required software, dependencies, APIs, datasets, configuration, credentials, database resources, and infrastructure before coding begins. Use before substantial implementation.
---

# Preflight

Inspect the requested feature and the repository before implementation.

## Check

### Requirements
- PRD/TRD or other source-of-truth requirements exist
- acceptance criteria are clear enough to implement
- required UI/API/database behavior is defined

### Local software
Check only what the project actually needs, for example:
- Git
- project runtime such as Node.js or Python
- package manager
- Docker when container workflows require it
- database client/server when required
- AWS CLI only when an AWS operation requires it

Do not require tools merely because they are commonly used.

### Project dependencies
- dependency manifests exist when needed
- required packages are present or can be added
- runtime/package versions are compatible
- build/test commands can be identified from project files

### External APIs and services
Identify required:
- OAuth providers
- market/finance data providers
- email services
- storage services
- model/AI services
- webhooks
- other third-party integrations

For each external dependency, say why it is needed and whether a free/paid account or manual setup is required.

### Data
Identify:
- datasets
- seed/sample data
- test fixtures
- licenses/usage restrictions relevant to the project

Never fabricate a dataset or claim access that is not present.

### Configuration and secrets
Check whether required variable NAMES/config entries exist. Never display secret values.

Examples:
- database URL
- OAuth client ID/secret
- API keys
- signing secrets
- cloud resource identifiers

Never ask the owner to paste secrets into source code, chat logs, issues, or commits.

### Database/infrastructure
Check only when applicable:
- database availability
- migrations/schema dependencies
- storage/buckets
- queues
- cloud services
- staging environment requirements

## Owner approval boundaries
Do not silently:
- install system-wide software
- create paid services
- create production cloud resources
- change IAM/permissions
- create production credentials

Safe project-level dependency installation may proceed only when AGENTS.md and the task allow it.

## Output

Return exactly one top-level status:

### READY
All blocking requirements are available.

### ACTION_REQUIRED
The owner must provide/configure something before implementation.

For every action include:
- requirement
- reason
- owner action
- whether it is sensitive
- whether it may cost money
- whether work can continue without it

### BLOCKED
The requested implementation cannot currently proceed safely or technically.

Explain the blocker and safe alternatives, without inventing credentials or requirements.
