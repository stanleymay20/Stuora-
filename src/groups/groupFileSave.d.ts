import type { DownloadableGroupFile } from './groupFileTransfer';
export function saveSharedGroupFile(
  file: DownloadableGroupFile, token: string, apiUrl: string, publishableKey: string,
): Promise<string>;
