---
name: integration-research
description: Evaluate external APIs, SDKs, datasets, services, and integration approaches required by an FYP feature. Use when preflight identifies a third-party dependency or multiple integration choices.
---

# Integration research

Use repository requirements as the source of truth.

For each candidate integration assess:
- required functionality
- compatibility with the current stack
- authentication method
- data availability/quality
- rate limits or quotas if known
- cost/free-tier implications if known
- security/privacy impact
- implementation complexity
- vendor lock-in
- testing approach
- fallback option

Prefer the smallest dependency that satisfies the requirement.

Do not activate paid resources, create accounts, or request secrets without owner action.

Return:
1. requirement
2. options considered
3. recommended option and why
4. setup required from owner
5. environment variable names/configuration required
6. implementation notes
7. risks/limitations
