/**
 * Browser/native compatible metadata stripping for public listing photos.
 * Recognizes actual magic bytes, not a claimed extension or content-type.
 * Does not decode, transform or redact pixels, and cannot prevent a client
 * from bypassing this code to upload directly to a public Storage bucket.
 * A server-side re-encoding/validation boundary is required for GA.
 */
export type SafeImageMime = 'image/jpeg' | 'image/png' | 'image/webp';

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_PIXELS = 36_000_000;
const error = (reason: string): never => { throw new Error(reason); };
function be16(b: Uint8Array, p: number) { return ((b[p] << 8) | b[p + 1]) >>> 0; }
function be32(b: Uint8Array, p: number) { return ((b[p] * 0x1000000) + (b[p + 1] << 16) + (b[p + 2] << 8) + b[p + 3]) >>> 0; }
function le32(b: Uint8Array, p: number) { return (b[p] + (b[p + 1] << 8) + (b[p + 2] << 16) + b[p + 3] * 0x1000000) >>> 0; }
function fourcc(b: Uint8Array, p: number) {
  return String.fromCharCode(b[p], b[p + 1], b[p + 2], b[p + 3]);
}
function concatenate(parts: Uint8Array[]): Uint8Array {
  const size = parts.reduce((sum, part) => sum + part.length, 0);
  if (size < 1 || size > MAX_BYTES) error('Processed photo exceeds the 5 MB limit');
  const out = new Uint8Array(size);
  let off = 0;
  for (const part of parts) { out.set(part, off); off += part.length; }
  return out;
}
function validateDimensions(width: number, height: number) {
  if (!width || !height || width > 12000 || height > 12000 || width * height > MAX_PIXELS)
    error('Photo dimensions are unsupported');
}
/** Orientation-dependent JPEGs cannot safely lose EXIF without rotating pixels. */
function exifOrientation(segment: Uint8Array): number | null {
  if (segment.length < 14 || fourcc(segment, 0) !== 'Exif' || segment[4] !== 0 || segment[5] !== 0) return null;
  const start = 6;
  const little = segment[start] === 0x49 && segment[start + 1] === 0x49;
  if (!little && !(segment[start] === 0x4d && segment[start + 1] === 0x4d)) error('Invalid photo orientation metadata');
  const read16 = (pos: number) => little ? segment[pos] | (segment[pos + 1] << 8) : be16(segment, pos);
  const read32 = (pos: number) => little
    ? (segment[pos] + (segment[pos + 1] << 8) + (segment[pos + 2] << 16) + segment[pos + 3] * 0x1000000) >>> 0
    : be32(segment, pos);
  if (read16(start + 2) !== 42) error('Invalid photo orientation metadata');
  const ifd = start + read32(start + 4);
  if (ifd + 2 > segment.length) error('Invalid photo orientation metadata');
  const count = read16(ifd);
  if (count > 256 || ifd + 2 + count * 12 > segment.length) error('Invalid photo orientation metadata');
  for (let i = 0; i < count; i++) {
    const p = ifd + 2 + i * 12;
    if (read16(p) === 0x0112) {
      if (read16(p + 2) !== 3 || read32(p + 4) !== 1) error('Invalid photo orientation metadata');
      return read16(p + 8);
    }
  }
  return null;
}
function jpeg(input: Uint8Array): Uint8Array {
  if (input.length < 16 || input[0] !== 0xff || input[1] !== 0xd8) error('Invalid JPEG photo');
  const parts = [input.slice(0, 2)];
  let p = 2, frameSeen = false, scanSeen = false;
  while (p < input.length) {
    const start = p;
    if (input[p++] !== 0xff) error('Invalid JPEG segment');
    while (p < input.length && input[p] === 0xff) p++;
    if (p >= input.length) error('Truncated JPEG segment');
    const marker = input[p++];
    if (marker === 0xd9) error('JPEG has no image data');
    if (marker === 0xd8 || marker === 0x00 || marker >= 0xd0 && marker <= 0xd7) error('Unexpected JPEG marker');
    if (p + 2 > input.length) error('Truncated JPEG length');
    const length = be16(input, p);
    if (length < 2 || p + length > input.length) error('Invalid JPEG length');
    if (marker === 0xda) {
      if (!frameSeen) error('JPEG frame missing');
      // Copy the compressed image from SOS through its last EOI. Reject bytes
      // after EOI, which are another possible metadata/tracking channel.
      let end = input.length - 2;
      if (input[end] !== 0xff || input[end + 1] !== 0xd9) error('JPEG ending is malformed');
      parts.push(input.slice(start, end + 2));
      scanSeen = true; break;
    }
    if ((marker >= 0xc0 && marker <= 0xcf) && ![0xc4, 0xc8, 0xcc].includes(marker)) {
      if (length < 8) error('Invalid JPEG frame');
      validateDimensions(be16(input, p + 5), be16(input, p + 3));
      frameSeen = true;
    }
    // Never pass APPn or COM data. This removes EXIF GPS, XMP, IPTC and
    // auxiliary previews; reject orientation tags needing pixel rotation.
    if (marker === 0xe1) {
      const orientation = exifOrientation(input.subarray(p + 2, p + length));
      if (orientation !== null && orientation !== 1) error('Rotate this photo before uploading so its private EXIF data can be removed');
    }
    if (!(marker >= 0xe0 && marker <= 0xef) && marker !== 0xfe) parts.push(input.slice(start, p + length));
    p += length;
  }
  if (!frameSeen || !scanSeen) error('Incomplete JPEG photo');
  return concatenate(parts);
}
function png(input: Uint8Array): Uint8Array {
  if (input.length < 8 || ![137,80,78,71,13,10,26,10].every((x, i) => input[i] === x)) error('Invalid PNG photo');
  const parts = [input.slice(0, 8)];
  let p = 8, seenHeader = false, seenData = false, seenEnd = false;
  const preserve = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS', 'gAMA', 'sRGB', 'cHRM', 'sBIT']);
  while (p < input.length) {
    if (p + 12 > input.length) error('Truncated PNG segment');
    const len = be32(input, p), name = fourcc(input, p + 4), next = p + 12 + len;
    if (len > MAX_BYTES || next > input.length) error('Invalid PNG segment');
    if (!seenHeader && (name !== 'IHDR' || len !== 13)) error('PNG header missing');
    if (name === 'IHDR') {
      if (seenHeader || len !== 13) error('Duplicate or invalid PNG header');
      validateDimensions(be32(input, p + 8), be32(input, p + 12));
      seenHeader = true;
    }
    if (name === 'IDAT') seenData = true;
    if (name === 'acTL' || name === 'fcTL' || name === 'fdAT') error('Animated photos are unsupported');
    if (!preserve.has(name) && name.charCodeAt(0) >= 65 && name.charCodeAt(0) <= 90)
      error('Unsupported PNG critical segment');
    if (preserve.has(name)) parts.push(input.slice(p, next));
    p = next;
    if (name === 'IEND') { if (len !== 0 || p !== input.length) error('Invalid PNG ending'); seenEnd = true; break; }
  }
  if (!seenHeader || !seenData || !seenEnd) error('Incomplete PNG photo');
  return concatenate(parts);
}
function webp(input: Uint8Array): Uint8Array {
  if (input.length < 20 || fourcc(input, 0) !== 'RIFF' || fourcc(input, 8) !== 'WEBP'
      || le32(input, 4) + 8 !== input.length) error('Invalid WebP photo');
  const parts: Uint8Array[] = [];
  let p = 12, imageSeen = false, extended = false;
  const keep = new Set(['VP8X', 'VP8 ', 'VP8L', 'ALPH']);
  while (p < input.length) {
    if (p + 8 > input.length) error('Truncated WebP chunk');
    const name = fourcc(input, p), length = le32(input, p + 4);
    const next = p + 8 + length + (length & 1);
    if (length > MAX_BYTES || next > input.length) error('Invalid WebP chunk');
    if (name === 'ANIM' || name === 'ANMF') error('Animated photos are unsupported');
    if (name === 'VP8X') {
      if (extended || length !== 10) error('Invalid WebP extended header');
      extended = true;
      validateDimensions(1 + input[p + 12] + (input[p + 13] << 8) + (input[p + 14] << 16),
        1 + input[p + 15] + (input[p + 16] << 8) + (input[p + 17] << 16));
      if (input[p + 8] & 0x02) error('Animated photos are unsupported');
      const header = input.slice(p, next);
      header[8] &= ~0x2c; // Clear ICC, EXIF and XMP presence flags.
      parts.push(header);
    } else if (keep.has(name)) {
      parts.push(input.slice(p, next));
      if (name === 'VP8 ' || name === 'VP8L') imageSeen = true;
    }
    p = next;
  }
  if (!imageSeen) error('WebP image data missing');
  const payload = concatenate(parts);
  const out = new Uint8Array(12 + payload.length);
  out.set(input.slice(0, 12));
  out.set(payload, 12);
  const size = out.length - 8;
  out[4] = size & 255; out[5] = (size >>> 8) & 255;
  out[6] = (size >>> 16) & 255; out[7] = (size >>> 24) & 255;
  return out;
}
export function sanitizeListingImage(bytes: ArrayBuffer): { bytes: ArrayBuffer; mime: SafeImageMime } {
  const input = new Uint8Array(bytes);
  if (!input.length || input.length > MAX_BYTES) error('Choose an image no larger than 5 MB');
  let out: Uint8Array, mime: SafeImageMime;
  if (input[0] === 0xff && input[1] === 0xd8) { out = jpeg(input); mime = 'image/jpeg'; }
  else if (input[0] === 137 && input[1] === 80 && input[2] === 78) { out = png(input); mime = 'image/png'; }
  else if (input[0] === 82 && input[1] === 73 && input[2] === 70 && input[3] === 70) { out = webp(input); mime = 'image/webp'; }
  else error('Unsupported or invalid photo format');
  // Create a fresh isolated ArrayBuffer, never return the original metadata bytes.
  return { bytes: out.slice().buffer, mime };
}
