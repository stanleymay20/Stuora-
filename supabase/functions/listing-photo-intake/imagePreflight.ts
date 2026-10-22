// Early, bounded dimension checks: reject oversized encoded-image headers
// BEFORE passing attacker-controlled bytes to ImageMagick WASM. These are not
// a substitute for the post-decode checks or the hosted runtime limits.
import { MAX_INPUT_BYTES, MediaRejection } from "./core.ts";
export const MAX_DECODED_PIXELS = 16_000_000;
export const MAX_IMAGE_SIDE = 8192;
export type ImageHeader = { format: 'jpeg'|'png'|'webp'; width: number; height: number };

const bad = (code = "INVALID_IMAGE"): never => {
  throw new MediaRejection(code, 422, "Invalid or unsupported image data");
};
const typeAt = (v: Uint8Array, n: number, type: string): boolean =>
  n + type.length <= v.length && Array.from(type).every((c, i) => v[n + i] === c.charCodeAt(0));
const u16be = (a: Uint8Array, n: number) => (a[n] << 8) | a[n+1];
const u16le = (a: Uint8Array, n: number) => a[n] | (a[n+1] << 8);
const u24le = (a: Uint8Array, n: number) => a[n] + (a[n+1] << 8) + (a[n+2] << 16);
const u32be = (a: Uint8Array, n: number) => a[n]*16777216 + a[n+1]*65536 + a[n+2]*256 + a[n+3];
const u32le = (a: Uint8Array, n: number) => a[n] + a[n+1]*256 + a[n+2]*65536 + a[n+3]*16777216;
function checked(format: ImageHeader['format'], width: number, height: number): ImageHeader {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1 ||
      width > MAX_IMAGE_SIDE || height > MAX_IMAGE_SIDE || width * height > MAX_DECODED_PIXELS)
    return bad("DIMENSIONS");
  return { format, width, height };
}
function png(raw: Uint8Array): ImageHeader {
  if (raw.length < 45 || u32be(raw, 8) !== 13 || !typeAt(raw,12,'IHDR')) return bad();
  const header = checked('png',u32be(raw,16),u32be(raw,20));
  // The apng animation extension must not be silently reduced to one frame.
  let pos = 8, gotData = false;
  while(pos + 12 <= raw.length){
    const length = u32be(raw,pos);
    const end = pos + length + 12;
    if(end > raw.length) return bad();
    if(typeAt(raw,pos+4,'acTL') || typeAt(raw,pos+4,'fcTL') || typeAt(raw,pos+4,'fdAT'))
      return bad('ANIMATED');
    if(typeAt(raw,pos+4,'IDAT')) { gotData = true; break; }
    if(typeAt(raw,pos+4,'IEND')) return bad();
    pos=end;
  }
  if(!gotData) return bad();
  return header;
}
function jpeg(raw: Uint8Array): ImageHeader {
  let pos=2;
  while(pos < raw.length) {
    if(raw[pos++] !== 255) return bad();
    while(pos < raw.length && raw[pos] === 255) pos++;
    if(pos >= raw.length) return bad();
    const marker = raw[pos++];
    if(marker === 0 || marker === 0xda || marker === 0xd9) return bad();
    if(marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    if(pos + 2 > raw.length) return bad();
    const len = u16be(raw,pos);
    if(len < 2 || pos + len > raw.length) return bad();
    const isFrame=(marker >= 0xc0 && marker <= 0xcf &&
      ![0xc4,0xc8,0xcc].includes(marker));
    if(isFrame){
      if(len < 8 || raw[pos+2] !== 8) return bad(); // 8-bit photos only
      return checked('jpeg',u16be(raw,pos+5),u16be(raw,pos+3));
    }
    pos+=len;
  }
  return bad();
}
function webp(raw: Uint8Array): ImageHeader {
  if(raw.length < 30 || !typeAt(raw,8,'WEBP') ||
    u32le(raw,4)+8 !== raw.length) return bad();
  let pos=12;
  let width=0,height=0, identified=false;
  while(pos+8 <= raw.length) {
    const size=u32le(raw,pos+4);
    const start=pos+8,end=start+size;
    if(end>raw.length || end+(size%2)>raw.length) return bad();
    const code=String.fromCharCode(...raw.subarray(pos,pos+4));
    if(code==='ANIM' || code==='ANMF') return bad('ANIMATED');
    if(code==='VP8X') {
      if(size<10 || (raw[start]&0x02)!==0) return bad('ANIMATED');
      width=1+u24le(raw,start+4); height=1+u24le(raw,start+7); identified=true;
    } else if(!identified && code==='VP8L') {
      if(size<5 || raw[start]!==0x2f) return bad();
      width=1+raw[start+1]+((raw[start+2]&0x3f)<<8);
      height=1+(raw[start+2]>>6)+(raw[start+3]<<2)+((raw[start+4]&0x0f)<<10);
      identified=true;
    } else if(!identified && code==='VP8 ') {
      if(size<10 || raw[start+3]!==0x9d || raw[start+4]!==0x01 || raw[start+5]!==0x2a) return bad();
      width=u16le(raw,start+6)&0x3fff; height=u16le(raw,start+8)&0x3fff; identified=true;
    }
    pos=end+(size%2);
  }
  if(!identified || pos!==raw.length) return bad();
  return checked('webp',width,height);
}
export function inspectImageHeader(raw: Uint8Array): ImageHeader {
  if (!(raw instanceof Uint8Array) || !raw.length || raw.length > MAX_INPUT_BYTES)
    throw new MediaRejection('SIZE_LIMIT',413,'Photo exceeds the 5 MB upload limit');
  if (raw.length >= 8 &&
    [137,80,78,71,13,10,26,10].every((n,i)=>raw[i]===n)) return png(raw);
  if (raw.length >= 4 && raw[0]===255 && raw[1]===216) return jpeg(raw);
  if (raw.length >= 12 && typeAt(raw,0,'RIFF')) return webp(raw);
  throw new MediaRejection('UNSUPPORTED',415,'Only JPEG, PNG and WebP are supported');
}
