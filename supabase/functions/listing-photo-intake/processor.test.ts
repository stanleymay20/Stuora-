// Actual ImageMagick WASM codec checks, NOT a hosted Edge CPU/memory certification.
import { strict as assert } from "node:assert";
import { ImageMagick, MagickFormat } from "npm:@imagemagick/magick-wasm@0.0.44";
import { assertCleanWebp, decodeAndEncode, OUTPUT_MAX_SIDE } from "./processor.ts";
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
function listWebpChunks(data:Uint8Array):string[] {
  const names:string[]=[];let i=12;
  while(i<data.length){
    const name=new TextDecoder().decode(data.subarray(i,i+4));
    const size=data[i+4]+data[i+5]*256+data[i+6]*65536+data[i+7]*16777216;
    names.push(name);i+=8+size+(size%2);
  }
  assert.equal(i,data.length);return names;
}
function riff(...chunks:Uint8Array[]):Uint8Array {
  const body=concat(new TextEncoder().encode('WEBP'),...chunks);
  const size=body.length;
  return concat(new TextEncoder().encode('RIFF'),Uint8Array.of(size&255,(size>>8)&255,(size>>16)&255,(size>>>24)&255),body);
}
function webpChunk(name:string,data:Uint8Array):Uint8Array {
  const n=data.length;
  return concat(new TextEncoder().encode(name),Uint8Array.of(n&255,(n>>8)&255,(n>>16)&255,(n>>>24)&255),data,n%2?Uint8Array.of(0):new Uint8Array());
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
Deno.test("real PNG decode removes EXIF-like GPS tEXt and stores clean WebP",()=>{
  const input=metadataInput();
  assert.equal(inspectImageHeader(input).format,"png");
  const result=decodeAndEncode(input);
  assert.equal(result.mime,"image/webp");
  assert.deepEqual(inspectImageHeader(result.data),{format:"webp",width:1,height:1});
  const outputText=new TextDecoder('latin1').decode(result.data);
  assert.ok(!outputText.includes("GPSLatitude"));
  for (const name of listWebpChunks(result.data)) assert.ok(["VP8 ","VP8L","VP8X","ALPH"].includes(name), name);
});
Deno.test("real JPEG decode strips EXIF and auto-orients dimensions",async ()=>{
  const wide=await createPixelPng(2,1);
  const scaled=magickTranscode(wide,MagickFormat.Jpeg);
  const tagged=exifRotate(scaled);
  assert.deepEqual(inspectImageHeader(tagged),{format:'jpeg',width:2,height:1});
  const result=decodeAndEncode(tagged);
  assert.deepEqual(inspectImageHeader(result.data),{format:'webp',width:1,height:2});
  assert.ok(!listWebpChunks(result.data).includes("EXIF"));
});
Deno.test("real WebP decoder round-trips as clean WebP without metadata",()=>{
  const input=magickTranscode(png,MagickFormat.WebP);
  assert.equal(inspectImageHeader(input).format,"webp");
  const result=decodeAndEncode(input);
  assert.equal(result.mime,"image/webp");
  assert.equal(inspectImageHeader(result.data).format,"webp");
  for (const name of listWebpChunks(result.data)) assert.ok(!["EXIF","XMP ","ICCP"].includes(name));
});
Deno.test("gen-3 N-06: a real photograph is stored smaller than its JPEG and capped at 1600 px",async ()=>{
  const photo=await Deno.readFile(new URL("../../../assets/berlin-skyline.jpg",import.meta.url));
  const result=decodeAndEncode(photo);
  const header=inspectImageHeader(result.data);
  assert.equal(header.format,"webp");
  assert.ok(Math.max(header.width,header.height)<=OUTPUT_MAX_SIDE);
  assert.ok(result.data.length<photo.length,`webp ${result.data.length} >= jpeg ${photo.length}`);
});
Deno.test("output guard rejects WebP that announces or carries metadata or animation",()=>{
  const vp8=webpChunk('VP8 ',new Uint8Array(10));
  const vp8x=(flags:number)=>webpChunk('VP8X',Uint8Array.of(flags,0,0,0,0,0,0,0,0,0));
  assert.ok(assertCleanWebp(riff(vp8)));
  assert.ok(assertCleanWebp(riff(vp8x(0x10),webpChunk('ALPH',new Uint8Array(4)),vp8)));
  const rejected=[
    riff(vp8,webpChunk('EXIF',new TextEncoder().encode('GPS'))),
    riff(webpChunk('XMP ',new Uint8Array(4)),vp8),
    riff(webpChunk('ICCP',new Uint8Array(4)),vp8),
    riff(vp8x(0x08),vp8),
    riff(vp8x(0x02),vp8),
    riff(vp8x(0x20),vp8),
    riff(webpChunk('ANIM',new Uint8Array(6)),vp8),
    riff(webpChunk('ALPH',new Uint8Array(4))),
    concat(riff(vp8),Uint8Array.of(0)),
  ];
  for(const value of rejected) assert.throws(()=>assertCleanWebp(value),{code:'BAD_OUTPUT'});
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

Deno.test("PNG preflight rejects animation data even after first IDAT",()=>{
  const finalChunk=png.subarray(png.length-12);
  const preceding=png.subarray(0,png.length-12);
  const lateAnimation=[
    chunk('acTL',Uint8Array.of(0,0,0,2,0,0,0,0)),
    chunk('fcTL',new Uint8Array(26)),
    chunk('fdAT',new Uint8Array(8)),
  ];
  for(const animation of lateAnimation){
    const payload=concat(preceding,animation,finalChunk);
    assert.throws(()=>inspectImageHeader(payload),{code:'ANIMATED'});
    assert.throws(()=>decodeAndEncode(payload),{code:'ANIMATED'});
  }
});
Deno.test("PNG preflight requires complete IEND, rejects trailing bytes, duplicate IHDR and nonconsecutive IDAT",()=>{
  const iend=png.subarray(png.length-12);
  const preceding=png.subarray(0,png.length-12);
  const checks=[
    png.subarray(0,png.length-1),
    concat(png,Uint8Array.of(0)),
    concat(preceding,chunk('IHDR',Uint8Array.of(...Array(13).fill(0))),iend),
    concat(preceding,chunk('tEXt',new TextEncoder().encode('Comment' + String.fromCharCode(0) + 'after IDAT')),
      chunk('IDAT',Uint8Array.of(0)),iend),
  ];
  for(const payload of checks){
    assert.throws(()=>inspectImageHeader(payload));
    assert.throws(()=>decodeAndEncode(payload));
  }
});
Deno.test("PNG preflight keeps legitimate post-IDAT metadata, which the real decoder strips",()=>{
  const comment=new TextEncoder().encode('StudentGPS=0;NeverPersist');
  const withMetadata=concat(png.subarray(0,png.length-12),
    chunk('tEXt',concat(new TextEncoder().encode('Comment' + String.fromCharCode(0)),comment)),png.subarray(png.length-12));
  assert.deepEqual(inspectImageHeader(withMetadata),{format:'png',width:1,height:1});
  const processed=decodeAndEncode(withMetadata);
  assert.ok(!new TextDecoder().decode(processed.data).includes('NeverPersist'));
  assert.ok(listWebpChunks(processed.data).every(name => ['VP8 ','VP8L','VP8X','ALPH'].includes(name)));
});
Deno.test("PNG preflight caps adversarial chunk counts before WASM decoding",()=>{
  const many=new Array<Uint8Array>(10_001).fill(chunk('tEXt',new Uint8Array()));
  const payload=concat(png.subarray(0,33),...many,png.subarray(33));
  assert.throws(()=>inspectImageHeader(payload),{code:'STRUCTURE_LIMIT'});
  assert.throws(()=>decodeAndEncode(payload),{code:'STRUCTURE_LIMIT'});
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
