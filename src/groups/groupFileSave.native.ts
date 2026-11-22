import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import { fetch as expoFetch } from 'expo/fetch';
import { groupDownloadRequest, safeDownloadName, validateDownloadedFile, type DownloadableGroupFile } from './groupFileTransfer';

/** Native file save, staging-only; iOS Files visibility is configured via app.json. */
export async function saveSharedGroupFile(
  file: DownloadableGroupFile, token: string, apiUrl: string, publishableKey: string,
): Promise<string> {
  if (Platform.OS !== 'ios')
    throw new Error('Save to Files is being qualified on Android. No download occurred.');
  const { url, headers } = groupDownloadRequest(file, token, apiUrl, publishableKey);
  const res = await expoFetch(url, { method: 'GET', headers });
  if (!res.ok) throw new Error('File unavailable, or group access has changed.');
  const expectedHeader = res.headers.get('content-length');
  if (expectedHeader && Number(expectedHeader) !== file.size_bytes)
    throw new Error('The file size changed. Download cancelled.');
  const payload = await res.bytes();
  validateDownloadedFile(file, payload.byteLength, res.headers.get('content-type'));
  const folder = new Directory(Paths.document, 'Shared files');
  folder.create({ idempotent: true });
  const target = new File(folder, safeDownloadName(file.original_name, file.id));
  try {
    target.create({ overwrite: true });
    target.write(payload);
  } catch {
    if (target.exists) target.delete();
    throw new Error('Could not save the file to this device.');
  }
  return 'Saved to Files → On My iPhone → Stuora → Shared files.';
}
