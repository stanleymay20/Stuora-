# Stuora floating 3D-style Bot — controlled UI slice (2026-10-22)

**Branch:** `feat/stuora-ai-business-foundation-20261018` (draft PR #23). This is **not** a production/GA release; do not merge or deploy against failed exact-head CI.

## Intent and precise technical scope

- Replace the existing **two top-header bot buttons** with **one** lower-right floating launcher for the **same** `StuoraBotOverlay`; preserve existing search implementation, navigation, error handling, request limits and read-only backend/RLS behavior.
- Reuse the existing approved bundled 3D-*styled* mascot `assets/stuora-bot.webp`. The UI adds a lightweight animated bob and layered orb/shadow effect. This is **not a true 3D GL/Three.js model**, new generative AI capability, animation SDK, live agent, or new cloud dependency.
- The single Pressable keeps the established `Open Stuora Bot` accessibility label and a truthful beta hint. Animation honors the OS reduced-motion setting; if unavailable, remain static.
- Position **above mobile bottom navigation**, inside the application's safe-area shell, at bottom-right on desktop. Do **not** obstruct Create/publish forms, Messages composer or Profile/authentication forms: launcher appears on Home and Explore only. The existing full-screen Bot modal retains its close action and category navigation.

## Acceptance & verification

- `tests/web/bot.spec.ts`: floating launcher is present exactly once on Home and Explore, within viewport bounds, above mobile bottom navigation, retains correct Bot open/close, vanishes on Create, Messages and Profile, and does not cause horizontal document overflow. Runs on desktop and mobile-web CI projects.
- Existing deterministic search tests must continue to pass: housing filters/price, jobs empty states, public groups scope, and category navigation. Modal search still uses only public real database records.
- Manual proof needed before demo: mouse/keyboard/touch interaction, reduced-motion preference, narrow 320px and wider screens, keyboard-open state, physical iOS/Android, screen reader labeling, and the **approved exact-SHA** hosted staging preview.
- A passing mocked browser suite does **not** prove a real two-account hosted login, listing media, messages, or group membership. Those retain issue #25.
- Expo SDK compatibility issue #24 remains a hard failing CI gate until a compatible published package/lockfile update passes. No staging alias promotion until all checks are green.

**Explicitly unchanged:** Supabase schema/data/RLS, billing/Stripe, student deals, Qwen/OpenAI integrations, business model, job/event/trip publishing, production and all three PR merge states.
