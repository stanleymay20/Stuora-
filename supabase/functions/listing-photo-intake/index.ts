// Deployed in STAGING only with a compiled-off write gate. Changes to this
// function require CI and controlled staging redeployment; NO Storage cutover.
// Real student images are never sent to an external LLM or third-party URL.
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { decodeAndEncode } from "./processor.ts";
import { STAGING_API_URL, trustedMediaWriteGate } from "./releaseGate.ts";
import {
  MAX_INPUT_BYTES, MediaRejection, publishListingPhoto, removeListingPhoto, validUuid,
  type TrustedMediaDeps, type MediaRecord,
} from "./core.ts";

const url = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const allowedOrigin = Deno.env.get("STUORA_ALLOWED_WEB_ORIGIN") ?? "";
// Missing custom browser-origin configuration is acceptable for DISABLED
// staging startup; never let it silently authorize mutations.
if (url !== STAGING_API_URL || !anonKey || !serviceKey)
  throw new Error("Trusted media is allowed on dedicated Stuora staging only");
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
  if (!trustedMediaWriteGate(Deno.env.get("STUORA_TRUSTED_MEDIA_ACTIVATION"), url, allowedOrigin))
    return response(503, { code: "FEATURE_DISABLED", error: "Trusted uploads are not enabled" }, origin);
  if (origin && origin !== allowedOrigin) return response(403, { error: "Unapproved origin" }, null);
  if (req.method === "OPTIONS") return response(200, { ok: true }, origin);
  if (req.method !== "POST" && req.method !== "DELETE") return response(405, { error: "Unsupported method" }, origin);
  let processingLease: { studentId: string; requestId: string } | null = null;
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
    // Independent committed RPC lease limits concurrent WASM allocations,
    // including requests across separate Edge isolates and replicas.
    const requestId = crypto.randomUUID();
    const { data: leaseAllowed, error: leaseError } = await admin.rpc("acquire_listing_photo_processing_lease", {
      p_student: user.id, p_request: requestId,
    });
    if (leaseError || typeof leaseAllowed !== "boolean")
      throw new MediaRejection("CAPACITY_UNAVAILABLE", 503, "Photo processing capacity unavailable");
    if (!leaseAllowed)
      throw new MediaRejection("CAPACITY_BUSY", 429, "Photo processing is busy. Try again later");
    processingLease = { studentId: user.id, requestId };
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
  } finally {
    if (processingLease) {
      const { error: releaseError, data: released } = await admin.rpc("release_listing_photo_processing_lease", {
        p_student: processingLease.studentId, p_request: processingLease.requestId,
      });
      // Expiry provides a recovery limit for process crashes; no user ID or
      // opaque request token is ever placed in diagnostic logs.
      if (releaseError || released !== true)
        console.error("listing-photo-intake lease release requires operator review");
    }
  }
});
