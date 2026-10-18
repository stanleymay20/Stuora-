# Stuora — AI and commercial execution programme
**Date:** 2026-10-18 · **Status:** planning and a limited read-only Bot pilot on a draft PR, **NOT commercial GA**.

## Product position

Stuora's core student-life services remain free: browse and post ordinary Housing/Marketplace listings, apply for available jobs once verified, join public Groups, and participate in student communities. Do not charge students simply to contact landlords, join groups or apply for work.

**Business principle:** capture value from verified commercial outcomes and B2B services. Avoid selling access to private student data. Sponsored rankings must be clearly labeled and separated from organic results; no deceptive scarcity, fictional listings, fake students, ratings or endorsements.

## Proposed revenue experiments (not prices in production)

1. Local business partner tools: €39/month **hypothesis**; verify lead value, churn and partner support effort through 5–10 pilots first.
2. Growth-tier partner tools: €99/month **hypothesis**; additional reporting/placement only after fraud review.
3. Employers: €79–199 per time-limited promotion **hypothesis**, never payment to apply.
4. Professional property-provider workspace: €49–149/month **hypothesis**, with listings authenticity, fraud controls and German rental law/compliance review.
5. Optional Stuora AI Plus: €3.99/month **hypothesis**, with hard per-user quotas and actual model unit-cost measurement. Free AI search must remain useful.

**None of these are active subscriptions.** No Stripe products, checkout pages, API keys, app-store IAP or real payments are enabled in this PR. Do not invent merchant partnerships or savings figures.

## Infrastructure migration away from free tiers

- Vercel hosting: separately qualify a paid commercial plan with domain, CDN, env/secret separation, previews, rollback, error tracking and uptime checks. Vercel Hobby cannot be treated as the final commercial deployment tier.
- Supabase: verify paid plan sizing, retained backups, PITR requirements, Auth and storage quotas, region, email deliverability, cost alarms and security advisors. Dedicated staging and production projects must stay isolated.
- Transactional mail provider: domain verification, SPF/DKIM/DMARC, sign-up/recovery acceptance, bounce and complaint handling.
- Monitoring: alert on auth failures, read/write errors, CDN, failed deployments, API traffic and AI request cost, never log tokens, full private messages or sensitive contents.
- Payment processing: only after legal entity, billing terms, EU VAT, invoices, refunds, cancellation, German consumer protection and iOS/Android in-app purchase rules are reviewed. Do not create live products or take payments without explicit owner approval.

**Initial engineering budget envelope:** €300–€1,000/month is a planning range to validate, not a purchased plan or operating forecast. Track exact usage per service and pause expansion if actual spend exceeds the approved ceiling.

## Stuora Bot: phased architecture and controls

### Delivered as the first slice in this PR
- Original generated Stuora Bot mascot bundled, including desktop and mobile navigation entry.
- Deterministic read-only natural-language-ish search, NOT general generative AI; real RLS-scoped listings and public group metadata only.
- Server-side database filters for city, active status and price in Housing/Marketplace; never mock real offers. Users choose a category explicitly before acting.
- Clear zero-result and error states; per-open session request cap, fixed response sizes, request timeouts.
- No private messages, email addresses, profiles, payment accounts, or unrestricted user content sent to third-party models.
- Browser E2E tests for real-result queries, no fake jobs, and no private group reads.

### Next controlled implementation slice (NOT active in this PR)
- Authenticated Supabase Edge Function AI gateway, secrets stored only server-side in dedicated staging environment. Never ship model API credentials in an EXPO_PUBLIC_ variable or browser source.
- LLM makes no direct SQL/administrative calls; typed, allowlisted tools query through authenticated user's RLS context. Server rejects instructions from listings and untrusted pages.
- Cost and abuse protection in durable server-side ledger: authenticated user quota, tokens per request, rate limiting including retries/concurrent requests, per-day budget, global model spend cap, idempotency, audit without private-message content.
- Generate helpful summaries grounded in returned record IDs only; validate destinations on server and client; handle unknown/stale results honestly.
- Require clear student approval before creating listings, publishing groups, sending messages, applying to jobs, booking trips, financial purchases, or contacting third parties. No payments automated by the assistant.
- Prompt injection, data-exfiltration, CSRF/CORS, authorization, privacy, usability and actual cost-load testing across web, iOS and Android.
- Publish beta transparency, language limitations, data retention and model-provider terms.

### Future improvements gated by verified product flows
- CV/document help with explicit opt-in upload, deletion and rights; multilingual explanations, student budgeting and planning.
- Assistance navigating legitimate events, trips and local services, with results from trusted real sources.
- Student Savings verified programme: **research only. Do not implement or modify deals, provider discounts, coupons, sponsorship claims or administration in this phase.**

## Release and operational gates

- Always branch from reviewed, current Stuora code and verify exact-head CI.
- Pass typecheck, database authorization, Expo web/native exports, desktop and mobile-web Playwright; attach actual run/commit SHA.
- Test connected AI query behavior against empty staging and real synthetic fixtures; no live production user PII.
- Stage-specific preview may be deployed only after CI green and review of URL origins and database project.
- Production stays unchanged. No branch merges, subscription activation, plan purchase or offers/deals implementation without separate sign-off.

## Business KPIs to implement before monetization

Student success: weekly active students, successful housing/job leads, meaningful group participation, verified completed interactions, retention.
B2B: authentic partner campaigns, qualified opportunities, conversion and paid renewal (not vanity impressions).
Cost: infra cost per weekly active student, AI request cost/task, fraud/support workload, gross margin by revenue stream.
Human administration: partner verification queue, safety/moderation appeals, abuse resolution and GDPR requests.

**Current verdict:** Bot search beta is code under review, comprehensive generative AI, merchant payments and commercial operating readiness remain gated.
