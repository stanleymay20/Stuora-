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
