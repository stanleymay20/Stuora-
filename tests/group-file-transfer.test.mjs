import test from 'node:test';
import assert from 'node:assert/strict';
import {
 groupDownloadRequest, safeDownloadName, validateDownloadedFile,
 MAX_FILE_BYTES
} from '../src/groups/groupFileTransfer.ts';

const file = {
  id: '00000000-0000-0000-0000-000000000100',
  original_name: 'Lecture notes.pdf',
  media_type: 'application/pdf',
  size_bytes: 42,
};

test('private download sends authorization in headers, never URL or filename', () => {
  const request = groupDownloadRequest(file, 'very-secret-access', 'https://uptjcspizukpjcoayhtn.supabase.co','sb_publishable_test_key');
  assert.equal(new URL(request.url).pathname,'/functions/v1/group-file-download');
  assert.equal(new URL(request.url).searchParams.get('fileId'),file.id);
  assert.ok(!request.url.includes('very-secret-access'));
  assert.ok(!request.url.includes('Lecture'));
  assert.equal(request.headers.Authorization,'Bearer very-secret-access');
  assert.equal(request.headers.apikey,'sb_publishable_test_key');
});
test('invalid identifiers, project origins and overlarge files cannot be requested', () => {
  assert.throws(() => groupDownloadRequest({...file,id:'invalid'}, 't', 'https://uptjcspizukpjcoayhtn.supabase.co','key'));
  assert.throws(() => groupDownloadRequest(file, 't','http://untrusted.example','key'));
  assert.throws(() => groupDownloadRequest(file, 't','https://bad.site/path/extra','key'));
  assert.throws(() => groupDownloadRequest(file, '','https://uptjcspizukpjcoayhtn.supabase.co','key'));
  assert.throws(() => groupDownloadRequest({...file,size_bytes:MAX_FILE_BYTES+1},'t','https://uptjcspizukpjcoayhtn.supabase.co','key'));
});
test('safe download names remove device header/path hazards and prevent collisions', () => {
  const name=safeDownloadName('../\r\nX-Thing: 1.pdf',file.id);
  assert.ok(name.startsWith('00000000-'));
  assert.ok(!/[\\/\r\n:]/.test(name));
});
test('download validation checks exact expected length and server binary MIME', () => {
  assert.doesNotThrow(() => validateDownloadedFile(file,42,'application/octet-stream'));
  assert.throws(() => validateDownloadedFile(file,41,'application/octet-stream'));
  assert.throws(() => validateDownloadedFile(file,42,'text/html'));
  assert.throws(() => validateDownloadedFile(file,0,'application/octet-stream'));
  assert.throws(() => validateDownloadedFile({...file,size_bytes:MAX_FILE_BYTES},MAX_FILE_BYTES+1,'application/octet-stream'));
});
