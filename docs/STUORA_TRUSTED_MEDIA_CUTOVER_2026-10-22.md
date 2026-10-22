# Stuora trusted listing-media processing — staged cutover plan (2026-10-22)

**Classification:** implementation candidate on draft PR #23 — **NOT DEPLOYED**, no staging or production Edge Function is active. No Storage bucket policy or public-facing preview alias has been changed by this work.

## Independent evidence

- Current `listing-media` and `avatars` buckets in dedicated staging `uptjcspizukpjcoayhtn` are **public**. `storage.objects` contained 0 listing-media objects, and `public.listing_media` contained 0 media rows at inspection.
- The browser/native Expo upload sends files directly to the public bucket. The previous client-side JPEG/PNG/WebP metadata stripper is tested but is not a trusted security boundary.
- Supabase documents two Storage access models: public object URLs bypass ordinary read restrictions, private objects require authorized access or time-bounded signed URLs. Supabase Edge Functions support WASM ImageMagick, **not native Sharp**.
- Source references:
  - https://supabase.com/docs/guides/storage/buckets/fundamentals
  - https://supabase.com/docs/guides/functions/examples/image-manipulation
  - https://supabase.com/docs/guides/functions/dependencies

## Phase 1 (in this PR): isolated trusted processing code, no remote invocation

- `supabase/functions/listing-photo-intake/index.ts`: server-only authenticated Deno endpoint (JWT required), owner authorization using verified Supabase Auth identity, actual listing ownership/kind/status rechecked in database, maximum 5 MB request/file, allow-list JPEG/PNG/WebP magic bytes, bounded dimensions, WASM pixel decode, auto-orient, downscale, PNG encode, PNG ancillary metadata stripping, unique server-generated object path, metadata insert and cleanup on error. Pinned image processor `@imagemagick/magick-wasm@0.0.44`. Server-only service role credentials **never** appear in the Expo bundle.
- `supabase/functions/listing-photo-intake/core.ts`: stateless, dependency-injected pure coordinator; tests cover cross-tenant denial, successful order of operations, six-photo limit, unsafe output rejection, storage failure, failed DB commit cleanup and owner deletion.
- A separate GitHub `trusted-media-edge` job checks the Deno runtime code with `deno check`; existing Expo, RLS, dependency and browser gates remain untouched.
- `supabase/migrations/20261022183000_listing_media_six_photo_guard.sql`: isolated concurrency-safe `listing_media` six-photo metadata cap. On migration approval and exact-head green CI this guard alone can be applied to staging, without activating the new Edge Function.

**Security limitation:** Deno `check` proves module typing and import resolution, NOT image decoder runtime safety, true PNG metadata cleanliness or Edge resource/CPU behavior. `core.ts` mocked tests prove the coordinator's contracts, NOT hosted authorization or real Storage behavior. The new Edge Function remains undeployed.

## Phase 2 — required hardening before deploying the Edge Function

1. **Request abuse limits:** server-side durable per-user and per-listing upload *attempt* quotas, including failed authentication/invalid image attempts and concurrency protections; global load/cost ceilings. The six-photo persisted media cap alone cannot prevent CPU-intensive denial of service.
2. **Real runtime tests:** use actual Supabase Edge Runtime in isolated staging to decode representative EXIF GPS JPEGs, orientation JPEGs, WebP with XMP/EXIF, PNG with tEXt/iTXt, alpha transparency, invalid CRC, bombs and high dimensions. Inspect returned decoded image and raw final object bytes: reject metadata and bad pixels. Verify WASM package & resource limits, and CPU usage. Add server-side authorization negative tests with two staging student JWTs.
3. **Consistent Storage cutover:** replace direct authenticated INSERT/UPDATE on public delivery `storage.objects` with *trusted service-only writes*; restrict direct INSERT/DELETE into `public.listing_media` to privileged backend (and maintain RLS SELECT). This requires migrating all existing Expo photo upload/remove paths to authenticated `listing-photo-intake` before applying the policy change. Do not apply on an older Vercel preview.
4. **Private input boundary:** this initial design receives raw files in authenticated Edge request memory and never persists unprocessed originals. If uploads must be decoupled for async processing, introduce a private intake bucket with owner-scoped upload restrictions and strict expiry; never expose intake objects publicly.
5. **Media lifecycle:** coordinate file and metadata deletion, archive and report handling, old public URL CDN caching, cleanup of processing failures, and account erasure. Public delivery URLs cannot be reliably revoked immediately; consider moving processed media into a private delivery bucket with short-lived signed URLs and explicit anonymous-discovery policy.
6. **Moderation:** content safety, image visible private details and location clues cannot be solved by EXIF stripping. Provide user disclosures, reports, takedown audit logs and moderation operations.

## Explicit non-goals and blocked release conditions

- No production or existing approved staging web deployment writes.
- No provider key values in repo, logs, console or chat.
- No activation of the Edge endpoint from the mobile/web UI yet; the active client still uses the original direct upload.
- No claim of GDPR/DSA compliance, instant CDN revocation, general availability or real-account acceptance.
- Before cutover: verify deployment exact SHA, all three CI jobs, stored object SHA/output format/metadata, owner restrictions, logged cleanup failures, public URL visibility, concurrency and rollback with two independent staging accounts. Confirm trusted Edge rate limit and phase 3 authorization migration in review.

## Additional source hardening — upload-attempt quota, still NOT deployed

- The media quota migration now acquires a transaction advisory lock and a parent listing `FOR SHARE` lock before rechecking ownership, type, status and three-segment path. This prevents concurrent parent archival/deletion from racing the metadata insert check; the six-photo limit remains enforced for service-role and client writes.
- The new `20261022190000_listing_photo_attempt_limits.sql` adds private, RLS-enabled counters and a service-role-only `public.consume_listing_photo_attempt(uuid,uuid)` RPC. A **separate, successfully committed** RPC records each authenticated POST *before multipart buffering/decoding*, so rejected images and failed downstream transactions still consume capacity.
- Conservative initial budgets: 10 per student/minute, 40 per student/hour, 20 per listing/hour and 60 per project/minute. Requests with missing/invalid listing query identifiers still count toward the authenticated student's quota. A valid client must send the listing ID both as the `?listingId=` query parameter (for early admission) and the matching multipart field; neither determines owner authorization.
- Default PostgreSQL function EXECUTE is explicitly revoked from `PUBLIC`, `anon`, `authenticated`. Only server-held `service_role` can call the exposed wrapper. The existing `private.consume_action()` is deliberately NOT reused for rejected upload counting because statement/transaction failures roll its increment back.
- Fresh-DB PGlite tests exercise privileged path bypass, sixth/seventh media records, private RPC grants, exhausted budgets, per-student isolation and persisted counters. The live Edge decoder, gateway/IP throttling, active-concurrency/cost ceilings, trusted proxy IP integrity and hosted two-account tests remain open release blockers. **Do not activate the Edge endpoint merely because CI is green.**

## Pre-decode dimensional guard + actual WASM codec CI (current PR follow-up)
- ImageMagick was previously invoked before its dimensional checks. The new `imagePreflight.ts` parses bounded JPEG/PNG/WebP headers to reject overlarge or animated images before WASM allocation. The retained post-decode dimension comparison still guards malicious header disagreement. Limits initially 8192 px maximum side and 16 million pixels; actual hosted resource capacity remains unqualified.
- The existing processing code moves without changing image output to `processor.ts` so it can be exercised without deploying an HTTP handler or exposing service keys. A separate Deno test validates actual PNG text/GPS stripping, EXIF JPEG auto-orientation, WebP conversion and invalid/animated input. This is not a hosted Edge performance test; CI green alone cannot activate the service.
- CI's separate `trusted-media-edge` job runs real codec tests after typecheck. Failed codec tests are release blockers; do not bypass or relax assertions to turn CI green.

**WASM startup discovery:** actual Deno codec CI caught a `NotFound` startup error from the original `new URL("magick.wasm", import.meta.resolve(package))` path. The pinned 0.0.44 package publishes the WASM only at exported `./magick.wasm` (mapped to `dist/x86/magick.wasm`) or `./x64/magick.wasm`; the previous flat `dist/magick.wasm` does not exist. The loader now uses the **package export subpath**, still pinned at 0.0.44. This must pass real decode tests before the Edge function is even considered for staging.

**Real-codec fixture correction:** initial Deno WASM run proved the loader fix succeeded, then rejected an inherited example 1×1 PNG because its IDAT stream has an invalid zlib checksum. The fixture now constructs a valid RGBA PNG with `CompressionStream('deflate')` and freshly computed PNG CRCs; negative tests still reject malformed files. Browser mocks using arbitrary bytes must not be used to claim actual decoder success.

**Compiler-boundary correction:** Expo’s broad `**/*.ts` include previously excluded only `supabase/functions/*/index.ts`, causing TypeScript to compile newly added Deno-only processor/test files and fail on the `npm:` imports and Deno globals. Expo now excludes `supabase/functions/**/*`, while the mandatory *independent* Deno `check index.ts` and real-WASM `deno test processor.test.ts` remain enabled. The browser test imports only `core.ts` (runtime-neutral); no test or check has been disabled.

## 2026-10-22 — Ambiguous Storage cleanup and global decoder admission
- If an upload result is uncertain (e.g. server wrote bytes, API timed out), `core.publishListingPhoto()` now attempts to delete its server-generated object path before returning. Failed cleanup escalates `CLEANUP_REQUIRED`, without falsely claiming no object exists. Browser coordinator tests cover both successful and failed cleanup.
- `20261022210000_listing_photo_processing_leases.sql` is a *proposed staging-only* database migration. It adds a private, RLS-enabled expiring processing lease table plus two service-role-only RPCs: acquire/release. A fixed PostgreSQL advisory lock serializes claims. Limit is one decoder/student and four total decoders/project; each lease expires after three minutes if Edge dies. Authorization tests cover public role denial, per-student exclusion, capacity exhaustion, invalid release ownership and refill.
- Dormant `listing-photo-intake` Edge handler now acquires a separate committed capacity lease before buffering and decoding, and releases in a `finally` block. Release failures are logged without student/request identifiers and recover through expiry. The existing attempt quota is still charged, even if capacity is full.
- **Do not enable/deploy** until exact-head CI passes and the new migration is applied/read back on the dedicated staging project; hosted CPU/memory, real two-student test, CDN/removal and Storage cutover are still pending. Production and current preview must remain untouched.

**Lease test correction after CI run #39794167750:** the test originally passed Student A's ID to the privileged release RPC while simulating Student B as the database session. The RPC is service-role-only and intentionally uses its explicit `p_student` argument, not `auth.uid()`; the earlier expectation of rejection was invalid. The corrected isolated DB test passes Student B's ID against A's request token, confirms A's lease remains held, confirms correct release and capacity refill, and verifies expired-lease reclamation. The original CI run failed the two database-dependent jobs; no migration was applied. A follow-up exact-head all-green CI is mandatory before any staging DDL.

## Disabled staging smoke-deployment gate (2026-10-22)
- `releaseGate.ts` adds an explicit, immutable `TRUSTED_MEDIA_WRITES_COMPILED_IN=false` source-level lock. Even if `STUORA_TRUSTED_MEDIA_ACTIVATION=STAGING_APPROVED` and the allowed origin is configured in hosted secrets, this build returns 503 `FEATURE_DISABLED` for all requests handled by the function. A separate Deno regression asserts the lock is false across permitted and forbidden environments.
- Entrypoint rejects any Supabase project URL except the dedicated staging ref `uptjcspizukpjcoayhtn`. It does **not** require the optional custom web-origin secret during disabled startup. To activate uploads **later**, a deliberately reviewed code change and explicit env activation are both necessary.
- Deploy disabled to staging only after all three exact-head CI jobs pass. Keep `verify_jwt=true`, no source/policy migration, no signed-in real-user upload. HTTP runtime smoke must verify JWT gateway deny for unsigned access and disabled 503 for authorized probe. Do not claim hosted positive upload, CDN revocation, media privacy, or GA from a disabled smoke.

## PNG end-to-end structural preflight follow-up — 2026-10-22
- Forensic gap: `imagePreflight.ts` stopped inspecting PNG at the first `IDAT`. This missed APNG `acTL/fcTL/fdAT` chunks appearing **after** IDAT, as well as incomplete IEND/trailing data. Patched to scan every PNG chunk through a sole final `IEND`; reject late animation chunks, duplicate IHDR, non-consecutive IDAT, incomplete endings and excessive chunk counts (10,000 cap). Retains 5 MB encoded-byte/dimension ceilings.
- Deno/WASM regression suite now includes real decoder failure tests for late APNG metadata, truncated/trailing IEND, invalid chunk sequence, adversarial many-chunk PNG, and legitimate metadata after image data which must be stripped on output. Full decoding is still mandatory; preflight is not a CRC/authenticity guarantee.
- The deployed staging Edge v1 remains disabled on older source until exact successor CI is green and a disabled-only redeployment is verified. Production/current client remain unchanged.
