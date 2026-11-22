/** Private group attachment download gate. Never return signed or public URLs. */
export type FileRecord = {
  id: string; group_id: string; uploader_id: string; object_path: string;
  original_name: string; media_type: string; size_bytes: number;
  status: string; inspection_method: string | null; inspected_at: string | null;
};
export interface DownloadDeps {
  lookupFile(id: string): Promise<FileRecord | null>;
  activeMembership(groupId: string, actorId: string): Promise<boolean>;
  isBanned(groupId: string, actorId: string): Promise<boolean>;
  readBytes(path: string): Promise<Blob>;
}
export class DownloadDenied extends Error {
  constructor(public status: number, message: string) { super(message); }
}
export const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const MAX_APPROVED_BYTES = 5242880;

/** Every request rechecks live membership and ban status before fetching. */
export async function authorizedGroupDownload(
  deps: DownloadDeps, actor: string | null, fileId: string | null,
): Promise<{ bytes: Blob; name: string }> {
  if (!actor || !UUID.test(actor)) throw new DownloadDenied(401, "Sign in to access files");
  if (!fileId || !UUID.test(fileId)) throw new DownloadDenied(404, "File unavailable");
  const file = await deps.lookupFile(fileId);
  if (!file || file.status !== "approved" || !file.inspected_at ||
    !["antivirus", "trusted-image-transcode"].includes(file.inspection_method ?? "") ||
    !["application/pdf", "image/webp"].includes(file.media_type) ||
    file.size_bytes < 1 || file.size_bytes > MAX_APPROVED_BYTES ||
    !file.object_path.startsWith(file.group_id + "/")) {
    throw new DownloadDenied(404, "File unavailable");
  }
  const [member, banned] = await Promise.all([
    deps.activeMembership(file.group_id, actor),
    deps.isBanned(file.group_id, actor),
  ]);
  if (!member || banned) throw new DownloadDenied(404, "File unavailable");
  const bytes = await deps.readBytes(file.object_path);
  // If Storage contains a different payload, never send it blindly.
  if (!bytes.size || bytes.size > MAX_APPROVED_BYTES || bytes.size !== file.size_bytes)
    throw new DownloadDenied(503, "File temporarily unavailable");
  // A removal concurrent with Storage reads must not allow post-removal bytes.
  const [stillMember, nowBanned] = await Promise.all([
    deps.activeMembership(file.group_id, actor),
    deps.isBanned(file.group_id, actor),
  ]);
  if (!stillMember || nowBanned) throw new DownloadDenied(404, "File unavailable");
  const safeName = file.original_name
    .replace(/[\\/\r\n\x00-\x1f\x7f"<>:|?*]/g, "_")
    .trim().slice(0, 120) || "stuora-file";
  return { bytes, name: safeName };
}
