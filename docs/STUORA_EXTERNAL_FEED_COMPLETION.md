# External feed integration checkpoint

This is an isolated change on the Gen-3 product source. It does not merge
the Android 0.1.4 work, turn on a provider, or change any hosted environment.

## Behavior

Events and Jobs continue to use the existing authenticated `external-data`
function. An unavailable provider is not an empty search. Partial results keep
their source labels, failure has a retry action, and a failed community-listing
request no longer hides the external section. On a filter or account change,
cancel the previous request and discard its screen state. Reject malformed
responses and open only HTTPS destinations for the explicitly named providers.

## Staging checks on 18 November 2026

- `external-data` v14 is active with JWT verification. Staging startup logs
  included Ticketmaster in the configured providers; this does not prove a
  successful signed-in search or that a credential is valid upstream.
- The recorded hosted staging origin
  `https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app`
  received HTTP 403 `ORIGIN` on preflight. A native-style preflight without
  an Origin returned 204, and a request without a signed-in session returned
  401. Do not bypass the origin or JWT checks.
- Photo intake v11 has its write gate compiled off. Do not restore direct
  Storage writes to make photo upload appear available.

## What qualifies a live external feed

1. Reconcile this source with the exact Android 0.1.4 source and the web preview
   build. Verify the chosen web alias and build SHA before allowing its origin.
2. Use the staging project’s supported secret configuration to add only the
   authorized exact origin to `STUORA_ALLOWED_WEB_ORIGINS`, preserving other
   allowed entries. Verify 204 and the exact CORS header for the authorized
   origin, and continued denial for an unrelated origin.
3. Test a signed-in Ticketmaster search in a real city in web and Android.
   Confirm a provider result opens its official destination, normal no-results
   are distinct from failed provider calls, and anonymous calls stay denied.
4. Qualify the job source under its actual permitted use. Trips has no external
   provider in the current feed contract. Choose a permitted source before
   calling Trips external data operational. Community listings are separate
   from both of these external feeds.

To run the browser fixture for this slice, export the isolated test web build
with `EXPO_PUBLIC_STUORA_EXTERNAL_FEEDS=enabled` and run the new
`tests/web/external-feed.spec.ts` with that same flag. Fixtures are test-only
and are not evidence of live Ticketmaster inventory.
