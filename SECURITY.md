# Security Policy

Local PDF Tools is built for handling sensitive documents, so we take security seriously.

## Supported versions

Only the latest release on the `main` branch receives security fixes.

## Reporting a vulnerability

**Please do not open a public issue.** Use GitHub's private reporting instead:
**Security → Advisories → [Report a vulnerability](https://github.com/alqudah/local-pdf-tools/security/advisories/new)**.

Please include steps to reproduce and, if possible, a proof-of-concept file. You can expect an initial response within 7 days.

## Scope

Especially interesting reports:

- Any way a browser tool leaks document contents over the network
- Redaction that leaves recoverable text or images underneath
- Password protection that can be trivially bypassed
- Server-side issues in `server.ts` (SSRF, path traversal, DoS through uploads)

## Self-hosting notes

The optional Node server accepts uploads of up to 50 MB and has no authentication. If you expose it to the internet, put it behind a reverse proxy with authentication and rate limiting.
