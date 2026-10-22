// Server-controlled ImageMagick WASM decoder, tested against REAL codecs in Deno.
import { ImageMagick, initializeImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.44";
import { MAX_INPUT_BYTES, MediaRejection } from "./core.ts";
import { inspectImageHeader, MAX_DECODED_PIXELS, MAX_IMAGE_SIDE } from "./imagePreflight.ts";
// 0.0.44 exports ./magick.wasm -> dist/x86/magick.wasm; the old lookup
// next to dist/index.js fails at runtime even when deno check passes.
const wasmFile = new URL(import.meta.resolve("npm:@imagemagick/magick-wasm@0.0.44/magick.wasm"));
await initializeImageMagick(await Deno.readFile(wasmFile));

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
