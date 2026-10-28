# ADR 0001 — Engineering governance and release boundaries

**Date:** 2026-10-28  
**Status:** Proposed (becomes Accepted on governance PR merge)  
**Owner:** Repository maintainer

## Context
Stuora has an Expo cross-platform repository, Supabase authorization boundaries, a GitHub CI workflow and a documented commercial release gate. Work is also occurring in multiple unmerged feature/integration branches. Human and AI contributors need a common policy that prevents duplicated systems, ambiguous acceptance and unreviewed deployment.

## Decision
Adopt the project-level engineering standards, architecture map, contribution guide, CODEOWNERS, PR template and release checklist. Use small issue-linked pull requests with explicit base branches, exact-head CI, independent review for risky changes, separate staging acceptance and a production approval barrier. Treat all coding-agent output as untrusted until reviewed and tested. Keep the current commercial GA release gate authoritative.

Owner review is requested for all paths initially; no mobile or platform-specific ownership is implied until explicitly assigned. CODEOWNERS alone does **not** activate branch-protection enforcement. The maintainer must configure appropriate required reviews and status checks in GitHub settings.

## Alternatives considered
- **Continue relying on chat handoffs and scattered checkpoints:** low immediate work, but stale status and inconsistent instructions persist.
- **Merge the active feature PRs first:** makes governance dependent on unresolved product/security scope.
- **Re-architect or replace Stuora:** adds needless risk, duplicates working code and delays acceptance.

## Consequences
- Documentation-only initial adoption; no runtime feature switches, services, schema or production environment changed.
- Contributors have a consistent source for issues, review, security and release acceptance.
- A maintainer must still configure repository rulesets, define delegation to mobile contributors and check PR/CODEOWNERS behaviour.
- New architectural decisions and meaningful exceptions require ADRs with explicit review.

## References
- [Engineering standards](../../ENGINEERING_STANDARDS.md)
- [Architecture](../../ARCHITECTURE.md)
- [Contributing](../../CONTRIBUTING.md)
- [Release checklist](../../RELEASE_CHECKLIST.md)
- [Existing release gate](../GA_RELEASE_GATE.md)
