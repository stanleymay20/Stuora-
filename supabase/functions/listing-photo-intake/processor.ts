// Server-controlled ImageMagick WASM decoder, tested against REAL codecs in Deno.
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.44";
import { MAX_OUTPUT_BYTES, MediaRejection } from "./core.ts";
import { inspectImageHeader, MAX_DECODED_PIXELS, MAX_IMAGE_SIDE } from "./imagePreflight.ts";
// 0.0.44 exports ./magick.wasm -> dist/x86/magick.wasm; the old lookup
// next to dist/index.js fails at runtime even when deno check passes.
const wasmFile = new URL(import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.44/magick.wasm"));
await initializeImageMagick(await Deno.readFile(wasmFile));

/** Long edge of every stored photo, in pixels. */
export const OUTPUT_MAX_SIDE = 1600;
/** Lossy WebP quality. Gen-3 audit N-06: PNG output inflated photos ~6.6x. */
export const OUTPUT_QUALITY = 80;

const VP8X_ANIMATION = 0x02, VP8X_XMP = 0x04, VP8X_EXIF = 0x08, VP8X_ICC = 0x20;
const ALLOWED_WEBP_CHUNKS = new Set(["VP8 ", "VP8L", "VP8X", "ALPH"]);

/**
 * Validate the encoder's WebP output and refuse anything that could carry
 * metadata or animation. Only image-data chunks may be present; VP8X flags
 * may announce alpha but never ICC, EXIF, XMP or animation. Nothing is
 * repaired: an unexpected layout is a hard rejection.
 */
export function assertCleanWebp(webp: Uint8Array): Uint8Array {
  const tag = (o: number) => String.fromCharCode(webp[o], webp[o + 1], webp[o + 2], webp[o + 3]);
  const u32 = (o: number) => webp[o] + webp[o + 1] * 256 + webp[o + 2] * 65536 + webp[o + 3] * 16777216;
  const bad = (message = "Invalid transcoded image"): never => { throw new MediaRejection("BAD_OUTPUT", 422, message); };
  if (webp.length < 20 || tag(0) !== "RIFF" || tag(8) !== "WEBP" || u32(4) + 8 !== webp.length) bad();
  let offset = 12, imageData = false, chunks = 0;
  while (offset < webp.length) {
    if (++chunks > 16 || offset + 8 > webp.length) bad();
    const name = tag(offset);
    const size = u32(offset + 4);
    const end = offset + 8 + size + (size % 2);
    if (end > webp.length) bad();
    if (!ALLOWED_WEBP_CHUNKS.has(name)) bad("Unsupported image data");
    if (name === "VP8X") {
      if (chunks !== 1 || size < 10) bad();
      if (webp[offset + 8] & (VP8X_ANIMATION | VP8X_XMP | VP8X_EXIF | VP8X_ICC)) bad("Unsupported image data");
    }
    if (name === "VP8 " || name === "VP8L") imageData = true;
    offset = end;
  }
  if (!imageData || offset !== webp.length) bad("Incomplete image");
  return webp;
}

export function decodeAndEncode(raw: Uint8Array) {
  // Header preflight must run before ImageMagick allocates decoded pixels.
  const header = inspectImageHeader(raw);
  try {
    const result = ImageMagick.read(raw, image => {
      if (!image.width || !image.height || image.width > MAX_IMAGE_SIDE || image.height > MAX_IMAGE_SIDE
        || image.width * image.height > MAX_DECODED_PIXELS
        || image.width !== header.width || image.height !== header.height)
        throw new MediaRejection("DIMENSIONS", 422, "Photo dimensions are unsupported");
      image.autoOrient();
      // Remove EXIF/GPS, XMP, ICC and comments before encoding.
      image.strip();
      const scale = Math.min(1, OUTPUT_MAX_SIDE / Math.max(image.width, image.height));
      if (scale < 1) image.resize(Math.max(1, Math.round(image.width * scale)), Math.max(1, Math.round(image.height * scale)));
      image.quality = OUTPUT_QUALITY;
      return image.write(MagickFormat.WebP, bytes => Uint8Array.from(bytes));
    });
    if (result.length > MAX_OUTPUT_BYTES) throw new MediaRejection("BAD_OUTPUT", 422, "Processed photo is too large");
    return { mime: "image/webp" as const, data: assertCleanWebp(result) };
  } catch (err) {
    if (err instanceof MediaRejection) throw err;
    throw new MediaRejection("DECODE_FAILED", 422, "Photo could not be decoded safely");
  }
}
