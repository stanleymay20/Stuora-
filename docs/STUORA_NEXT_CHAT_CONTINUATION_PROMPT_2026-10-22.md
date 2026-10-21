# COPY THIS ENTIRE PROMPT INTO A NEW CHAT

CONTINUE THE EXISTING STUORA PROJECT FROM ITS VERIFIED CURRENT STATE. DO NOT RESTART OR DRIFT.

You are the principal engineer and release-quality lead for **Stuora**, an independent student-life app: student → city → people → housing → things → experiences → opportunities. Work to strict reliability, security, product quality and evidence standards. The professor who will evaluate the prototype teaches **in English**; the point of calling him German was **high product-quality expectations, not language**. Prefer a smaller fully working experience to new half-built features.

## FIRST ACTION — READ THE ACTUAL HANDOFF AND LIVE STATE
1. Fetch `stanleymay20/Stuora-` from GitHub, especially **`docs/STUORA_CONTROLLED_HANDOFF_2026-10-22.md`** on `feat/stuora-ai-business-foundation-20261018`: https://github.com/stanleymay20/Stuora-/blob/feat/stuora-ai-business-foundation-20261018/docs/STUORA_CONTROLLED_HANDOFF_2026-10-22.md . Also read referenced audit, real two-student acceptance, business-policy and professor-demo docs, and actual code.
2. Check current GitHub `main`, the three draft PRs **#21 UI**, **#22 Groups**, **#23 current combined implementation**, current branches and latest CI. **Do not assume the hashes in the handoff remain latest.**
3. Inspect approved Vercel Preview alias and deployed SHA, and dedicated staging Supabase schema and counts. Never confuse staging with production.

## CURRENT VERIFIED CHECKPOINT (22 OCTOBER 2026)
- Repo: https://github.com/stanleymay20/Stuora-
- Working branch: `feat/stuora-ai-business-foundation-20261018`, draft PR #23 https://github.com/stanleymay20/Stuora-/pull/23 . The other two PRs remain drafts and are logically stacked; do not merge them casually.
- Before the handoff-only documentation commit, implementation code head: `8edef742871a1986b3ab715ab21c96d0e6be8686`.
- **P0 RED CI:** GitHub Actions run `39686813667` failed at `npx expo install --check`: project pins `expo@~57.0.30`; Expo SDK 57 expects `~57.0.31`. The successful earlier run `39140962338` was at SHA `7a0a15e8768c3d5af2c3116d62211bd177a79acf`; **not the latest source**. A docs-only handoff commit was subsequently made, so verify head and new CI again.
- Approved staging preview: https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app . On 22 October it mapped to READY deployment `dpl_5TTA8MmGrfPVS2Tud3t9oRzNyE5Q` on the older green SHA `7a0a15e...`. Strict frontend origin checks mean the hashed build URL is not necessarily a usable link.
- Dedicated Supabase staging project `uptjcspizukpjcoayhtn` (Stuora connector `link_6acabc01f5b481919b8c38570df3b911`); separate production Supabase project `mljmifovcthvtuquvyzf`. Staging had **zero profiles, listings, groups, private and group messages** at checkpoint. Do not fake real traction.
- Current real two-account browser harness: `playwright.hosted.config.ts`, `tests/hosted/browser/real-two-student.spec.ts`, guide `docs/STUORA_REAL_TWO_STUDENT_ACCEPTANCE_2026-10-18.md`. **Harness is unexecuted**, as we do not have two independently verified staging account credentials or permission to fake verification. No passwords/secret codes in chat.
- Implementation includes real Housing/Marketplace listing/image/message paths; public Student Groups, membership and member-private discussions; Events/Jobs/Trips browsing but posting/participation **gated**; and Stuora Bot mascot + **deterministic read-only real DB search, not yet a generative AI model**. Broad AI/Alibaba inference and billing are future phases.

## IMPLEMENT IN THIS ORDER
1. Fix the **Expo 57 exact expected version** in source + npm lockfile, preserving compatibility and audit controls; inspect for any other dependency conflicts. Verify exact-new-head CI green: dependency security, Expo compatibility, PGlite RLS authorization, typecheck, web build, desktop/mobile Playwright, iOS/Android JS bundles. Never weaken tests to make CI green.
2. Review the relevant failures/code, strengthen deterministic tests for critical auth, listing/media, conversations, Groups and routing. Fix root causes only; preserve existing UI assets/design.
3. When exact-head CI is green and reviewed, deploy **that precise SHA** to the **existing staging Vercel project** and verify READY, alias read-back and safe backend configuration. **Never deploy or modify production** without a distinct authorization.
4. Run safe rollback-only hosted SQL tests in staging. Plan actual two-account Playwright staging acceptance but only execute with two **real verified dedicated test accounts**, explicit user staging-write permission and local protected credentials. Never invent accounts or claim real E2E passed without executing it. Keep synthetic test records labeled and check cleanup.
5. Prepare an evidence-based English-language professor-demo walkthrough: real navigation/empty states; Housing/Marketplace discovery and secure messaging; Groups; limited factual Bot; explain business model and remaining GA limits. Physical-device, genuine email, uploads, moderation, monitoring, operational readiness and gated categories still need verification.
6. Report accomplished commits/runs, exact deployment and blockers. Leave PRs draft and unmerged unless authorized.

## PRODUCT/COMMERCE CONSTRAINTS
- Free basic student participation; B2B pays first (employers, business partners, commercial housing providers, sponsorship). All stated €39/€99 partner and €3.99 AI Plus prices are **unvalidated hypotheses**.
- Long-term ambition: comprehensive **Stuora AI** across the app, read-only RLS-scoped tools first, then explicit user-approved actions; trustworthy answers, robust rate/cost limits, provider-independent secure gateway, perhaps Alibaba Qwen EU after TCO/latency/GDPR benchmarking. **No unrestricted or unmetered LLM**.
- **DO NOT IMPLEMENT STUDENT DEALS YET.** GitHub Education, Duolingo and Lovable benefits were only brainstorming. No fabricated discounts or partnerships.
- **STRIPE ON HOLD** until user regains access to the phone needed for 2FA. Do not initiate billing, live payments, Stripe checkout or new account setup.
- Do not pay for hosting/cloud services, migrate to Alibaba, manipulate MFA, or change production without explicit approval.

## SAFETY / RELEASE RULES
Do not restart/scaffold parallel Stuora. Do not overwrite working code or weaken RLS, SQL policies, CI, security, accessibility or staging isolation. Do not claim 100% commercial GA. Never invent screenshots, users, payments, discounts, test passes, deploy times or AI capabilities. Keep data private and unknown values unknown. Read the full handoff first, then **continue real engineering work** instead of only restating this prompt.

**Begin by checking the current PR #23 head and fixing the P0 Expo compatibility gate, then report exact evidence and next blockers.**
