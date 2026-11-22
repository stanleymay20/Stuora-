/** Shared attachment helpers. Never place tokens or private paths in URLs. */
export const MAX_FILE_BYTES = 5_242_880;
export type DownloadableGroupFile = {
  id: string;
  original_name: string;
  size_bytes: number;
  media_type: 'application/pdf' | 'image/webp';
};
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function groupDownloadRequest(file: DownloadableGroupFile, token: string, url: string, key: string) {
  if (!UUID.test(file.id) || !token || !key ||
    url !== 'https://uptjcspizukpjcoayhtn.supabase.co')
    throw new Error('Secure file download is unavailable.');
  if (!Number.isSafeInteger(file.size_bytes) || file.size_bytes < 1 || file.size_bytes > MAX_FILE_BYTES)
    throw new Error('This file exceeds the allowed size.');
  const endpoint = new URL('/functions/v1/group-file-download', url);
  endpoint.searchParams.set('fileId', file.id); // Never include token or filename.
  return { url: endpoint.toString(), headers: {
    Authorization: `Bearer ${token}`,
    apikey: key,
  } };
}
export function safeDownloadName(original: string, id: string) {
  const name = original.replace(/[\\/\r\n\x00-\x1f\x7f"<>:|?*]/g, '_').trim().slice(0, 100);
  return `${id.slice(0, 8)}-${name || 'stuora-file'}`;
}
export function validateDownloadedFile(file: DownloadableGroupFile, count: number, contentType: string | null) {
  if (count !== file.size_bytes || count > MAX_FILE_BYTES || count <= 0 ||
    !contentType?.toLowerCase().startsWith('application/octet-stream')) {
    throw new Error('The download could not be verified. No file was saved.');
  }
}
