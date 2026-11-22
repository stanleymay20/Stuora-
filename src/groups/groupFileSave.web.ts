import { groupDownloadRequest, safeDownloadName, validateDownloadedFile, type DownloadableGroupFile } from './groupFileTransfer';

/** Browser save requires the signed-in student's token, never a public URL. */
export async function saveSharedGroupFile(
  file: DownloadableGroupFile, token: string, apiUrl: string, publishableKey: string,
): Promise<string> {
  const { url, headers } = groupDownloadRequest(file, token, apiUrl, publishableKey);
  const res = await fetch(url, { method: 'GET', headers, cache: 'no-store', credentials: 'omit' });
  if (!res.ok) throw new Error('File unavailable, or group access has changed.');
  const expectedHeader = res.headers.get('content-length');
  if (expectedHeader && Number(expectedHeader) !== file.size_bytes)
    throw new Error('The file size changed. Download cancelled.');
  const bytes = await res.arrayBuffer();
  validateDownloadedFile(file, bytes.byteLength, res.headers.get('content-type'));
  const blob = new Blob([bytes], { type: file.media_type });
  const objectUrl = URL.createObjectURL(blob);
  try {
    const anchor = document.createElement('a');
    anchor.href = objectUrl;
    anchor.download = safeDownloadName(file.original_name, file.id);
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
  } finally {
    window.setTimeout(() => URL.revokeObjectURL(objectUrl), 15_000);
  }
  return 'Download started in your browser.';
}
