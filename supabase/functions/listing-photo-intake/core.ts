/**
 * Server-only domain logic for Stuora listing photo publishing.
 * Independent of HTTP and SDK clients so that security/cleanup paths can be
 * exercised with fakes before a Supabase Edge runtime is enabled.
 * No service keys are accepted or used here.
 */
export const PHOTO_LIMIT = 6;
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;
export const MAX_OUTPUT_BYTES = 5 * 1024 * 1024;
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class MediaRejection extends Error {
  constructor(public readonly code: string, public readonly status: number, message: string) { super(message); }
}
export type ListingAccess = { id: string; owner_id: string; kind: string; status: string };
export type MediaRecord = { id: string; listing_id: string; object_path: string; sort_order: number; created_at: string };
export type TranscodedImage = { data: Uint8Array; mime: 'image/png' };
export interface TrustedMediaDeps {
  getListing(id: string): Promise<ListingAccess | null>;
  getPhotos(id: string): Promise<MediaRecord[]>;
  transcode(raw: Uint8Array): Promise<TranscodedImage>;
  storeSanitized(path: string, data: Uint8Array, mime: string): Promise<void>;
  persistMedia(listingId: string, path: string, sortOrder: number): Promise<MediaRecord>;
  removeObject(path: string): Promise<void>;
  removeMetadata(photoId: string, listingId: string): Promise<boolean>;
}
export const validUuid = (value: unknown): value is string => typeof value === 'string' && uuid.test(value);
function requireListing(listing: ListingAccess | null, studentId: string) {
  if (!listing || listing.owner_id !== studentId || !['housing', 'marketplace'].includes(listing.kind))
    throw new MediaRejection('FORBIDDEN', 403, 'Listing is unavailable');
}
export async function publishListingPhoto(
  deps: TrustedMediaDeps, studentId: string, listingId: string, raw: Uint8Array, newId: () => string,
): Promise<MediaRecord> {
  if (!validUuid(studentId) || !validUuid(listingId))
    throw new MediaRejection('INVALID_ID', 400, 'Invalid listing identity');
  if (!raw.length || raw.length > MAX_INPUT_BYTES)
    throw new MediaRejection('SIZE_LIMIT', 413, 'Photo exceeds the 5 MB upload limit');
  const listing = await deps.getListing(listingId);
  requireListing(listing, studentId);
  if (listing!.status !== 'active')
    throw new MediaRejection('NOT_ACTIVE', 409, 'Only active listings accept photos');
  const existing = await deps.getPhotos(listingId);
  if (existing.length >= PHOTO_LIMIT)
    throw new MediaRejection('PHOTO_LIMIT', 409, 'Listing already has six photos');
  // This JPEG/PNG/WebP decoding+re-encoding happens only on the trusted server.
  const result = await deps.transcode(raw);
  if (result.mime !== 'image/png' || !result.data.length || result.data.length > MAX_OUTPUT_BYTES
      || ![137,80,78,71].every((n,i) => result.data[i] === n))
    throw new MediaRejection('PROCESSING_REJECTED', 422, 'Photo processing failed');
  const imageId = newId();
  if (!validUuid(imageId)) throw new MediaRejection('INVALID_ID', 500, 'Could not generate image identity');
  const path = `${studentId}/${listingId}/${imageId}.png`;
  const sortOrder = Array.from({ length: PHOTO_LIMIT }, (_, index) => index)
    .find(index => !existing.some(value => value.sort_order === index)) ?? PHOTO_LIMIT;
  await deps.storeSanitized(path, result.data, result.mime);
  try {
    // The cutover migration must enforce a transaction-safe six-photo limit.
    return await deps.persistMedia(listingId, path, sortOrder);
  } catch (err) {
    // A DB failure must not leave an unmanaged public object.
    try { await deps.removeObject(path); }
    catch { throw new MediaRejection('CLEANUP_REQUIRED', 503, 'Photo processing was not committed; storage cleanup requires operator attention'); }
    throw err;
  }
}
export async function removeListingPhoto(
  deps: TrustedMediaDeps, studentId: string, listingId: string, photoId: string,
): Promise<void> {
  if (![studentId, listingId, photoId].every(validUuid))
    throw new MediaRejection('INVALID_ID', 400, 'Invalid photo identity');
  const listing = await deps.getListing(listingId);
  requireListing(listing, studentId);
  const photos = await deps.getPhotos(listingId);
  const photo = photos.find(x => x.id === photoId);
  if (!photo) throw new MediaRejection('NOT_FOUND', 404, 'Photo not found');
  if (!photo.object_path.startsWith(`${studentId}/${listingId}/`))
    throw new MediaRejection('FORBIDDEN', 403, 'Invalid photo ownership');
  // Remove from delivery first. Metadata stays if Storage fails, so the owner
  // can retry; no DB-only deletion that leaves a publicly reachable object.
  await deps.removeObject(photo.object_path);
  const deleted = await deps.removeMetadata(photo.id, listingId);
  if (!deleted) throw new MediaRejection('CLEANUP_REQUIRED', 503, 'Storage removed; metadata cleanup requires retry');
}
