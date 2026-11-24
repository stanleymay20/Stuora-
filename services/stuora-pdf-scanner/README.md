# Stuora PDF scanner service — self-hosting proposal, not deployed

This service is a small, dependency-free Node 22 HTTP bridge to a **real ClamAV clamd daemon** using the documented `zINSTREAM\0` protocol. It is supplied as a source-code candidate for the disabled `group-file-pdf-scan` Edge worker. The service **does not exist on any live hostname**. No private student documents are being transferred or scanned.

## Contract

`POST /v1/scan-pdf` with a dedicated operator bearer secret (`SCANNER_AUTH_TOKEN`, 32+ characters), `Content-Type: application/pdf`, and `X-Stuora-Content-SHA256` set to the SHA-256 of the raw PDF bytes. Maximum request body: 5 MiB. At most two active scans; deadline 12 seconds for clamd; unknown responses fail closed.

A clamd `stream: OK` result becomes:
```json
{"verdict":"clean","sha256":"<64 lowercase hex>","engine":"clamav-http-v1"}
```

A clamd `stream: ... FOUND` becomes `malicious`. A clamd error, scan timeout, oversized request, missing authentication, invalid fingerprint, or stale virus signatures (when detected by operator monitoring) must **never** be treated as clean. This bridge itself does not prove signature freshness and has no deployment-level supervision; that is mandatory operations work.

## Local test with a fake clamd (no user data)

```bash
node --test services/stuora-pdf-scanner/scanner.test.mjs
```

The tests start a local fake TCP daemon to verify actual ClamAV framing and simulate `OK`, `FOUND`, and errors; and start the authenticated HTTP service on loopback to test hashes, permissions and failures. **Fake daemons do not provide malware scanning**, so these tests alone do not clear release.

## Production-like deployment prerequisites

- Operate clamd on a private network, never publicly expose port 3310. Verify the official ClamAV image, use a pinned maintained version/digest, persist its virus database, update signatures with FreshClam and alert if signature updates fail.
- Use this Node HTTP service only behind an operator-controlled **HTTPS** reverse proxy on a stable host, with outbound access limited to that host from the Supabase worker. The Node process listens on `127.0.0.1` by default; do not bind `0.0.0.0` without a protected network and reverse proxy.
- Set `SCANNER_AUTH_TOKEN` securely (a unique 32+ character server secret), `CLAMD_HOST`, `CLAMD_PORT` and optional `PORT`/`BIND_HOST` privately. The Supabase worker needs the same value as `STUORA_PDF_SCANNER_AUTH_TOKEN` plus `STUORA_PDF_SCANNER_URL=https://<approved-host>/v1/scan-pdf` and `STUORA_PDF_SCANNER_HOST=<approved-host>`. Never commit the token.
- Register/document a GDPR-compliant processing location, purpose, retention, logs, deletion, risk assessment and relevant contracts. A self-hosted option still requires privacy and security review.
- Test against a current **real** ClamAV installation including an EICAR **test pattern**, a benign PDF, ClamAV offline/stale-signature conditions, oversized objects, concurrency and timeout. Do not upload real student documents for commissioning.
- Confirm that the scanner calculates the content hash from the exact bytes received, not by echoing request headers; this bridge does that.
- Review auditability and risk of PDF active content; a clean AV scan alone is not a blanket safety guarantee. Keep downloads attachment-only and consider sandbox/CDR before broad deployment.

## Nondeployment guarantee

The consuming Supabase `group-file-pdf-scan` function has `GROUP_PDF_SCANNER_COMPILED_IN=false` and separate worker credentials. The private upload/download paths also remain OFF. No live scanner, hosting costs, DNS, jobs, external data transfers or company accounts have been created.

Official protocol reference: https://docs.clamav.net/manual/Usage/ClamdProtocol.html
Official container and FreshClam notes: https://docs.clamav.net/manual/Installing/Docker.html
