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


## Stuora Bot 2.0 — layered, blinking vector mascot (follow-on implementation)

The user reported that the first launcher still looked like a **cropped static picture**. New code on draft PR #23 replaces the **launcher artwork only** with an independently animated, fully vector-drawn transparent character. This does not upgrade the read-only deterministic Bot into a generative assistant.

### Actual implementation
- `src/ai/AnimatedStuoraMascot.tsx` is a layered, scalable, full-body 2.5D vector rig built with **existing** `react-native-svg` and React Native `Animated`. It depicts a white/blue/purple robot, dark visor, independently drawn glowing eyes, head fins, hands, hover engine and elliptical ground shadow. No new animation library, image CDN or runtime dependency.
- Independent animations: body floats up to 6px on a 3.6-second loop, eyes visibly blink by narrowing the eye layer at staggered intervals (including a double blink), one waving arm gently rotates, body breathes slightly, and the shadow scales/changes opacity.
- All motion is disabled when the operating system requests reduced motion or before its preference is known. Animations stop and clean up when the launcher is unmounted/hidden.
- `src/ai/FloatingStuoraBot.tsx` now renders the entire transparent rig with `overflow: visible`, not a circular `Image` cropped to 67×67; it preserves the single stationary, accessible `Pressable`, readable `Ask Stuora` / `SEARCH BETA` and current Home/Explore visibility restrictions.
- The full-screen `StuoraBotOverlay` and its search queries, limits, error handling and public-result restrictions are unchanged. It retains an older static header avatar, which can be swapped in a separately reviewed improvement.
- The newly generated full-body concept served as design reference; the rig is an original vector approximation, **not** a textured 3D object or the concept image automatically rigged into limbs.

### Release and acceptance
- `tests/web/bot.spec.ts` now checks the presence of real SVG body/eye/arm/shadow layers, lack of a launcher `img`, visible uncropped bounds and an actual independent eye squish/blink on desktop and mobile web. All earlier navigation, modal, RLS-scoped search and positioning regressions must keep passing.
- Still require **exact-head CI**: clean `npm ci`, dependency security, backend isolation, PGlite RLS, TypeScript, web export, desktop/mobile Playwright, native JS bundles and `npx expo install --check`.
- Preview origin lock remains exact: only `https://stuora-preview-git-fix-ga-recover-ca508b-stanleymay20s-projects.vercel.app` is approved with staging Supabase `uptjcspizukpjcoayhtn`. New branch aliases can load blank deliberately. Promote staging alias only after verifying the reviewed build and keep production unchanged.
- Physical iOS/Android device motion, screen reader and real two-user hosted acceptance remain **unverified** until actually exercised; do not call commercial GA.
