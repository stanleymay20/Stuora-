# Stuora engineering and release checklist

This file is a **review worksheet**, not proof that any box is complete. Full commercial release requirements remain in [docs/GA_RELEASE_GATE.md](docs/GA_RELEASE_GATE.md). A docs-only PR may mark non-applicable test rows N/A with an explanation; a security-impacting change may not.

## Change identity
- [ ] Issue/PR, scope, owner and acceptance criteria recorded
- [ ] Base branch, exact head SHA and dependency PRs recorded
- [ ] Risks, data impact and rollout/rollback plan documented
- [ ] Code owner and independent reviewer(s) identified

## Source and CI
- [ ] Diff is scoped; no duplicate services or unintended refactors
- [ ] Lockfile and dependency review completed if changed
- [ ] Strict TypeScript, Expo compatibility and relevant build/export checks pass
- [ ] Database authorization and negative tests pass if data permissions change
- [ ] Browser and native regression checks appropriate to scope pass
- [ ] Secret scan and dependency security policy pass, or findings receive explicit authorized triage
- [ ] Required GitHub CI checks pass on the **exact proposed SHA**; report run URL

## Privacy and security
- [ ] Auth, consent, authorization, ownership and RLS boundaries checked
- [ ] Server-side rate limits and input validation verified as applicable
- [ ] No service-role secret, personal data, API key or credential in client bundle, repository, logs or test artifacts
- [ ] Storage/media access, revocation and privacy implications assessed where relevant
- [ ] AI/provider calls, data residency, legal attribution, licensing and costs approved before enablement

## Staging validation
- [ ] Correct staging project, schema version and exact preview origin confirmed
- [ ] Deployment SHA matches reviewed commit; no accidental production access
- [ ] Two-account unmocked paths pass when permissions/cross-user features change
- [ ] Failure, retries, role denial, persistence, cleanup and rollback exercised as relevant
- [ ] Actual SMTP callback and recovery verified when Auth changes
- [ ] Physical iPhone and Android flows verified for mobile release

## Operational readiness
- [ ] Feature switches and gradual rollout/kill switch documented
- [ ] Error monitoring/alerts, incident contact and rollback procedure verified
- [ ] Backups/restore, data retention, account deletion and support paths verified as applicable
- [ ] Legal/privacy/safety and moderation operations reviewed before external onboarding
- [ ] Production-specific authorization granted; release decision and remaining caveats recorded

## Release decision
**Decision:** HOLD / INTERNAL ALPHA / CONTROLLED BETA / RELEASE APPROVED

**Evidence:** issue/PR, SHA, CI URL, staging URL, test run IDs, reviewer and date.

**Blockers and owner:** list each missing or failing gate. A failed or untested mandatory gate means **HOLD**; do not lower requirements to make a demo or release appear complete. Distinguish documentation adoption from enabling any runtime feature.
