import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const root='supabase/auth-branding/';
const subjects=JSON.parse(readFileSync(root+'subjects.json','utf8')).subjects;
const rows=[["confirmation","link"],["invite","link"],["magic_link","link"],["email_change","link"],["recovery","link"],["reauthentication","otp"],["password_changed_notification","notice"],["email_changed_notification","notice"],["phone_changed_notification","notice"],["identity_linked_notification","notice"],["identity_unlinked_notification","notice"],["mfa_factor_enrolled_notification","notice"],["mfa_factor_unenrolled_notification","notice"]];
test('13 Stuora email templates use exact safe Go Auth variables',()=>{
 assert.equal(rows.length,13);
 assert.deepEqual(Object.keys(subjects).sort(),rows.map(([key])=>key).sort());
 for(const [key,type] of rows){
  const body=readFileSync(root+key+'.html','utf8');
  assert.match(subjects[key],/^Stuora \|/);
  assert.match(body,/<html lang="en">/);
  assert.match(body,/>Stuora</);
  assert.match(body,/#7048FF/);
  assert.doesNotMatch(body,/supabase|https?:\/\/|<script|<img|javascript:/i);
  if(type==='link'){assert.match(body,/href="{{ \.ConfirmationURL }}"/);assert.doesNotMatch(body,/{{ \.Token }}/);}
  if(type==='otp'){assert.match(body,/{{ \.Token }}/);assert.doesNotMatch(body,/{{ \.ConfirmationURL }}/);}
  if(type==='notice')assert.doesNotMatch(body,/{{ \.ConfirmationURL }}|{{ \.Token }}/);
 }
});
test('authentication UI maps errors rather than showing provider strings',()=>{
 const ui=readFileSync('src/account/AccountPanel.tsx','utf8');
 assert.match(ui,/stuoraAuthError\(result\.error/);
 assert.doesNotMatch(ui,/setIssue\(result\.error\.message\)/);
});

test('canonical vector mark mirrors the three ribbon shapes and gradients from the app',()=>{
 const svg=readFileSync('assets/stuora-mark.svg','utf8');
 const tsx=readFileSync('src/ui/Brand.tsx','utf8');
 const paths=["M13 18L48 4Q57 1 57 11V19Q57 23 52 25L20 37Q7 40 7 28V26Q7 20 13 18Z","M12 39L44 27Q57 23 57 36V40Q57 44 51 47L17 61Q7 65 7 54V47Q7 42 12 39Z","M7 26Q7 18 16 21L50 34Q57 37 57 44Q57 49 49 47L15 34Q7 31 7 26Z"];
 for(const d of paths){assert.ok(svg.includes(d));assert.ok(tsx.includes(d));}
 for(const color of ['#7348FF','#19BAEF','#A744F8','#6645FA']){
  assert.ok(svg.includes(color));assert.ok(tsx.includes(color));
 }
 assert.match(svg,/viewBox="0 0 64 64"/);
});
