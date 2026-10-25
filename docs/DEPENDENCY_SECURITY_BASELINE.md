# Dependency security baseline

Baseline date: 2026-10-12. Base application commit: `ca147bd94da1cb8bc432ddfa687565bcf40a1a1b`.

## Result

`npm audit --omit=dev` reports 22 package nodes (7 moderate, 15 high, 0 critical), but they collapse to three upstream advisory roots in the Expo/Metro/Xcode build-tool graph:

- `GHSA-vfj7-8cjw-p6xm` — `braces` stack-exhaustion denial of service through deeply nested patterns.
- `GHSA-86w9-cpqp-85rv` — `node-forge` RSA PKCS#1 v1.5 signature-verification parsing issue.
- `GHSA-w5hq-g745-h8pq` — `uuid` buffer bounds issue in v3/v5/v6 when a buffer is supplied.

The inherited package nodes are restricted to Expo/Metro/React-Native CLI/config/build dependencies: `@expo/cli`, `@expo/code-signing-certificates`, `@expo/config`, `@expo/config-plugins`, `@expo/inline-modules`, `@expo/local-build-cache-provider`, `@expo/metro`, `@expo/metro-config`, `@expo/prebuild-config`, `@react-native/community-cli-plugin`, `@react-native/virtualized-lists`, `braces`, `expo`, `metro`, `metro-config`, `metro-file-map`, `metro-transform-worker`, `micromatch`, `node-forge`, `react-native`, `uuid`, and `xcode`.

No Supabase, Auth, Storage, application-domain or payment package appears as an independent advisory root in this audit.

## Why the findings are not force-fixed

A normal `npm audit fix --package-lock-only` makes no dependency change. npm only offers `--force` resolutions that downgrade the supported stack to Expo 44 and React Native 0.72. Those changes are incompatible with the current Expo SDK 57 / React Native 0.86 application and are therefore rejected.

At audit time, the repository resolves `braces` 3.0.3 and `node-forge` 1.4.0; the earlier registry investigation recorded these as the latest stable releases; this is a dated observation, not a continuing guarantee. `uuid` has a patched 11.1.1 line, but the current `xcode` package declares `uuid ^7.0.3`; forcing 11.x would violate the parent's declared dependency contract. No unsupported override is accepted without upstream compatibility evidence plus the full Stuora verification gate.

## Compensating controls

- Builds use a committed lockfile and Node 22.13.0.
- Expo package compatibility is checked on every CI run.
- Application runtime code does not accept user-controlled Metro glob patterns, invoke Expo code-signing certificate verification, or call the xcode build parser.
- Production artifacts are generated in controlled CI/deployment environments rather than exposing Metro/Expo CLI services to public users.
- `scripts/audit-production.mjs` runs in normal Stuora CI. It permits only the exact package-node/advisory baseline above, rejects all critical findings, and fails if a new vulnerable package or advisory root appears.
- Upstream dependency upgrades must still pass strict TypeScript, database authorization, browser contracts, web export and iOS/Android exports before merge.

## Release decision

These three upstream build-tool advisories are a documented temporary risk acceptance, not a claim that the packages are vulnerability-free. Commercial GA remains blocked if a new application/runtime vulnerability appears, if a critical advisory is reported, or if upstream publishes a compatible fix that has not yet been evaluated. The baseline should be revisited on every Expo SDK update and whenever npm reports a new advisory root.

## Gate validation

`security/production-audit-baseline.json` records the observed npm audit v2 report as an upper bound. The checker rejects process/registry errors, missing data, inconsistent counts, critical or increased per-package severity, higher advisory CVSS, new advisory identity, changed direct exposure, new vulnerable installation paths, changed package-to-advisory edges and dangling/unrooted chains. Package, path and advisory removals and severity reductions are accepted. Changed advisory affected ranges require review. Failure-path regression tests run before the live audit. No baseline is regenerated automatically. CI checks out the exact PR head; all existing Expo, database, TypeScript, browser and native gates remain mandatory.

## Addendum 2026-10-25: `zod` via `@expo/cli` (GHSA-mrhx-c7xc-m3w5)

- **Advisory:** Zod can exhaust memory when validating oversized constrained collections (high, CVSS 7.5, affected `<4.6.6`). It has no patched 3.x release.
- **Path:** `expo@57.0.31 → @expo/cli@57.0.32 → zod@3.25.76` (`node_modules/zod`, transitive, not direct). The latest Expo CLI (58.1.15) still declares `zod ^3.25.76`.
- **Exposure:** build-time only.
  - Stuora's source never imports `zod`.
  - The exported web bundle contains no Zod code: a search for `ZodError` in `dist/` returns 0 hits.
  - The Expo CLI parses local project configuration, not untrusted network input.
- **Why not force-fixed:**
  - Overriding to Zod 4 would change the major API under `@expo/cli`.
  - `npm audit fix --force` would downgrade Expo.
  - Neither is acceptable without upstream support.
- **Decision:** accepted as one more exact baseline entry. Only `zod` at `node_modules/zod` and this one advisory are allowed, and the `@expo/cli → zod` edge is added. Every other rule still fails CI: new packages, paths or advisories, higher severity or CVSS, any critical finding.
- **Remove this entry** as soon as Expo ships a CLI that depends on a patched Zod.

The live audit today reports 5 findings, against an upper bound of 23. The original `braces` and `uuid` chains are no longer present.
