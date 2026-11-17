# Android preview 0.1.2

Targeted integration of reviewed messaging and recovery protections from the published product branch, preserving 0.1.1's profile consent RPC, privacy defaults and safe-area layout. This is not a wholesale product-branch merge or schema reconciliation.

Fixed listing-to-conversation ID handoff; per-thread draft/history resets; stale-send completion guards; recent-first, pageable message history; automatic isolated recovery landing; explicit recovery completion/Continue action; strict native callback route/parameter validation; invalid/expired-link guidance. Raw photo creation code and upload controls are removed. Text-only listings remain supported; existing media read/removal remains. Staging's compiled-off photo processor and protected policies are unchanged.

Validation: 57 Node tests including four native-parser contracts pass. Five isolated mocked native callback probes pass. The full browser suite passed 58 cases; after final recovery-flow changes, all 16 focused recovery/messaging scenarios pass again. TypeScript and production web export pass. APK signature, staging key, version, callback strings, archive integrity and ARM64 packaging are checked before handoff. Device acceptance remains pending.

Native callbacks continue using the existing implicit-token flow with strict parsing; PKCE/state-binding work requires separate reconciliation and qualification. Dependency security gate findings remain unresolved. Block/report UI and full branch/schema integration remain open. This internal candidate is not a public-release or GA claim.

Package com.stuora.app.preview; version 0.1.2/code 3. Uses the same internal signing certificate as 0.1.1, so an in-place update is expected. Earlier 0.1.0 has a different certificate. No production, password, GISMA rule, migration or Edge activation changes.
