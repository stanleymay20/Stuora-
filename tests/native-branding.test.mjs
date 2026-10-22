import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,statSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {generate}=require('../scripts/generate-stuora-native-icons.cjs');
test('native branding generated from approved Stuora vector with correct PNG dimensions',()=>{
 const paths=generate();
 assert.equal(paths.length,3);
 for(const p of paths){
  assert.ok(statSync(p).size>1024);
  const b=readFileSync(p);
  assert.deepEqual([...b.subarray(0,8)],[137,80,78,71,13,10,26,10]);
  assert.equal(b.readUInt32BE(16),1024);
  assert.equal(b.readUInt32BE(20),1024);
 }
 assert.equal(readFileSync(paths[0])[25],2); // opaque RGB icon, no transparency
 assert.equal(readFileSync(paths[1])[25],6); // transparent adaptive PNG
 assert.equal(readFileSync(paths[2])[25],6); // transparent splash PNG
});
test('Expo config points iOS and Android to Stuora icon assets',()=>{
 const app=JSON.parse(readFileSync('app.json','utf8')).expo;
 assert.equal(app.icon,'./assets/generated-stuora/icon.png');
 assert.equal(app.ios.icon,app.icon);
 assert.equal(app.android.adaptiveIcon.foregroundImage,'./assets/generated-stuora/adaptive-foreground.png');
 assert.equal(app.android.adaptiveIcon.backgroundColor,'#17152F');
 assert.match(readFileSync('app.config.js','utf8'),/generate\(\)/);
});
