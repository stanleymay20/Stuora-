/** Private group attachment download gate. Never return signed or public URLs. */
export type FileRecord = {
  id: string; group_id: string; uploader_id: string; object_path: string;
  original_name: string; media_type: string; size_bytes: number;
  status: string; inspection_method: string | null; inspected_at: string | null;
  scan_sha256: string | null; scan_engine: string | null;
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
    !["application/pdf", "image/webp"].includes(file.media_type) ||
    (file.media_type === "application/pdf" &&
      (file.inspection_method !== "antivirus" ||
       file.scan_engine !== "clamav-http-v1" ||
       !/^[0-9a-f]{64}$/.test(file.scan_sha256 ?? ""))) ||
    (file.media_type === "image/webp" &&
      file.inspection_method !== "trusted-image-transcode") ||
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
  if (file.media_type === "application/pdf") {
    const digest = await crypto.subtle.digest("SHA-256", await bytes.arrayBuffer());
    const actual = [...new Uint8Array(digest)].map(n => n.toString(16).padStart(2, "0")).join("");
    if (actual !== file.scan_sha256)
      throw new DownloadDenied(503, "File temporarily unavailable");
  }
  // A removal concurrent with Storage reads must not allow post-removal bytes.
  const [stillMember, nowBanned, latest] = await Promise.all([
    deps.activeMembership(file.group_id, actor),
    deps.isBanned(file.group_id, actor),
    deps.lookupFile(fileId),
  ]);
  if (!stillMember || nowBanned || !latest || latest.status !== "approved" ||
      latest.object_path !== file.object_path || latest.inspected_at !== file.inspected_at ||
      latest.scan_sha256 !== file.scan_sha256 || latest.scan_engine !== file.scan_engine)
    throw new DownloadDenied(404, "File unavailable");
  const safeName = file.original_name
    .replace(/[\\/\r\n\x00-\x1f\x7f"<>:|?*]/g, "_")
    .trim().slice(0, 120) || "stuora-file";
  return { bytes, name: safeName };
}
