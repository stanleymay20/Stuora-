import { downloadableName, safeOriginalName, plausiblePdfHeader } from './preflight.ts';

function assert(condition: unknown,message='Assertion failed'): asserts condition {
  if(!condition)throw new Error(message);
}
Deno.test('safe student file names cannot contain traversal or header spoofing',()=>{
  const name=safeOriginalName('../Bad\\path\r\nX-Thing: 1.pdf');
  assert(!/[\\/\r\n:]/.test(name));
  assert(safeOriginalName('a\u202Eexe.pdf').includes('_'));
});
Deno.test('normalized photo filename must represent the actual trusted WebP bytes',()=>{
  assert(downloadableName('Holiday.JPEG','image/webp')==='Holiday.webp');
  assert(downloadableName('notes.pdf','application/pdf')==='notes.pdf');
});
Deno.test('PDF preflight is not antivirus approval',()=>{
  const good=new TextEncoder().encode('%PDF-1.7\n1 0 obj\n%%EOF\n');
  const wrong=new TextEncoder().encode('fake document with %%EOF');
  const missing=new TextEncoder().encode('%PDF-1.7\n1 0 obj\nendobj');
  assert(plausiblePdfHeader(good));
  assert(!plausiblePdfHeader(wrong));
  assert(!plausiblePdfHeader(missing));
  assert(!plausiblePdfHeader(new Uint8Array(5_242_881)));
});
