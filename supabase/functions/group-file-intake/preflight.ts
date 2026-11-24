// Small, dependency-free intake preflight helpers. Header checks are NOT
// antivirus scanning; PDF uploads must remain pending_review.
const MAX_RAW_BYTES = 5_242_880;
export function safeOriginalName(input: string): string {
  return input.replace(/[\\/\r\n\x00-\x1f\x7f"<>:|?*\u202a-\u202e\u2066-\u2069]/g, '_')
    .trim().slice(0, 100);
}
export function downloadableName(name: string, contentType: 'application/pdf'|'image/webp') {
  const safe = safeOriginalName(name);
  if (contentType === 'application/pdf') return safe;
  return safe.replace(/\.[^.]+$/, '').slice(0, 90) + '.webp';
}
export function plausiblePdfHeader(data: Uint8Array): boolean {
  if(data.length < 16 || data.length > MAX_RAW_BYTES) return false;
  for(const [i,character] of [...'%PDF-'].entries())
    if(data[i] !== character.charCodeAt(0)) return false;
  // Only format recognition, never clearance for download.
  return new TextDecoder().decode(data.subarray(Math.max(0,data.length-2048))).includes('%%EOF');
}
