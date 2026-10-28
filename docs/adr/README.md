# Architecture Decision Records (ADRs)

Use short records for decisions that affect module boundaries, data contracts, authentication, privacy, vendor choice, AI providers, dependency upgrades, data residency, security controls, releases or operational cost.

## Format
- **Title, date, status:** Proposed / Accepted / Superseded / Rejected.
- **Context:** observed problem, constraints and evidence.
- **Decision:** precise choice and ownership.
- **Alternatives:** viable choices and why rejected.
- **Consequences:** benefits, tradeoffs, migration, security, rollback and follow-ups.
- **References:** issue, PR, source document, test and deployment evidence.

Add sequential files in the form **0002-short-title.md**. Never rewrite the history of an accepted decision silently; supersede it with a new ADR. A proposed ADR is not an authorization to modify production.

Existing documents retain their specific authority: [GA release gate](../GA_RELEASE_GATE.md), [environment isolation](../ENVIRONMENT_ISOLATION.md) and [student-first economics](../STUDENT_FIRST_ECONOMICS.md).
