# Contributing to Stuora

Stuora accepts work from human engineers and AI-assisted engineers under identical review and release standards. Start with [ENGINEERING_STANDARDS.md](ENGINEERING_STANDARDS.md), [ARCHITECTURE.md](ARCHITECTURE.md) and [RELEASE_CHECKLIST.md](RELEASE_CHECKLIST.md).

## Before coding
1. Link an issue describing the problem, boundaries, success criteria and out-of-scope work. Confirm the **correct base branch** with the maintainer; main and draft integration branches may differ significantly.
2. Read affected code, schema, RLS policies, tests, release history and relevant ADRs. Reuse existing modules; do not scaffold another app.
3. Propose an architecture/security decision before expanding dependencies, data collection, external APIs, privileged functions, core contracts or vendor spending.
4. Check for overlapping open PRs and coordinate before editing shared files.

## Branch and PR workflow
- Create a named, scoped branch from the agreed base, such as **feat/mobile-auth-callback** or **fix/group-access-revocation**.
- Never push directly to main or rewrite another contributor's branch without explicit approval.
- Prefer one coherent unit of work with an issue-linked draft PR early; keep changes small enough to review.
- Stacked PRs are permitted only when dependency and merge order are stated. Rebase or retarget with maintainer coordination once the upstream PR is accepted.
- The PR template requires tests, security/data changes, deployment impact, evidence and rollback. Do not self-approve privileged changes.
- Code owners are requested through [.github/CODEOWNERS](.github/CODEOWNERS); GitHub branch rules must separately enforce required reviews and checks.

## Local setup
Use Node.js 22.13+ and the committed lockfile. Do not upgrade Expo/React Native or override dependency advisories to make unrelated work pass.

    npm ci
    npm run check:environment
    npm run typecheck
    npm run test:database
    npm run test:web

Configure an explicit safe development/test backend as documented in [docs/ENVIRONMENT_ISOLATION.md](docs/ENVIRONMENT_ISOLATION.md). Some tests require browser installation, a local service, or a specific branch's additional tooling. Read the branch's package scripts and CI workflow as the authority. A bundle export does not qualify a native device.

## Test expectations
- **UI:** viewports, keyboard and screen-reader semantics, loading/errors/empty states and navigation.
- **Auth and data:** owner/peer/anonymous denial, role changes, logout/session recovery and persistence across independent accounts.
- **Backend:** input validation, quotas, timeouts, transactional invariants, RLS/grants, cross-user access and migration compatibility.
- **Native:** iPhone and Android permission, deep-link, camera/media and session-resume tests on physical devices before mobile release.
- **Regression:** reproduce the bug before fixing it when feasible; add a targeted automated test preventing recurrence.

## Working with AI agents
AI output must be scoped to the issue, read the existing repository, and leave an auditable diff. No blind project-wide rewrite, fake fixture claims, disabled tests, speculative dependencies or production secrets in prompts. Review generated code for security, privacy, maintainability, licenses, data handling and real test evidence. The human PR author remains accountable.

## Explicitly controlled operations
Production deploys, schema writes, API secrets, billing, moderation role grants, provider activation and authenticated hosted test writes need separate permission. Run live acceptance with approved dedicated staging accounts using secure local credentials; never paste passwords into GitHub or chat.

## Mobile collaboration
Mobile work should reuse the shared Expo codebase and existing backend/Auth/RLS contracts. A developer may begin from an approved integration branch but should submit a separate draft PR with clear dependencies. iPhone testing is not Android testing; use Android emulation during development and a real Android device before release. The maintainer assigns review ownership after agreeing the module boundaries.

## Documentation
Update relevant architecture and decision records when contracts or trust boundaries change. Record exact SHA, CI URL, staging deployment identity, tests actually executed, accepted exceptions, risks and unfinished work—not unverified readiness adjectives.
