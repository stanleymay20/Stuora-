# Listing media commercial-GA checkpoint

This slice builds on verified main `a25b6c5e8f4ad71ff661195649f4419299c23ec2` and the dedicated Stuora Supabase project `mljmifovcthvtuquvyzf` in `eu-central-1`.

## Scope

Housing and Marketplace remain the only student-publishable listing categories. This change adds real user-selected listing photos on top of the existing persisted listing, RLS and secure listing-messaging contracts. It does not add seeded imagery, base64 image records, fake partner content or a second media implementation.

Owners can attach up to six photos to an active Housing or Marketplace listing. The client accepts JPEG, PNG and WebP and rejects files over 5 MB before metadata is persisted. Objects use the owner/listing path shape `<auth.uid()>/<listing_id>/<generated filename>` in the public `listing-media` bucket. The database stores only `listing_media` metadata and the object path.

Public active listings render their first persisted image as the card cover and render persisted images on detail. Owners can remove their own photos. If metadata persistence fails after upload, the client attempts immediate object cleanup rather than leaving the listing linked to an uncommitted photo. Archived/private listing media follows listing visibility at the database metadata layer.

## Authorization boundary

The hosted Storage and database policies remain the authority. `listing_media` inserts require the authenticated user to own the listing and require the object path to match that user and listing. Storage object inserts independently verify the same owner/listing relationship and supported listing kinds. Cross-user listing-media writes are denied. The media foundation is migration-controlled and covered by the Postgres authorization harness.

The listing-messaging RPC remains a public `SECURITY INVOKER` wrapper around a private `SECURITY DEFINER` implementation; anonymous execution is denied. The hosted security advisor reported no findings after the privilege boundary was restored.

## Client implementation

`expo-image-picker` is pinned to the Expo SDK 57-compatible `~57.0.20` release and the npm lockfile was generated with Node 22.13. Expo dependency compatibility passed during dependency generation. Native configuration requests photo-library access only; camera and microphone permissions are disabled because this slice does not capture media.

Web uploads are initiated directly from the user action so the browser file chooser remains within the user-activation requirement. Native clients request media-library permission before opening the picker.

The database TypeScript contract is regenerated from the hosted schema. One semantic override is intentionally retained for `save_student_listing.p_id`: the generated routine type cannot express argument nullability, while the migration explicitly treats SQL `NULL` as the create-listing sentinel (`if p_id is null then ...`). The committed type therefore records `p_id: string | null` rather than hiding the contract with an `any` cast at the call site.

## Verification gate

This document does not declare the slice released. PR #13 must pass the unchanged Stuora CI gate on its exact current head before merge: dependency install, Expo compatibility, Postgres authorization tests, strict TypeScript, production web export, desktop/mobile-web browser contracts, and iOS/Android bundle exports. After merge, the resulting `main` commit must pass the same gate again before the slice becomes the controlled baseline.

Browser coverage includes a real web file chooser contract: publish a persisted Marketplace listing, choose a PNG, upload it through the Storage API contract, persist `listing_media`, render the public cover/detail image in a separate anonymous browser context, enforce owner-only removal controls, then remove the image.

## Remaining commercial-GA qualifications

Media support does not by itself make Stuora GA. Live email confirmation and account recovery, a genuine two-account cross-device create/discover/message flow, physical iOS and Android qualification, production/staging environment isolation, dependency vulnerability review, observability/alerts, abuse and moderation operations, legal/privacy release work, backup/restore qualification and the remaining product verticals still require controlled acceptance.

## 2026-10-22 metadata and public-link privacy hardening

**Source branch:** `feat/stuora-ai-business-foundation-20261018` / draft PR #23. Do not confuse this branch with the approved Vercel staging deployment or production.

### Read-only live staging evidence
- Dedicated staging project `uptjcspizukpjcoayhtn`: `listing-media` and `avatars` Storage buckets have `public=true`.
- `storage.objects` has no listing-media object rows and `public.listing_media` has zero rows at inspection time; no legacy staging photos require migration.
- Public bucket downloads bypass per-object RLS read authorization. A direct object URL may continue to work after the owning listing is closed even though listing_media metadata is no longer returned. Simply adjusting SELECT RLS cannot revoke public-bucket URLs. See Supabase Storage access model.
- Existing Storage INSERT policy checks path ownership and category but does not require sanitized image bytes. A compromised or modified client can upload raw EXIF/XMP and metadata through the direct Storage API.

### Client-side mitigation (not a trust boundary)
- `src/listings/mediaSanitizer.ts` validates actual JPEG / PNG / WebP magic bytes and chunk structure; removes JPEG APP/COM metadata, PNG text/EXIF/ICC/XMP ancillary chunks and WebP metadata chunks. It rejects unsupported formats, malformed images, animated images, oversized images and EXIF-orientation-dependent JPEGs that would rotate after stripping.
- `src/listings/ListingWorkspace.tsx` now uploads only sanitized new buffers, never the originally selected byte array. Users are clearly warned that listing photos are publicly retrievable by URL and can disclose information visibly present in the pixels.
- The operation does **not** blur faces, crop visible personal details, strip metadata from older files, guarantee content is decodable, or prevent bypass via a direct Storage API request. The client sanitizer is defense-in-depth only.
- The PNG/JPEG/WebP and real outgoing Storage request tests are under `tests/web/media-safety.spec.ts` and `tests/web/listings.spec.ts`.

### Mandatory server-side GA follow-up
1. Replace direct public-bucket upload with a **private, authenticated intake bucket** with strict owner and quota checks. Objects must not become public until a trusted server has decoded and **re-encoded pixels** with bounded dimensions/bytes, stripped metadata, scanned or moderated content, validated kind/ownership and stored an independently generated output name.
2. Only the server-side trusted process may write the public delivery bucket. Disable direct user uploads/upserts to that bucket. Evaluate whether all media should instead be private with authorized downloads/signed URLs; if so, redesign anonymous listing browsing and preview caching before switching.
3. Make lifecycle rules explicit: publishing, archive, report, removal, deletion, cancellation and failed uploads must revoke visibility and delete files consistently. A public CDN URL may remain cached and cannot be revoked immediately; do not promise instant revocation with the current architecture.
4. Add image-privacy acceptance: upload EXIF GPS/JPEG, XMP/PNG, WebP metadata, invalid masquerading payloads, oversized/decompression-bomb images and simultaneous quota attempts; download **final server-delivered bytes** to verify metadata absence. Exercise two independent authenticated staging students and a signed-out client.
5. Until these server-enforced checks pass, do not mark listing media privacy, account deletion or student onboarding as commercially GA-ready. Production and the approved preview hostname must remain unchanged.

