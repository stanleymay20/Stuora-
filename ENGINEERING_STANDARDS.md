# Stuora engineering standards

**Status:** Proposed for adoption through peer review. **Scope:** all Stuora contributors, including AI coding agents, working on web, native apps, database, Edge Functions, integrations and operations.

## Product invariants
- **Student first.** Ordinary student participation remains free wherever practical. The detailed economic policy is in [docs/STUDENT_FIRST_ECONOMICS.md](docs/STUDENT_FIRST_ECONOMICS.md).
- **Real data, truthful claims.** Never represent generated students, listings, jobs, discounts, partners, testimonials, activity or capabilities as real. Label demonstration data and disabled capabilities.
- **Privacy, consent and safety by default.** Sensitive access requires explicit authorization and server enforcement. Abuse prevention and account recovery are product functionality, not optional polish.
- **No silent production changes.** Production migrations, feature activation, secrets, payment processing and deployment require explicit, separately scoped approval.
- **Evidence over assertions.** Code merged, tests green, staging deployed, real-user acceptance passed and commercial launch approved are distinct milestones.

## Engineering principles and practical rules
1. **Single responsibility and separation of concerns (SOLID).** Keep UI, domain behaviour, backend adapters and privileged operations independently understandable. Prefer interface boundaries to direct dependencies on implementation details.
2. **DRY without speculative abstraction.** Put shared validation, authorization and business rules in one appropriate owner; do not build a reusable framework for a single use case.
3. **KISS and YAGNI.** Implement the smallest reliable capability meeting an approved requirement. Defer unproven revenue, AI and marketplace features behind explicit gates.
4. **Database and server authority.** Clients are untrusted. Enforce ownership, tenancy, quotas, grants and RLS in Postgres and service boundaries, including negative tests.
5. **Least privilege and defense in depth.** Never ship service-role secrets, personal data, raw private records or privileged write capability in a client bundle. Reject unsafe or malformed inputs and fail closed.
6. **Platform consistency with necessary platform differences.** Share domain contracts across Expo web/iOS/Android; validate native auth, permissions, deep links and device behaviour separately.
7. **Small reviewable changes.** One issue/scope per PR wherever practical. Trace implementation to acceptance criteria and make migrations forward-only and independently reviewable.
8. **Test behaviour and failure.** Tests cover authorized and unauthorized roles, empty states, retries, bad network input, concurrency where relevant, persistence, rollback and regression risks.
9. **Reproducible delivery.** Lockfile install, exact-commit CI, environment validation, reviewed deployment and documented rollback are mandatory. A prior green commit never proves a successor.
10. **Observability and recoverability.** Record structured non-sensitive errors, investigate failures, bound costs, prove backups/restore where available and maintain incident responsibilities.
11. **Accessibility and performance.** Include keyboard/assistive access, usable contrast/touch targets, loading/error feedback and bounded reads; verify web and native on appropriate devices.
12. **Human accountability for AI-generated code.** The contributor owns correctness, licenses, threat assessment, tests and rollback regardless of whether ChatGPT, Claude or another agent wrote code.

## Security and data boundaries
- Development and test must not fall back to production. Staging and production have distinct backend configurations and allow-listed origins; see [docs/ENVIRONMENT_ISOLATION.md](docs/ENVIRONMENT_ISOLATION.md).
- Deny unauthorized data access at the server boundary, not only by hiding UI controls; every RLS change requires tests for anonymous, owner, peer and elevated roles.
- Never commit credentials, API keys, student personal data, access tokens or real test account passwords. Use permitted secret stores and temporary local environment variables.
- External services and LLM output are untrusted. Bound input, time, cost and output; validate provider rights/licensing and privacy before enabling a feature.
- No real-person or payment fixtures in general CI. Write-capable hosted acceptance requires separately approved dedicated staging accounts and cleanup.

## Evidence hierarchy
Document each milestone distinctly:
1. **Specified:** requirements and acceptance criteria approved.
2. **Implemented:** code and tests submitted in a reviewable branch.
3. **Verified in CI:** required jobs passed for the **exact head SHA**.
4. **Validated in staging:** correct deployment SHA, backend identity and real authorization flows evidenced.
5. **Accepted on devices:** physical iOS and Android flows evidenced where applicable.
6. **Released:** operational, privacy, safety and rollback gates approved.
Avoid phrases such as "fully functional", "100%" or "GA ready" unless the applicable evidence exists.

## Completion and exceptions
A feature is done only when its acceptance criteria are met, code is reviewed, security impact evaluated, appropriate tests pass, docs and operations are updated, and staging/device acceptance is complete for the feature's risk. Mergeable is not equivalent to releasable. See [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md) and [docs/GA_RELEASE_GATE.md](docs/GA_RELEASE_GATE.md).

Exceptions require an issue/ADR with scope, rationale, risk, owner, expiry/remediation plan and explicit approval. No exception may quietly disable an essential security or production gate.
