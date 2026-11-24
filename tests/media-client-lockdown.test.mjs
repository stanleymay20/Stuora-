import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,readdirSync} from 'node:fs';
import {join} from 'node:path';
function list(dir){return readdirSync(dir,{withFileTypes:true}).flatMap(f=>f.isDirectory()?list(join(dir,f.name)):/\.[tj]sx?$/.test(f.name)?[join(dir,f.name)]:[]);}
test('Client never uploads untrusted media directly to public Storage',()=>{
 for(const path of list('src')) {
  const code=readFileSync(path,'utf8');
  assert.doesNotMatch(code,/\.storage\.from\(['"]listing-media['"]\)\.upload\s*\(/,'Untrusted storage upload in '+path);
 }
 const listing=readFileSync('src/listings/ListingWorkspace.tsx','utf8');
 assert.doesNotMatch(listing,/ImagePicker|sanitizeListingImage|addPhoto\s*\(/);
 assert.match(listing,/Photo uploads are temporarily paused/);
});
test('Trusted image Edge write release gate remains disabled',()=>{
 assert.match(readFileSync('supabase/functions/listing-photo-intake/releaseGate.ts','utf8'),/TRUSTED_MEDIA_WRITES_COMPILED_IN = false/);
 assert.match(readFileSync('.github/workflows/ci.yml','utf8'),/media-client-lockdown\.test\.mjs/);
});
