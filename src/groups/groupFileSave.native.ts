import { Platform } from 'react-native';
import { Directory, File, Paths } from 'expo-file-system';
import * as LegacyFS from 'expo-file-system/legacy';
import { fetch as expoFetch } from 'expo/fetch';
import { groupDownloadRequest, safeDownloadName, validateDownloadedFile, type DownloadableGroupFile } from './groupFileTransfer';

/** Native file save, staging-only; iOS Files visibility is configured via app.json. */
export async function saveSharedGroupFile(
  file: DownloadableGroupFile, token: string, apiUrl: string, publishableKey: string,
): Promise<string> {
  if (Platform.OS !== 'ios' && Platform.OS !== 'android')
    throw new Error('Only supported mobile devices can save private group files.');
  const { url, headers } = groupDownloadRequest(file, token, apiUrl, publishableKey);
  const res = await expoFetch(url, { method: 'GET', headers });
  if (!res.ok) throw new Error('File unavailable, or group access has changed.');
  const expectedHeader = res.headers.get('content-length');
  if (expectedHeader && Number(expectedHeader) !== file.size_bytes)
    throw new Error('The file size changed. Download cancelled.');
  const payload = await res.bytes();
  validateDownloadedFile(file, payload.byteLength, res.headers.get('content-type'));
  const name = safeDownloadName(file.original_name, file.id);
  if (Platform.OS === 'android') {
    // Android's Storage Access Framework lets the student choose a destination.
    // Never write to unrestricted shared storage or bypass user consent.
    const permission = await LegacyFS.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permission.granted) throw new Error('Select a folder to save this file.');
    const temp = new File(Paths.cache, name);
    let createdUri: string | null = null;
    try {
      temp.create({ overwrite: true });
      temp.write(payload);
      const base64 = await temp.base64();
      const baseName = name.replace(/\\.[^.]+$/, '');
      createdUri = await LegacyFS.StorageAccessFramework.createFileAsync(
        permission.directoryUri, baseName, file.media_type,
      );
      await LegacyFS.StorageAccessFramework.writeAsStringAsync(createdUri, base64, {
        encoding: LegacyFS.EncodingType.Base64,
      });
      return 'Saved to the Android folder you selected.';
    } catch {
      if (createdUri) await LegacyFS.deleteAsync(createdUri).catch(() => {});
      throw new Error('Could not save to the selected Android folder.');
    } finally {
      if (temp.exists) temp.delete();
    }
  }
  // iOS Documents are accessible from the Files app via the FileSystem plugin.
  const folder = new Directory(Paths.document, 'Shared files');
  folder.create({ idempotent: true });
  const target = new File(folder, name);
  try {
    target.create({ overwrite: true });
    target.write(payload);
  } catch {
    if (target.exists) target.delete();
    throw new Error('Could not save the file to this iPhone.');
  }
  return 'Saved to Files → On My iPhone → Stuora → Shared files.';
}
