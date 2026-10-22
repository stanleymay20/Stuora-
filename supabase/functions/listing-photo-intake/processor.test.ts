// Actual ImageMagick WASM codec checks, NOT a hosted Edge CPU/memory certification.
import { strict as assert } from "node:assert";
import { ImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.44";
import { decodeAndEncode } from "./processor.ts";
import { inspectImageHeader } from "./imagePreflight.ts";
import { STAGING_API_URL, TRUSTED_MEDIA_WRITES_COMPILED_IN, trustedMediaWriteGate } from "./releaseGate.ts";


const be32=(n:number)=>Uint8Array.of((n>>>24)&255,(n>>>16)&255,(n>>>8)&255,n&255);
function crc(bytes:Uint8Array):number {
  let value=0xffffffff;
  for(const b of bytes) {
    value^=b;
    for(let i=0;i<8;i++) value=(value>>>1)^((value&1)?0xedb88320:0);
  }
  return (value^0xffffffff)>>>0;
}
function concat(...parts:Uint8Array[]):Uint8Array {
  const all=new Uint8Array(parts.reduce((n,p)=>n+p.length,0));
  let offset=0;for(const p of parts){all.set(p,offset);offset+=p.length;}return all;
}
function chunk(name:string,data:Uint8Array):Uint8Array {
  const body=concat(Uint8Array.from(name,c=>c.charCodeAt(0)),data);
  return concat(be32(data.length),body,be32(crc(body)));
}
// Build a standards-conformant RGBA PNG (valid deflate checksum and PNG CRCs).
// Old 1x1 base64 fixtures in mock tests fail libpng's actual zlib checksum.
async function createPixelPng(width=1,height=1):Promise<Uint8Array> {
  const scanline=new Uint8Array(height*(1+4*width)); // RGBA, filter None
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const pos=y*(1+4*width)+1+x*4;
    scanline.set(Uint8Array.of(255,0,0,0),pos); // transparent red pixel
  }
  const compressor=new CompressionStream('deflate');
  const readCompressed=new Response(compressor.readable).arrayBuffer();
  const writer=compressor.writable.getWriter();
  await writer.write(scanline);
  await writer.close();
  const compressed=new Uint8Array(await readCompressed);
  const signature=Uint8Array.of(137,80,78,71,13,10,26,10);
  const ihdr=concat(be32(width),be32(height),Uint8Array.of(8,6,0,0,0));
  return concat(signature,chunk('IHDR',ihdr),chunk('IDAT',compressed),chunk('IEND',new Uint8Array()));
}
const png=await createPixelPng();
function metadataInput():Uint8Array {
  const marker=new TextEncoder().encode("GPSLatitude=52.5200;GPSLongitude=13.4050");
  return concat(png.slice(0,33),chunk("tEXt",concat(new TextEncoder().encode("Comment\0"),marker)),png.slice(33));
}
function listChunks(data:Uint8Array):string[] {
  const names:string[]=[];let i=8;
  while(i<data.length){
    const len=new DataView(data.buffer,data.byteOffset+i,4).getUint32(0);
    const name=new TextDecoder().decode(data.subarray(i+4,i+8));
    names.push(name);i+=len+12;
  }
  assert.equal(i,data.length);return names;
}
function exifRotate(jpeg:Uint8Array):Uint8Array {
  const tiff=Uint8Array.of(
    0x49,0x49,0x2a,0,8,0,0,0,1,0,
    0x12,0x01,3,0,1,0,0,0,6,0,0,0,
    0,0,0,0);
  const payload=concat(new TextEncoder().encode("Exif\0\0"),tiff);
  const size=payload.length+2;
  return concat(jpeg.subarray(0,2),Uint8Array.of(255,225,size>>8,size&255),payload,jpeg.subarray(2));
}
function magickTranscode(source:Uint8Array,target:MagickFormat):Uint8Array {
  return ImageMagick.read(source,img=>img.write(target,bytes=>Uint8Array.from(bytes)));
}
Deno.test("real PNG decode removes EXIF-like GPS tEXt from the stored output bytes",()=>{
  const input=metadataInput();
  assert.equal(inspectImageHeader(input).format,"png");
  const result=decodeAndEncode(input);
  assert.equal(result.mime,"image/png");
  assert.deepEqual(inspectImageHeader(result.data),{format:"png",width:1,height:1});
  const outputText=new TextDecoder('latin1').decode(result.data);
  assert.ok(!outputText.includes("GPSLatitude"));
  assert.ok(!listChunks(result.data).includes("tEXt"));
  assert.ok(!listChunks(result.data).includes("eXIf"));
});
Deno.test("real JPEG decode strips EXIF and auto-orients dimensions",async ()=>{
  const wide=await createPixelPng(2,1);
  const scaled=magickTranscode(wide,MagickFormat.Jpeg);
  const tagged=exifRotate(scaled);
  assert.deepEqual(inspectImageHeader(tagged),{format:'jpeg',width:2,height:1});
  const result=decodeAndEncode(tagged);
  assert.deepEqual(inspectImageHeader(result.data),{format:'png',width:1,height:2});
  assert.ok(!listChunks(result.data).includes("eXIf"));
});
Deno.test("real WebP decoder round-trips as a PNG without WebP metadata",()=>{
  const input=magickTranscode(png,MagickFormat.WebP);
  assert.equal(inspectImageHeader(input).format,"webp");
  const result=decodeAndEncode(input);
  assert.equal(result.mime,"image/png");
  assert.equal(inspectImageHeader(result.data).format,"png");
  assert.ok(!listChunks(result.data).includes("eXIf"));
});
Deno.test("invalid magic, truncated PNG, forged oversized PNG and truncated JPEG fail before decoding",()=>{
  const badDimensions=png.slice(); badDimensions.set(be32(10000),16);
  const probes=[Uint8Array.of(60,115,118,103),png.slice(0,12),badDimensions,
    Uint8Array.of(255,216,255,218),new Uint8Array(0)];
  for(const value of probes) assert.throws(()=>inspectImageHeader(value));
  for(const value of probes) assert.throws(()=>decodeAndEncode(value));
});
Deno.test("animated WebP and animated PNG headers fail before WASM",()=>{
  const vp8x=concat(new TextEncoder().encode('RIFF'),be32(0),new TextEncoder().encode('WEBPVP8X'),
    Uint8Array.of(10,0,0,0,2,0,0,0,0,0,0,0,0,0));
  // WebP RIFF header size is little-endian, 18 bytes following RIFF.
  vp8x.set(Uint8Array.of(vp8x.length-8,0,0,0),4);
  assert.throws(()=>inspectImageHeader(vp8x),{code:'ANIMATED'});
  const apng=concat(png.slice(0,33),chunk('acTL',Uint8Array.of(0,0,0,2,0,0,0,0)),png.slice(33));
  assert.throws(()=>inspectImageHeader(apng),{code:'ANIMATED'});
});

Deno.test("staging Edge build is immutable-disabled regardless of activation secrets",()=>{
  assert.equal(TRUSTED_MEDIA_WRITES_COMPILED_IN,false);
  for (const activation of [undefined,"STAGING_APPROVED","PRODUCTION"]) {
    for (const origin of [undefined,"https://stuora-preview-acez6tl63-stanleymay20s-projects.vercel.app"]) {
      assert.equal(trustedMediaWriteGate(activation,STAGING_API_URL,origin),false);
      assert.equal(trustedMediaWriteGate(activation,"https://mljmifovcthvtuquvyzf.supabase.co",origin),false);
    }
  }
});
