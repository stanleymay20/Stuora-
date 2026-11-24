'use strict';
// Deterministic offline rendering of the approved Stuora mark, no binary blobs,
// network calls or extra NPM dependencies. Generated files are ignored by git.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),zlib=require('node:zlib');
const root=path.join(__dirname,'..'),vectorFile=path.join(root,'assets/stuora-mark.svg');
const outDir=path.join(root,'assets/generated-stuora'),size=1024,aa=2;
const ribbons=[
 ['blue','M13 18L48 4Q57 1 57 11V19Q57 23 52 25L20 37Q7 40 7 28V26Q7 20 13 18Z'],
 ['blue','M12 39L44 27Q57 23 57 36V40Q57 44 51 47L17 61Q7 65 7 54V47Q7 42 12 39Z'],
 ['purple','M7 26Q7 18 16 21L50 34Q57 37 57 44Q57 49 49 47L15 34Q7 31 7 26Z']
];
const stops={blue:['#7348FF','#19BAEF'],purple:['#A744F8','#6645FA']};
function polygon(d){
 const tokens=d.match(/[MLQHVZ]|-?\d+(?:\.\d+)?/g);if(!tokens)throw Error('Invalid Stuora path');
 let i=0,x=0,y=0,start=null;const out=[];
 const num=()=>{const v=Number(tokens[i++]);if(!Number.isFinite(v))throw Error('Invalid coordinate');return v;};
 const point=(a,b)=>{x=a;y=b;out.push([x,y]);};
 while(i<tokens.length){
  const t=tokens[i++];
  if(t==='M'||t==='L'){point(num(),num());if(t==='M')start=[x,y];}
  else if(t==='H')point(num(),y);
  else if(t==='V')point(x,num());
  else if(t==='Q'){
   const cx=num(),cy=num(),ex=num(),ey=num(),ox=x,oy=y;
   for(let k=1;k<=24;k++){const t=k/24,a=1-t;out.push([a*a*ox+2*a*t*cx+t*t*ex,a*a*oy+2*a*t*cy+t*t*ey]);}
   x=ex;y=ey;
  }else if(t==='Z'){if(start)out.push(start);}
  else throw Error('Unsupported Stuora vector command');
 }
 return out;
}
const rgb=s=>[1,3,5].map(i=>parseInt(s.slice(i,i+2),16));
const crcTable=Uint32Array.from({length:256},(_,i)=>{let c=i;for(let j=0;j<8;j++)c=(c>>>1)^((c&1)?0xedb88320:0);return c>>>0;});
function chunk(name,bytes){
 const len=Buffer.alloc(4);len.writeUInt32BE(bytes.length);
 const payload=Buffer.concat([Buffer.from(name,'ascii'),bytes]);let sum=0xffffffff;
 for(const b of payload)sum=crcTable[(sum^b)&255]^(sum>>>8);
 const crc=Buffer.alloc(4);crc.writeUInt32BE((sum^0xffffffff)>>>0);
 return Buffer.concat([len,payload,crc]);
}
function png(data,channels){
 const stride=size*channels,scan=Buffer.alloc(size*(stride+1));
 for(let y=0;y<size;y++)data.copy(scan,y*(stride+1)+1,y*stride,(y+1)*stride);
 const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size,0);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=channels===4?6:2;
 return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',zlib.deflateSync(scan,{level:9})),chunk('IEND',Buffer.alloc(0))]);
}
function render({fraction,background,transparent}){
 const side=size*aa,src=Buffer.alloc(side*side*4);
 if(background){const c=rgb(background);for(let i=0;i<src.length;i+=4){src[i]=c[0];src[i+1]=c[1];src[i+2]=c[2];src[i+3]=255;}}
 const scale=side*fraction/64,center=side/2;
 for(const [tone,d] of ribbons){
  const poly=polygon(d).map(([x,y])=>[center+(x-32)*scale,center+(y-32)*scale]);
  const xs=poly.map(p=>p[0]),ys=poly.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
  const [lo,hi]=stops[tone].map(rgb);
  for(let y=Math.max(0,Math.floor(minY));y<Math.min(side,Math.ceil(maxY));y++){
   const crossings=[],scan=y+0.5;
   for(let i=0;i<poly.length-1;i++){
    const [ax,ay]=poly[i],[bx,by]=poly[i+1];
    if((ay<=scan&&by>scan)||(by<=scan&&ay>scan))crossings.push(ax+(scan-ay)*(bx-ax)/(by-ay));
   }
   crossings.sort((a,b)=>a-b);
   for(let i=0;i+1<crossings.length;i+=2){
    for(let x=Math.max(0,Math.floor(crossings[i]));x<Math.min(side,Math.ceil(crossings[i+1]));x++){
     const t=Math.max(0,Math.min(1,((x-minX)/Math.max(1,maxX-minX)+(y-minY)/Math.max(1,maxY-minY))/2));
     const dest=(y*side+x)*4;
     for(let c=0;c<3;c++)src[dest+c]=Math.round(lo[c]*(1-t)+hi[c]*t);
     src[dest+3]=255;
    }
   }
  }
 }
 const channels=transparent?4:3,out=Buffer.alloc(size*size*channels);
 for(let y=0;y<size;y++)for(let x=0;x<size;x++){
  const sums=[0,0,0,0];
  for(let yy=0;yy<aa;yy++)for(let xx=0;xx<aa;xx++){
   const at=(((y*aa+yy)*side)+(x*aa+xx))*4;
   for(let c=0;c<4;c++)sums[c]+=src[at+c];
  }
  const dest=(y*size+x)*channels;
  for(let c=0;c<channels;c++)out[dest+c]=Math.round(sums[c]/(aa*aa));
 }
 return png(out,channels);
}
function generate(){
 const svg=fs.readFileSync(vectorFile,'utf8');
 for(const [,d] of ribbons)if(!svg.includes(d))throw Error('Stuora source ribbon mismatch');
 for(const c of Object.values(stops).flat())if(!svg.includes(c))throw Error('Stuora source gradient mismatch');
 const hash=crypto.createHash('sha256').update(svg).update(fs.readFileSync(__filename)).digest('hex');
 const stamp=path.join(outDir,'.source-sha256');
 const outputs=['icon.png','adaptive-foreground.png','splash-icon.png'];
 if(fs.existsSync(stamp)&&fs.readFileSync(stamp,'utf8')===hash&&outputs.every(x=>fs.existsSync(path.join(outDir,x))))return outputs.map(x=>path.join(outDir,x));
 fs.mkdirSync(outDir,{recursive:true});
 const options=[
  ['icon.png',{fraction:0.87,background:'#17152F',transparent:false}],
  ['adaptive-foreground.png',{fraction:0.67,transparent:true}],
  ['splash-icon.png',{fraction:0.45,transparent:true}]
 ];
 for(const [name,opts] of options){const target=path.join(outDir,name);fs.writeFileSync(target+'.tmp',render(opts));fs.renameSync(target+'.tmp',target);}
 fs.writeFileSync(stamp,hash);
 return outputs.map(x=>path.join(outDir,x));
}
if(require.main===module)console.log(generate());
module.exports={generate};
