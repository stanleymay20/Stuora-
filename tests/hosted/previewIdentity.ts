import { execFileSync } from 'node:child_process';

/** Only immutable previews of the dedicated Stuora Vercel project qualify.
 * A human/operator must independently read the matching deployed Git SHA
 * from the Vercel deployment record before supplying it. This checks
 * provenance consistency but DOES NOT itself query the Vercel API.
 */
export function validateApprovedPreview(input: {
  previewUrl?: string;
  deploymentSha?: string;
  checkedOutSha?: string;
}): string | null {
  const { previewUrl, deploymentSha, checkedOutSha } = input;
  if (!previewUrl || !deploymentSha || !checkedOutSha) return null;
  try {
    const u = new URL(previewUrl);
    if (u.protocol !== 'https:' || previewUrl !== u.origin || u.port ||
      u.username || u.password || u.pathname !== '/' || u.search || u.hash ||
      !/^stuora-preview-[a-z0-9]+-stanleymay20s-projects\.vercel\.app$/.test(u.hostname)) return null;
    if (!/^[a-f0-9]{40}$/.test(deploymentSha) ||
      !/^[a-f0-9]{40}$/.test(checkedOutSha) ||
      deploymentSha !== checkedOutSha) return null;
    return u.origin;
  } catch { return null; }
}

export function approvedPreviewFromEnvironment(env: NodeJS.ProcessEnv = process.env): string | null {
  if (env.STUORA_STAGING_ACCEPTANCE !== 'I_APPROVE_STAGING_TEST_WRITES') return null;
  const head = execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8', stdio:['ignore','pipe','ignore']}).trim();
  return validateApprovedPreview({
    previewUrl: env.STUORA_STAGING_PREVIEW_URL,
    deploymentSha: env.STUORA_VERIFIED_DEPLOYMENT_SHA,
    checkedOutSha: head,
  });
}
