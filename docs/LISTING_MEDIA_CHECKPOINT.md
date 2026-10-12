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

## Verification gate

This document does not declare the slice released. PR #13 must pass the unchanged Stuora CI gate on its exact current head before merge: dependency install, Expo compatibility, Postgres authorization tests, strict TypeScript, production web export, desktop/mobile-web browser contracts, and iOS/Android bundle exports. After merge, the resulting `main` commit must pass the same gate again before the slice becomes the controlled baseline.

Browser coverage includes a real web file chooser contract: publish a persisted Marketplace listing, choose a PNG, upload it through the Storage API contract, persist `listing_media`, render the public cover/detail image in a separate anonymous browser context, enforce owner-only removal controls, then remove the image.

## Remaining commercial-GA qualifications

Media support does not by itself make Stuora GA. Live email confirmation and account recovery, a genuine two-account cross-device create/discover/message flow, physical iOS and Android qualification, production/staging environment isolation, dependency vulnerability review, observability/alerts, abuse and moderation operations, legal/privacy release work, backup/restore qualification and the remaining product verticals still require controlled acceptance.
