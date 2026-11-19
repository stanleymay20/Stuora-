# Dependency security baseline

Baseline date: 2026-11-19 (Expo 57.0.33, expo-image-picker 57.0.21). Previous baseline: 2026-10-12, 22 package nodes (7 moderate, 15 high) from `braces`, `node-forge` and `uuid`; all of those are resolved by the Expo patch upgrade.

## Result

`npm audit --omit=dev` reports 3 package nodes (3 moderate, 0 high, 0 critical) from one upstream advisory root:

- `GHSA-g3hv-75wg-m249` — `minimatch` (>=7.0.0 <11.0.1) denial of service via glob-pattern amplification, reached only through `expo -> @expo/fingerprint -> minimatch`.

`@expo/fingerprint` hashes project files at build time. It is not part of the shipped app bundle, and the app never passes user-controlled glob patterns to it.

## Why the finding is not force-fixed

npm offers only `--force` resolutions that downgrade the Expo SDK. Overriding `minimatch` beneath `@expo/fingerprint` would break that package's declared dependency range. The finding is accepted until Expo ships a compatible update.

## Compensating controls

- Builds use a committed lockfile and Node 22.13.0.
- Expo package compatibility is checked on every CI run.
- Application runtime code does not accept user-controlled Metro glob patterns, invoke Expo code-signing certificate verification, or call the xcode build parser.
- Production artifacts are generated in controlled CI/deployment environments rather than exposing Metro/Expo CLI services to public users.
- `scripts/audit-production.mjs` runs in normal Stuora CI. It permits only the exact package-node/advisory baseline above, rejects all critical findings, and fails if a new vulnerable package or advisory root appears.
- Upstream dependency upgrades must still pass strict TypeScript, database authorization, browser contracts, web export and iOS/Android exports before merge.

## Release decision

This upstream build-tool advisory is a documented temporary risk acceptance, not a claim that the packages are vulnerability-free. Commercial GA remains blocked if a new application/runtime vulnerability appears, if a critical advisory is reported, or if upstream publishes a compatible fix that has not yet been evaluated. The baseline should be revisited on every Expo SDK update and whenever npm reports a new advisory root.

## Gate validation

`security/production-audit-baseline.json` records the observed npm audit v2 report as an upper bound. The checker rejects process/registry errors, missing data, inconsistent counts, critical or increased per-package severity, higher advisory CVSS, new advisory identity, changed direct exposure, new vulnerable installation paths, changed package-to-advisory edges and dangling/unrooted chains. Package, path and advisory removals and severity reductions are accepted. Changed advisory affected ranges require review. Failure-path regression tests run before the live audit. No baseline is regenerated automatically. CI checks out the exact PR head; all existing Expo, database, TypeScript, browser and native gates remain mandatory.
