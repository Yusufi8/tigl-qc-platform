# 07 — Security and Compliance

> Draft for internal and legal review. Not legal advice.

## 1. Baseline
Target **OWASP ASVS 4.0.3 Level 2** for all modules. Pen-test (internal or vendor) before go-live; re-test on every major release.

| Area | Control |
|---|---|
| Authentication | **Local accounts, issued by IT**: username + temporary password + role are created together by the System Admin; user must change the password at first sign-in. Argon2id hashes (m=64 MiB, t=3, p=1 minimum), min 10 chars with upper/lower/number (configurable), last-5 reuse block, optional expiry, lockout after 5 failures for 15 min, generic error text, no self-service reset (admin issues a new temporary password in person). Optional built-in **TOTP 2FA** (recommended for QM and System Admin). **No LDAP, Google or external IdP.** |
| Session | HttpOnly, Secure, SameSite=Strict cookie; 8 h absolute, 30 min idle (configurable); rotate on login and on role change; one-click sign-out; admin can revoke all sessions of a user. |
| Signing re-auth | Signer re-enters **own password** (+ TOTP if enabled); token valid 120 s, single use; 3 failures in 10 min locks signing for that user. |
| Break-glass | One sealed System Admin account (credentials in the Director of IT's safe), alerts on use. System Admin still cannot approve/sign/publish (guardrails). |
| Authorisation | Permission checks in API guards + Postgres RLS on `company_id`. Guardrails (doc 03) enforced by DB trigger as last line. UI hiding is cosmetic only. |
| Network | Intranet only: internal DNS, LAN/VPN access, TLS on Caddy, firewall allow-list; DB/Redis/MinIO not reachable from user LAN (only the app host). `/api/v1/*` with API keys reachable only from Odoo/n8n hosts. |
| Secrets | Compose secrets / root-only env file; Odoo API key, SMTP password, signing master key never in DB plaintext, never in logs, never returned by API (masked `••••a91f`). |
| Data at rest | Full-disk encryption (LUKS) on DB and object-store volumes; MinIO bucket policy private, signed URLs 5 min; object-lock (WORM) on sealed PDFs for the retention period. Signing private keys additionally encrypted (AES-256-GCM) with a master key held outside the DB. |
| Data in transit | TLS 1.2+ everywhere incl. Odoo and SMTP (STARTTLS required, fail closed). |
| Input | Zod schemas shared FE/BE; size limits; evidence MIME sniffing + ClamAV scan in worker before attach. Max 25 MB/file. |
| Output | CSP (no inline script in prod build), HSTS, X-Content-Type-Options, frame-ancestors 'none'. |
| Rate limits | 600 req/min per user, 120 req/min per API key, 10/min on sign endpoints. |
| Dependencies | Renovate + `npm audit` + Trivy image scan in CI; block on high/critical. |
| Logging | Structured JSON to local log store (Loki or files with rotation); no PII values or secrets in logs; request ID propagation. |

## 2. Audit trail
- `audit_event` append-only (no UPDATE/DELETE grants; trigger rejects). Each row carries `prev_hash` → SHA-256 chain; nightly job verifies chain and alerts on break.
- Logged: every write, login, sign, PDF download, permission change, integration config change, API key create/revoke, template publish, export.
- Retention: quality records and audit ≥ **10 years** (configurable, never below policy). Archive partitions to cheaper storage after 2 years, still queryable.

## 3. Backup and recovery
| Item | Target |
|---|---|
| PostgreSQL | WAL archiving (pgBackRest/WAL-G) for PITR 7 days + nightly full backup kept 35 days + monthly copy to **off-site/offline media** (12 months) |
| Object store + signing keys | Nightly sync of MinIO to a second host/NAS; object-lock on sealed PDFs; **encrypted backup of signing certificates + master key kept separately by the Director of IT** (losing it = cannot sign new reports) |
| RPO / RTO | RPO ≤ 15 min, RTO ≤ 4 h |
| Drill | Restore test every quarter onto the UAT host; result logged in Jira ITOPS |

## 4. Privacy — DPDPA 2023 (India)
Personal data held: employee name, email, designation, IP at sign time, user-agent; customer contact names from Odoo (minimal). Purpose: quality record-keeping and traceability (legitimate use for employment / contractual obligations — confirm with legal). No sensitive personal data. Data stays on TIGL's own servers in India. Access requests handled by HR + IT. Departed employees: account disabled by System Admin (no directory sync); signatures remain on records (required for traceability).

## 5. ISO 9001:2015 mapping (TIGL is ISO 9001:2015 certified)
| Clause | How the platform supports it |
|---|---|
| 7.1.5 Monitoring & measuring resources | Instrument ID + calibration due date field per measurement (phase 2 gauge register); block use of expired gauges |
| 7.5 Documented information | Templates = controlled documents with revision, approver, effective date; superseded revisions retained; signed reports immutable |
| 8.5.2 Identification & traceability | Inspection ↔ Odoo SO / MO / lot-serial; serial on report |
| 8.6 Release of products | Approval + signatures required before release; optional Odoo delivery block until PASS |
| 8.7 Control of nonconforming outputs | Auto-NCR on critical FAIL; disposition (rework / repair / concession / scrap); concession requires QM |
| 9.1 Monitoring, analysis | Dashboard: FPY, top failing parameters, pass rate by family |
| 10.2 Nonconformity & corrective action | NCR root cause + CAPA fields (phase 2 CAPA module) |

## 6. E-signature legal position
See `05-esignature-spec.md`. Typed/initial e-signatures with password re-auth, intent statement, hash binding, audit trail and an entity-level PAdES seal are built into the platform (no third-party signing service). Where a customer contract or export documentation requires a DSC, upload the entity's DSC as the sealing certificate; Aadhaar eSign remains phase 2. **Legal review required before go-live.**
