# Stuora commercial GA execution sequence

Stuora does not reach GA by turning on every category at once. Each visible capability must have a real backend, permission boundary, failure state, automated tests, and hosted acceptance before release.

1. Secure listing messaging — this PR.
2. Storage-backed profile and listing media.
3. Real two-account hosted acceptance for sign-up, profile, create, discover, message, edit, archive, reload.
4. Trips with atomic capacity-safe join/leave.
5. Jobs with employer/partner-controlled publishing and student applications.
6. Safety: block/report/moderation operations and abuse-rate controls.
7. Events persistence and participation.
8. Verified Student Savings partner workflow and redemption accounting.
9. Environment isolation, observability, release/rollback runbook, and incident readiness.
10. Physical iOS/Android qualification and final commercial GA review.

No step may weaken RLS, CI, or release gates to make the roadmap appear complete.
