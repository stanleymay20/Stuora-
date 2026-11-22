import { createConnection } from 'node:net';

export const MAX_SCAN_BYTES = 5_242_880;
export const CLAMD_CHUNK_BYTES = 64 * 1024;

/** ClamAV's documented zINSTREAM protocol. No PDF is ever written to disk.
 * This runs ONLY behind an authenticated internal HTTPS gateway.
 */
export function scanWithClamd(bytes, {
  host = '127.0.0.1',
  port = 3310,
  timeoutMs = 12_000,
} = {}) {
  if (!(bytes instanceof Uint8Array) || bytes.byteLength < 16 ||
      bytes.byteLength > MAX_SCAN_BYTES)
    return Promise.reject(new Error('Invalid scanner payload'));
  if (!Number.isInteger(port) || port < 1 || port > 65535 ||
      !Number.isFinite(timeoutMs) || timeoutMs < 1000 || timeoutMs > 30_000)
    return Promise.reject(new Error('Invalid ClamAV configuration'));

  return new Promise((resolve, reject) => {
    const socket = createConnection({ host, port });
    let settled = false;
    let response = Buffer.alloc(0);
    const finish = (error, verdict) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      if (error) reject(error); else resolve(verdict);
    };
    socket.setTimeout(timeoutMs, () => finish(new Error('ClamAV scan timed out')));
    socket.once('connect', () => {
      try {
        socket.write(Buffer.from('zINSTREAM\0', 'utf8'));
        for (let start=0; start<bytes.byteLength; start += CLAMD_CHUNK_BYTES) {
          const chunk = Buffer.from(bytes.subarray(start,start+CLAMD_CHUNK_BYTES));
          const length = Buffer.alloc(4);
          length.writeUInt32BE(chunk.byteLength);
          socket.write(length);
          socket.write(chunk);
        }
        socket.write(Buffer.alloc(4)); // terminates INSTREAM
      } catch { finish(new Error('ClamAV stream rejected')); }
    });
    socket.on('data', chunk => {
      if (settled) return;
      response = Buffer.concat([response,chunk]);
      if (response.length > 2048) return finish(new Error('ClamAV response too long'));
      const end = response.indexOf(0);
      if (end === -1) return;
      const line = response.subarray(0,end).toString('utf8').trim();
      if (line === 'stream: OK') return finish(null,'clean');
      if (/^stream: [^\r\n\x00]{1,256} FOUND$/.test(line))
        return finish(null,'malicious');
      // Unexpected clamd responses (including errors and size-limit failures)
      // always fail closed rather than pretending to be clean.
      finish(new Error('ClamAV returned no verifiable verdict'));
    });
    socket.on('error',()=>finish(new Error('ClamAV connection unavailable')));
    socket.on('close',()=> {
      if(!settled) finish(new Error('ClamAV response incomplete'));
    });
  });
}
