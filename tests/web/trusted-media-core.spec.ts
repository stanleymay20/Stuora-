import { expect, test } from '@playwright/test';
import {
  MediaRejection, publishListingPhoto, removeListingPhoto, type MediaRecord, type TrustedMediaDeps,
} from '../../supabase/functions/listing-photo-intake/core';

const owner = '11111111-1111-4111-8111-111111111111';
const stranger = '22222222-2222-4222-8222-222222222222';
const listingId = '33333333-3333-4333-8333-333333333333';
const imageId = '44444444-4444-4444-8444-444444444444';
const recordId = '55555555-5555-4555-8555-555555555555';
const output = Uint8Array.of(137,80,78,71,13,10,26,10,0,0,0,0);

function fixture() {
  const calls: string[] = [];
  const photos: MediaRecord[] = [];
  const config = { owner, status: 'active', kind: 'housing', rejectPersist: false, rejectUpload: false, rejectDelete: false };
  const deps: TrustedMediaDeps = {
    async getListing(id) {
      calls.push('lookup');
      return { id, owner_id: config.owner, kind: config.kind, status: config.status };
    },
    async getPhotos() { calls.push('list'); return [...photos]; },
    async transcode(raw) {
      calls.push('transcode');
      expect(raw).toEqual(Uint8Array.of(1,2,3));
      return { mime: 'image/png', data: output };
    },
    async storeSanitized(path, data, mime) {
      calls.push('store');
      expect(data).toEqual(output);
      expect(mime).toBe('image/png');
      expect(path).toBe(`${owner}/${listingId}/${imageId}.png`);
      if (config.rejectUpload) throw new Error('Storage unavailable');
    },
    async persistMedia(id, path, sort_order) {
      calls.push('persist');
      if (config.rejectPersist) throw new Error('DB denied');
      const row = { id: recordId, listing_id: id, object_path: path, sort_order, created_at: new Date().toISOString() };
      photos.push(row);
      return row;
    },
    async removeObject() { calls.push('remove-object'); if (config.rejectDelete) throw new Error('Storage unreachable'); },
    async removeMetadata(id) {
      calls.push('remove-metadata');
      const idx = photos.findIndex(x => x.id === id);
      if (idx < 0) return false;
      photos.splice(idx,1);
      return true;
    },
  };
  return { calls, photos, config, deps };
}
const upload = (f: ReturnType<typeof fixture>, actor = owner, content = Uint8Array.of(1,2,3)) =>
  publishListingPhoto(f.deps, actor, listingId, content, () => imageId);

test('trusted pipeline authenticates listing ownership before transcode, storage, or public metadata', async () => {
  const f = fixture();
  const row = await upload(f);
  expect(row.id).toBe(recordId);
  expect(f.calls).toEqual(['lookup', 'list', 'transcode', 'store', 'persist']);
  expect(f.photos).toHaveLength(1);
});
test('cross-tenant user cannot upload, transcode or delete an owner photo', async () => {
  const f = fixture();
  await expect(upload(f, stranger)).rejects.toMatchObject({ code: 'FORBIDDEN', status: 403 });
  expect(f.calls).toEqual(['lookup']);
  f.calls.splice(0);
  await upload(f);
  f.calls.splice(0);
  await expect(removeListingPhoto(f.deps, stranger, listingId, recordId)).rejects.toMatchObject({ code: 'FORBIDDEN' });
  expect(f.calls).toEqual(['lookup']);
});
test('invalid listing ID, input byte limit and disabled listings reject before storage', async () => {
  const f = fixture();
  await expect(publishListingPhoto(f.deps, owner, 'not-an-id', Uint8Array.of(1), () => imageId))
    .rejects.toMatchObject({ code: 'INVALID_ID' });
  await expect(upload(f, owner, new Uint8Array(0))).rejects.toMatchObject({ code: 'SIZE_LIMIT' });
  expect(f.calls).toHaveLength(0);
  f.config.status = 'closed';
  await expect(upload(f)).rejects.toMatchObject({ code: 'NOT_ACTIVE' });
  expect(f.calls).toEqual(['lookup']);
});
test('photo quota fails closed before transcode and cannot accept the seventh photo', async () => {
  const f = fixture();
  for (let i=0; i<6; i++) f.photos.push({id: crypto.randomUUID(), listing_id: listingId,
    object_path: `${owner}/${listingId}/${crypto.randomUUID()}.png`, sort_order:i, created_at:'2026-10-22'});
  await expect(upload(f)).rejects.toMatchObject({ code: 'PHOTO_LIMIT', status: 409 });
  expect(f.calls).toEqual(['lookup','list']);
});
test('failed metadata commit removes the processed public object without publishing a row', async () => {
  const f = fixture(); f.config.rejectPersist = true;
  await expect(upload(f)).rejects.toThrow('DB denied');
  expect(f.calls).toEqual(['lookup','list','transcode','store','persist','remove-object']);
  expect(f.photos).toHaveLength(0);
});
test('uncertain failed Storage upload attempts to clean orphan bytes before returning error', async () => {
  const f = fixture(); f.config.rejectUpload = true;
  await expect(upload(f)).rejects.toThrow('Storage unavailable');
  expect(f.calls).toEqual(['lookup','list','transcode','store','remove-object']);
  expect(f.photos).toHaveLength(0);
});
test('uncertain Storage upload and failed cleanup escalate for operator investigation', async () => {
  const f = fixture(); f.config.rejectUpload = true; f.config.rejectDelete = true;
  await expect(upload(f)).rejects.toMatchObject({code:'CLEANUP_REQUIRED',status:503});
  expect(f.calls).toEqual(['lookup','list','transcode','store','remove-object']);
  expect(f.photos).toHaveLength(0);
});
test('failed processed file cleanup escalates an operator-attention error', async () => {
  const f = fixture(); f.config.rejectPersist = true; f.config.rejectDelete = true;
  await expect(upload(f)).rejects.toMatchObject({ code: 'CLEANUP_REQUIRED', status: 503 });
  expect(f.photos).toHaveLength(0);
});
test('owner removal deletes public bytes before metadata and leaves metadata on file-delete failure', async () => {
  const f = fixture(); await upload(f); f.calls.splice(0);
  await removeListingPhoto(f.deps, owner, listingId, recordId);
  expect(f.calls).toEqual(['lookup','list','remove-object','remove-metadata']);
  expect(f.photos).toHaveLength(0);
  const retry = fixture(); await upload(retry); retry.calls.splice(0); retry.config.rejectDelete=true;
  await expect(removeListingPhoto(retry.deps,owner,listingId,recordId)).rejects.toThrow('Storage unreachable');
  expect(retry.calls).toEqual(['lookup','list','remove-object']);
  expect(retry.photos).toHaveLength(1);
});
test('non-image and unprocessed outputs are rejected before public persistence', async () => {
  const f=fixture();
  f.deps.transcode = async () => ({ mime:'image/png', data: Uint8Array.of(60,115,118,103) });
  await expect(upload(f)).rejects.toMatchObject({ code:'PROCESSING_REJECTED' });
  expect(f.calls).toEqual(['lookup','list']);
});
