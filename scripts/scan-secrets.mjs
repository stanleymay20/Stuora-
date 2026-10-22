// Fails if a provider secret or private key appears in tracked files or in a
// built bundle. Prints file and rule only — never the matched value.
import { execFileSync } from 'node:child_process';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const RULES = [
  ['Supabase secret/service key', /\bsb_secret_[A-Za-z0-9_-]{16,}/],
  ['JWT with service_role claim', /eyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]*c2VydmljZV9yb2xl[A-Za-z0-9_-]*\.[A-Za-z0-9_-]{10,}/],
  ['Groq API key', /\bgsk_[A-Za-z0-9]{40,}/],
  ['OpenAI-style key', /\bsk-(?:proj-)?[A-Za-z0-9_-]{32,}/],
  ['Google API key', /\bAIza[0-9A-Za-z_-]{35}\b/],
  ['GitHub token', /\bgh[pousr]_[A-Za-z0-9]{36,}\b/],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/],
  ['Private key block', /-----BEGIN (?:RSA |EC |OPENSSH |)PRIVATE KEY-----/],
  ['Secret in EXPO_PUBLIC variable', /EXPO_PUBLIC_[A-Z0-9_]*(?:SECRET|SERVICE_ROLE|API_KEY|TOKEN|APP_KEY)[A-Z0-9_]*\s*[=:]\s*['"]?[A-Za-z0-9_-]{12,}/],
];
const ALLOW = [/^package-lock\.json$/, /^scripts\/scan-secrets\.mjs$/, /^tests\/secret-scan\.test\.mjs$/];
const TEXT = /\.(m?[jt]sx?|json|md|ya?ml|sql|toml|env|html|css|txt|sh)$|(^|\/)\.env/;

function trackedFiles() {
  try { return execFileSync('git', ['ls-files', '-z'], { encoding: 'utf8' }).split('\0').filter(Boolean); }
  catch { return []; }
}
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    statSync(p).isDirectory() ? walk(p, out) : out.push(p);
  }
  return out;
}
export function scan(files, read = f => readFileSync(f, 'utf8')) {
  const findings = [];
  for (const file of files) {
    if (ALLOW.some(rx => rx.test(file)) || !TEXT.test(file)) continue;
    let text; try { text = read(file); } catch { continue; }
    for (const [rule, rx] of RULES) if (rx.test(text)) findings.push({ file, rule });
  }
  return findings;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const files = trackedFiles();
  if (existsSync('dist')) files.push(...walk('dist'));
  const findings = scan(files);
  for (const f of findings) console.error(`secret-scan: ${f.rule} in ${f.file}`);
  if (findings.length) { console.error(`secret-scan: ${findings.length} finding(s). Move secrets to Supabase Edge Function secrets.`); process.exit(1); }
  console.log(`secret-scan: ${files.length} files clean.`);
}
