// Staged, NOT DEPLOYED. This privileged Edge Function must be reviewed and
// validated against a dedicated staging backend before the Storage cutover.
// Real student images are never sent to an external LLM or third-party URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.44";
import {
  MAX_INPUT_BYTES, MediaRejection, publishListingPhoto, removeListingPhoto, validUuid,
  type TrustedMediaDeps, type MediaRecord,
} from "./core.ts";

const wasmFile = new URL("magick.wasm", import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.44"));
await initializeImageMagick(await Deno.readFile(wasmFile));
const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigin = Deno.env.get("STUORA_ALLOWED_WEB_ORIGIN") ?? "";
if (!url || !anonKey || !serviceKey || !/^https:\/\//.test(allowedOrigin))
  throw new Error("Missing required trusted media configuration");
const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

function response(status: number, body: object, origin: string | null) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json", "Cache-Control": "no-store",
    "Vary": "Origin",
  };
  if (origin === allowedOrigin) {
    headers["Access-Control-Allow-Origin"] = origin;
    headers["Access-Control-Allow-Headers"] = "authorization, apikey, content-type, x-client-info";
    headers["Access-Control-Allow-Methods"] = "POST, DELETE, OPTIONS";
  }
  return new Response(JSON.stringify(body), { status, headers });
}
function cleanPng(png: Uint8Array): Uint8Array {
  // Strip all encoded ancillary payloads a decoder could copy forward.
  // Output is a fresh PNG containing only essential chunks with original CRC.
  if (png.length < 45 || ![137,80,78,71,13,10,26,10].every((n,i)=>png[i]===n))
    throw new MediaRejection("BAD_OUTPUT", 422, "Invalid transcoded image");
  const blocks: Uint8Array[] = [png.slice(0, 8)];
  let offset = 8, imageData = false, ended = false;
  const allow = new Set(["IHDR", "PLTE", "IDAT", "IEND", "tRNS"]);
  while (offset < png.length) {
    if (offset + 12 > png.length) throw new MediaRejection("BAD_OUTPUT", 422, "Invalid transcoded image");
    const count = new DataView(png.buffer, png.byteOffset + offset, 4).getUint32(0);
    const end = offset + count + 12;
    if (count > MAX_INPUT_BYTES || end > png.length)
      throw new MediaRejection("BAD_OUTPUT", 422, "Invalid transcoded image");
    const type = String.fromCharCode(...png.slice(offset + 4, offset + 8));
    if (!allow.has(type) && type[0] === type[0].toUpperCase())
      throw new MediaRejection("BAD_OUTPUT", 422, "Unsupported image data");
    if (type === "IDAT") imageData = true;
    if (allow.has(type)) blocks.push(png.slice(offset, end));
    offset = end;
    if (type === "IEND") { if (count || offset !== png.length) throw new MediaRejection("BAD_OUTPUT", 422, "Invalid image ending"); ended = true; break; }
  }
  if (!imageData || !ended) throw new MediaRejection("BAD_OUTPUT", 422, "Incomplete image");
  const size = blocks.reduce((n, p) => n + p.length, 0);
  const result = new Uint8Array(size);
  let i = 0; for (const block of blocks) { result.set(block, i); i += block.length; }
  return result;
}
function decodeAndEncode(raw: Uint8Array) {
  const isJpg = raw[0] === 255 && raw[1] === 216;
  const isPng = raw[0] === 137 && raw[1] === 80 && raw[2] === 78;
  const isWebp = raw[0] === 82 && raw[1] === 73 && raw[2] === 70 && raw[3] === 70
    && String.fromCharCode(...raw.slice(8, 12)) === "WEBP";
  if (!isJpg && !isPng && !isWebp)
    throw new MediaRejection("UNSUPPORTED", 415, "Only JPEG, PNG and WebP are supported");
  try {
    const result = ImageMagick.read(raw, image => {
      if (!image.width || !image.height || image.width > 12000 || image.height > 12000
        || image.width * image.height > 30_000_000)
        throw new MediaRejection("DIMENSIONS", 422, "Photo dimensions are unsupported");
      image.autoOrient();
      const scale = Math.min(1, 1600 / Math.max(image.width, image.height));
      if (scale < 1) image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
      return image.write(MagickFormat.Png, bytes => Uint8Array.from(bytes));
    });
    return { mime: "image/png" as const, data: cleanPng(result) };
  } catch (err) {
    if (err instanceof MediaRejection) throw err;
    throw new MediaRejection("DECODE_FAILED", 422, "Photo could not be decoded safely");
  }
}
function deps(): TrustedMediaDeps {
  const fail = (message: string): never => { throw new Error(message); };
  return {
    async getListing(id) {
      const { data, error } = await admin.from("listings").select("id,owner_id,kind,status").eq("id", id).maybeSingle();
      if (error) fail("Listing lookup failed");
      return data;
    },
    async getPhotos(id) {
      const { data, error } = await admin.from("listing_media")
        .select("id,listing_id,object_path,sort_order,created_at").eq("listing_id", id);
      if (error) fail("Photo lookup failed");
      return (data ?? []) as MediaRecord[];
    },
    async transcode(raw) { return decodeAndEncode(raw); },
    async storeSanitized(path, data, mime) {
      const { error } = await admin.storage.from("listing-media").upload(path, data, {
        contentType: mime, upsert: false, cacheControl: "3600",
      });
      if (error) fail("Processed photo storage failed");
    },
    async persistMedia(listingId, path, sortOrder) {
      const { data, error } = await admin.from("listing_media")
        .insert({ listing_id: listingId, object_path: path, sort_order: sortOrder })
        .select("id,listing_id,object_path,sort_order,created_at").single();
      if (error || !data) fail("Photo metadata was rejected");
      return data as MediaRecord;
    },
    async removeObject(path) {
      const { error } = await admin.storage.from("listing-media").remove([path]);
      if (error) fail("Could not remove stored photo");
    },
    async removeMetadata(photoId, listingId) {
      const { data, error } = await admin.from("listing_media").delete()
        .eq("id", photoId).eq("listing_id", listingId).select("id").maybeSingle();
      if (error) fail("Could not remove photo metadata");
      return !!data;
    },
  };
}
async function boundedMultipart(req: Request, limit: number): Promise<FormData> {
  if (!req.body) throw new MediaRejection("INVALID_BODY", 400, "Photo request body missing");
  const reader = req.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > limit)
        throw new MediaRejection("SIZE_LIMIT", 413, "Photo request exceeds the upload limit");
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(received);
  let offset = 0;
  for (const part of chunks) { body.set(part, offset); offset += part.byteLength; }
  const headers = new Headers({ "content-type": req.headers.get("content-type") ?? "" });
  return new Request(req.url, { method: "POST", headers, body: body.buffer }).formData();
}

Deno.serve(async req => {
  const origin = req.headers.get("Origin");
  // Fail closed until private staging integration tests, durable request quotas
  // and the coordinated client/Storage migration have been approved.
  if (Deno.env.get("STUORA_TRUSTED_MEDIA_ACTIVATION") !== "STAGING_APPROVED")
    return response(503, { code: "FEATURE_DISABLED", error: "Trusted uploads are not enabled" }, origin);
  if (origin && origin !== allowedOrigin) return response(403, { error: "Unapproved origin" }, null);
  if (req.method === "OPTIONS") return response(200, { ok: true }, origin);
  if (req.method !== "POST" && req.method !== "DELETE") return response(405, { error: "Unsupported method" }, origin);
  try {
    const match = /^Bearer (\S+)$/i.exec(req.headers.get("authorization") ?? "");
    if (!match) return response(401, { error: "Authentication required" }, origin);
    const userClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error } = await userClient.auth.getUser(match[1]);
    if (error || !user) return response(401, { error: "Invalid user session" }, origin);
    // Never accept userId, owner_id, objectPath, mime or status from the caller.
    if (req.method === "DELETE") {
      const body = await req.json().catch(() => ({}));
      if (!validUuid(body.listingId) || !validUuid(body.photoId))
        throw new MediaRejection("INVALID_ID", 400, "Invalid photo identity");
      await removeListingPhoto(deps(), user.id, body.listingId, body.photoId);
      return response(200, { ok: true }, origin);
    }
    // This RPC is a separate committed database request. Unlike a limiter
    // called within the eventual metadata INSERT, its counters survive failed
    // multipart parsing, decoder rejection and storage/metadata errors.
    const routeListingId = new URL(req.url).searchParams.get("listingId");
    const { data: attemptAllowed, error: attemptError } = await admin.rpc("consume_listing_photo_attempt", {
      p_student: user.id,
      p_listing: validUuid(routeListingId) ? routeListingId : null,
    });
    if (attemptError || typeof attemptAllowed !== "boolean")
      throw new MediaRejection("LIMIT_UNAVAILABLE", 503, "Photo upload temporarily unavailable");
    if (!attemptAllowed)
      throw new MediaRejection("UPLOAD_RATE_LIMIT", 429, "Too many photo uploads. Try again later");
    const declared = Number(req.headers.get("content-length") ?? 0);
    if (declared > MAX_INPUT_BYTES + 32_768)
      throw new MediaRejection("SIZE_LIMIT", 413, "Photo exceeds the 5 MB upload limit");
    const type = req.headers.get("content-type") ?? "";
    if (!type.toLowerCase().startsWith("multipart/form-data;"))
      throw new MediaRejection("INVALID_BODY", 415, "Multipart form data required");
    const form = await boundedMultipart(req, MAX_INPUT_BYTES + 32_768);
    const listingId = form.get("listingId");
    const file = form.get("file");
    if (!validUuid(listingId) || !validUuid(routeListingId) ||
      listingId.toLowerCase() !== routeListingId.toLowerCase() ||
      !(file instanceof File) || file.size > MAX_INPUT_BYTES)
      throw new MediaRejection("INVALID_UPLOAD", 400, "Invalid listing or photo");
    const result = await publishListingPhoto(deps(), user.id, listingId, new Uint8Array(await file.arrayBuffer()),
      () => crypto.randomUUID());
    return response(201, { photo: result }, origin);
  } catch (err) {
    if (err instanceof MediaRejection)
      return response(err.status, { code: err.code, error: err.message }, origin);
    // No user identifiers, object keys, token values or image bytes in logs.
    console.error("listing-photo-intake internal failure", err instanceof Error ? err.name : "unknown");
    return response(503, { code: "NOT_READY", error: "Photo service unavailable" }, origin);
  }
});
