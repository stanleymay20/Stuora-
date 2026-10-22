import {readFileSync,writeFileSync,mkdtempSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
export const STAGING_REF='uptjcspizukpjcoayhtn';
export const CORE=['confirmation','invite','magic_link','email_change','recovery','reauthentication'];
export const OPTIONAL=['password_changed_notification','email_changed_notification','phone_changed_notification','identity_linked_notification','identity_unlinked_notification','mfa_factor_enrolled_notification','mfa_factor_unenrolled_notification'];
const root=resolve('supabase/auth-branding');
export function preparePatch(includeOptional=false){
 const manifest=JSON.parse(readFileSync(join(root,'subjects.json'),'utf8'));
 if(manifest.brand!=='Stuora'||manifest.stagingOnly!==true||manifest.installed!==false)
   throw Error('Unreviewed brand manifest');
 const patch={};
 for(const key of [...CORE,...(includeOptional?OPTIONAL:[])]){
   const body=readFileSync(join(root,key+'.html'),'utf8');
   const subject=manifest.subjects[key];
   if(!subject?.startsWith('Stuora | ')||!body.includes('Stuora')||!body.includes('#7048FF')||/<script|https?:\/\/|supabase\.co/i.test(body))throw Error('Unsafe template '+key);
   if(['confirmation','invite','magic_link','email_change','recovery'].includes(key)&&!body.includes('{{ .ConfirmationURL }}'))throw Error('Missing secure link '+key);
   if(key==='reauthentication'&&!body.includes('{{ .Token }}'))throw Error('Missing security code');
   patch['mailer_subjects_'+key]=subject;
   patch['mailer_templates_'+key+'_content']=body;
 }
 return patch;
}
export function report(patch){
 return {project:STAGING_REF,fields:Object.keys(patch).sort(),sha256:createHash('sha256').update(JSON.stringify(patch)).digest('hex'),onlyTemplates:true};
}
export async function applyStaging({token,fetchImpl=fetch,optional=false}={}){
 if(!token||process.env.STUORA_AUTH_BRANDING_APPROVAL!=='STAGING_ONLY_APPROVED')
   throw Error('Explicit staging-only approval and secure Supabase management token are required');
 const patch=preparePatch(optional);
 const url='https://api.supabase.com/v1/projects/'+STAGING_REF+'/config/auth';
 const headers={'Authorization':'Bearer '+token,'Content-Type':'application/json'};
 const before=await fetchImpl(url,{headers,signal:AbortSignal.timeout(20000)});
 if(!before.ok)throw Error('Could not read staging Auth settings; no writes');
 const config=await before.json();
 if(!config||typeof config!=='object')throw Error('Invalid Auth configuration response');
 const old={};
 for(const key of Object.keys(patch))if(Object.hasOwn(config,key))old[key]=config[key];
 const backupFolder=mkdtempSync(join(tmpdir(),'stuora-auth-backup-'));
 const backupPath=join(backupFolder,'staging-before.json');
 writeFileSync(backupPath,JSON.stringify({project:STAGING_REF,previous:old}),{mode:0o600,flag:'wx'});
 const modified=await fetchImpl(url,{method:'PATCH',headers,body:JSON.stringify(patch),signal:AbortSignal.timeout(20000)});
 if(!modified.ok)throw Error('Staging Auth PATCH failed; backup at '+backupPath);
 const after=await fetchImpl(url,{headers,signal:AbortSignal.timeout(20000)});
 if(!after.ok)throw Error('Auth readback failed; inspect backup at '+backupPath);
 const readback=await after.json();
 for(const [key,value] of Object.entries(patch)){
   if(readback[key]!==value)throw Error('Readback mismatch at '+key+'; backup at '+backupPath);
 }
 return {...report(patch),backupPath,readback:'verified'};
}
async function cli(){
 const args=process.argv.slice(2);
 if(args.some(x=>!['--plan','--apply-staging','--include-security-notifications'].includes(x)))throw Error('Unknown option');
 const optional=args.includes('--include-security-notifications');
 const result=args.includes('--apply-staging')
   ? await applyStaging({token:process.env.SUPABASE_ACCESS_TOKEN,optional})
   : {...report(preparePatch(optional)),mode:'dry-run: no network'};
 console.log(JSON.stringify(result,null,2));
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url))
 cli().catch(error=>{console.error(error instanceof Error?error.message:'Staging Auth rollout error');process.exitCode=1;});
