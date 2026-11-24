import { expect, test } from '@playwright/test';
import { sanitizeListingImage } from '../../src/listings/mediaSanitizer';

const tinyPng = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9Zuz0AAAAASUVORK5CYII=', 'base64');
const bytes = (buffer: Buffer) => buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength) as ArrayBuffer;
const strip = (buffer: Buffer) => sanitizeListingImage(bytes(buffer));
const chunk = (name: string, data: Buffer) => Buffer.concat([
  Buffer.from([0, 0, 0, data.length]),
  Buffer.from(name, 'ascii'), data, Buffer.alloc(4),
]);

test('PNG metadata is removed, while IHDR IDAT and IEND pixel chunks remain unchanged', () => {
  const label = Buffer.from('GPSLatitude=52.5200; GPSLongitude=13.4050', 'utf8');
  // A metadata tEXt chunk is intentionally inserted before IDAT. Its CRC is
  // immaterial because this entire chunk must be removed before upload.
  const input = Buffer.concat([tinyPng.subarray(0, 33), chunk('tEXt', label), tinyPng.subarray(33)]);
  const safe = strip(input);
  expect(safe.mime).toBe('image/png');
  expect(Buffer.from(safe.bytes)).toEqual(tinyPng);
  expect(Buffer.from(safe.bytes).includes(label)).toBe(false);
  expect(input.includes(label)).toBe(true);
});

test('forged MIME, invalid image bytes and animated or truncated PNG fail closed', () => {
  expect(() => strip(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">evil</svg>'))).toThrow(/unsupported|invalid/i);
  expect(() => strip(Buffer.from('not-an-image'))).toThrow(/unsupported|invalid/i);
  expect(() => strip(tinyPng.subarray(0, tinyPng.length - 5))).toThrow(/truncated|incomplete|invalid/i);
  const animated = Buffer.concat([tinyPng.subarray(0, 33), chunk('acTL', Buffer.alloc(8)), tinyPng.subarray(33)]);
  expect(() => strip(animated)).toThrow(/animated/i);
  expect(() => strip(Buffer.alloc(5 * 1024 * 1024 + 1))).toThrow(/5 MB/i);
});

test('JPEG strips APP1 EXIF/XMP payloads but preserves compressed image segments', () => {
  const segment = (marker: number, payload: Buffer) =>
    Buffer.concat([Buffer.from([0xff, marker, (payload.length + 2) >>> 8, (payload.length + 2) & 255]), payload]);
  const frame = segment(0xc0, Buffer.from([8, 0, 1, 0, 1, 1, 1, 0x11, 0]));
  const scan = segment(0xda, Buffer.from([1, 1, 0, 0, 0x3f, 0]));
  const gps = Buffer.concat([
    Buffer.from([0x45,0x78,0x69,0x66,0,0,0x49,0x49,0x2a,0,8,0,0,0,0,0,0,0,0,0]),
    Buffer.from('GPSLatitude=12.345,67.890', 'utf8'),
  ]);
  const input = Buffer.concat([
    Buffer.from([0xff, 0xd8]),
    segment(0xe1, gps), frame, scan, Buffer.from([0, 1, 2, 0xff, 0xd9]),
  ]);
  const clean = strip(input);
  expect(clean.mime).toBe('image/jpeg');
  expect(Buffer.from(clean.bytes).includes(gps)).toBe(false);
  expect(Buffer.from(clean.bytes).includes(frame)).toBe(true);
  expect(Buffer.from(clean.bytes).subarray(-2)).toEqual(Buffer.from([0xff, 0xd9]));
});

test('WebP strips GPS-bearing EXIF and corrects RIFF size', () => {
  const riffChunk = (type: string, data: Buffer) => Buffer.concat([
    Buffer.from(type, 'ascii'),
    Buffer.from([data.length & 255, (data.length >>> 8) & 255, 0, 0]),
    data,
    ...(data.length % 2 ? [Buffer.alloc(1)] : []),
  ]);
  const payload = Buffer.from('GPSLatitude=55.75', 'utf8');
  const image = riffChunk('VP8 ', Buffer.alloc(4));
  const exif = riffChunk('EXIF', payload);
  const body = Buffer.concat([image, exif]);
  const original = Buffer.concat([Buffer.from('RIFF', 'ascii'), Buffer.from([body.length + 4, 0, 0, 0]), Buffer.from('WEBP'), body]);
  const clean = strip(original);
  const cleaned = Buffer.from(clean.bytes);
  expect(clean.mime).toBe('image/webp');
  expect(cleaned.includes(payload)).toBe(false);
  expect(cleaned.includes(Buffer.from('EXIF'))).toBe(false);
  expect(cleaned.readUInt32LE(4)).toBe(cleaned.length - 8);
});
