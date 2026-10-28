# Stuora architecture and trust boundaries

**Purpose:** high-level engineering map. This is a description of the repository direction, **not a claim that every planned capability has shipped**. Inspect the target branch and latest tests before implementation.

## Product and technology
Stuora is one Expo / React Native / React Native Web application, written in TypeScript, targeting web, iOS and Android. Supabase provides authentication, Postgres, Row Level Security and Storage; Edge Functions host privileged integrations and safe media processing. Vercel serves web previews. All release claims are controlled by [docs/GA_RELEASE_GATE.md](docs/GA_RELEASE_GATE.md).

## Logical layers

    Web / iOS / Android presentation
                 |
         Application & domain rules
                 |
        Narrow backend client interfaces
           /                  \
    Supabase Auth/Postgres   Approved Edge services
       RLS / Storage         AI intent / media / feeds
           \                  /
              Audited server data
                 |
       External providers (untrusted)

These are *target separation-of-concerns boundaries*. The repository has not yet proven perfect layer isolation. Do not introduce a duplicate parallel application or rewrite everything to fit a diagram.

## Repository map
- **App.tsx, src/Root.tsx:** composition and top-level navigation.
- **src/account, src/people:** authentication, identity and profile experience.
- **src/listings, src/messages, src/groups, src/community:** student workflows; read the branch's actual source before altering contracts.
- **src/ai:** Stuora Bot client and AI-related presentation/adapters; never assume model inference or any specific provider is active.
- **src/backend:** client configuration and backend integration.
- **src/moderation, src/legal:** safety and legal presentation where present on the active implementation branch.
- **src/ui, src/hooks:** shared presentation primitives and hooks.
- **supabase/migrations, supabase/functions:** authoritative schema/security changes and server-side operations.
- **tests, security, scripts, .github/workflows:** regression, authorization, secret scanning and CI gates.
Some directories or services listed above exist only on unmerged feature branches. Do not infer that production includes them.

## Contract ownership
- The database owns persistent records, relationships, authorization constraints and transaction safety.
- RPCs/Edge Functions own privileged workflows, service-side validation, rate limits and external secrets.
- Client code owns rendering, accessibility, navigation, local pending state and user feedback—not permission decisions.
- Shared domain rules should have one testable definition; avoid independent web/native implementations with conflicting validation.
- Schema changes require forward-only migrations, review of existing data, GRANT/RLS impact, negative tests and a safe deployment sequence.
- API changes require explicit types, failure semantics, timeouts, version/migration compatibility and tests.

## Critical user journeys
Maintain tests for: registration and recovery; profile consent and privacy; create/discover/update/close listings; cross-account messaging; group membership and revoked access; reporting and moderation; media intake and private-object controls; optional external data and AI fallback. Every flow must address loading, empty, denied, rate-limited, failed and recovered states.

## Environment and release topology
- **Local/test:** explicit isolated backend or intercepted test fixtures, no production fallback.
- **Staging:** separate backend and exact approved web origin; test identities must be dedicated, consented and disposable.
- **Production:** only reviewed releases with environment identity, auth callbacks, monitoring and rollback verified.
Never equate a successful bundle export or READY web deployment with real cross-user acceptance or physical-device testing.

## Change rules
For a feature: identify existing boundaries; document changed contracts; design denial cases; implement minimum code; run tests; obtain exact-SHA CI; stage safely; record results. If changing authentication, RLS, Storage, media, personal data, billing, AI providers or deployment, require explicit security review and a relevant ADR.

## Architecture evolution
Store decisions in [docs/adr](docs/adr/README.md). Reconcile this map with each major architecture change rather than updating isolated handoff notes. Existing implementation PRs #23 and #27 are **draft/unmerged** as of 2026-10-28; refer to their live GitHub state, not dated handoffs, before selecting a feature branch.
