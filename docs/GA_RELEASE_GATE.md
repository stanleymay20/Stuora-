# Stuora commercial GA release gate

Commercial GA stays OFF until every mandatory gate below is evidenced. A green build alone is not a release declaration.

## Automated code gates

- exact-head dependency install succeeds from the committed lockfile
- Expo dependency compatibility passes
- Postgres authorization tests pass without weakening grants or RLS
- strict TypeScript passes
- production web export passes
- desktop and mobile-web browser contracts pass
- iOS and Android bundle exports pass
- no unsupported category is presented as working
- Housing and Marketplace use persisted records and Storage-backed media only
- listing messaging remains listing-bound and authorization-controlled

## Live acceptance gates

- production web signup sends a real confirmation email and the callback signs the user in
- password reset email is delivered and the recovery callback permits exactly one user-controlled password change
- Account A creates a profile and listing with a real image; Account B discovers it and messages A; state survives reload and appears cross-client
- Auth redirect allow-list includes the production web origin and the native Stuora callback scheme
- custom SMTP is configured for production Auth email; default/best-effort SMTP is not the commercial dependency
- physical iPhone and Android flows are qualified for signup/session restore, recovery deep links, image access, listing create/discovery and messaging

## Security and operations gates

- Supabase security advisor has no unresolved release-blocking finding
- dependency audit findings are triaged by package/path/reachability; no unaccepted high-risk production vulnerability remains
- preview/development cannot silently write to the production backend
- block/report and moderation operations are enforceable for user-to-user contact
- production error monitoring and release rollback procedure are proven
- database backup/restore or platform recovery procedure is documented and tested to the available plan capability
- required privacy, terms, marketplace safety, data-retention and support/contact materials are approved for launch jurisdiction

## Release rule

If a mandatory gate is unproven, Stuora remains controlled beta/pre-GA. The correct response is to keep the GA flag off, hide or disable the incomplete surface, and finish the evidence rather than lowering the gate.
