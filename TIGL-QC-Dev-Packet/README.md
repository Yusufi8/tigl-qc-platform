# TIGL Quality Platform — Developer Handoff Packet
**Product:** TIGL Quality (machine QC digitalisation) · **Host:** `qc.tiglobal.com` (intranet) · **Version:** 1.1 draft (updated 01 Oct 2026) · **Date:** 01 Oct 2026
**Owner:** IT (Director of IT) · **Business owner:** Quality Manager · **Status:** Ready for estimation — see `docs/10-open-decisions.md` before sprint 1

This packet implements **Method 3 — Custom Cloud Quality Application** from the *QC Digitalization Options* management report, using the **AXIS Milling Machine** checklist (`Axis_Final.xls`) as the reference template.

## Decisions baked in (01 Oct 2026)
1. **Two issuing entities, chosen by customer:** T&I Global Limited or T&I Projects Private Limited (letterhead, signing certificate, numbering follow it; Odoo SO company overrides).
2. **E-signature is part of the code** (typed/initials + designation, password re-auth, hash, per-entity PAdES seal). No Google, no external provider, no per-seat licence.
3. **Machines are never hard-coded:** add machines in the UI; variants per machine; order-specific checks for one-off builds.
4. **Self-hosted:** TIGL is its own vendor. Internal DNS, Docker Compose on our server, Caddy TLS. No cloud.
5. **Sign-in = username + password issued by IT together with the role.** No LDAP, no Google.

## What to read, in order
| # | File | Purpose |
|---|------|---------|
| 0 | `prototype/qc-platform-prototype.html` | Clickable reference. Open in Chrome, switch users top-right to see every role. **The prototype is the UX spec.** |
| 1 | `docs/01-product-requirements.md` | Scope, modules, user stories, acceptance criteria |
| 2 | `docs/02-architecture.md` | Stack, module boundaries, repo layout, deployment to qc.tiglobal.com |
| 3 | `docs/03-rbac-and-governance.md` | Roles, permission matrix, separation-of-duties guardrails |
| 4 | `docs/04-validation-engine.md` | Deterministic result rules + test vectors (**must be unit-tested to 100%**) |
| 5 | `docs/05-esignature-spec.md` | Adobe-style typed/initial signatures, PDF lock, hashing, re-auth |
| 6 | `docs/06-integrations.md` | Odoo, SMTP, public REST API, webhooks (Google optional, off by default) |
| 7 | `docs/07-security-and-compliance.md` | OWASP ASVS L2, audit trail, backups, DPDPA, ISO 9001 mapping |
| 8 | `docs/08-test-and-uat-plan.md` | Test strategy, UAT scripts with the QC team |
| 9 | `docs/09-delivery-plan.md` | Phases, sprints, Definition of Done |
| 10 | `docs/10-open-decisions.md` | Decisions needed from management/IT before build |
| 11 | `docs/11-source-data-notes.md` | Spec ambiguities found in `Axis_Final.xls` — Engineering must confirm |
| — | `db/schema.sql` | PostgreSQL 16 DDL (authoritative data model) |
| — | `api/openapi.yaml` | OpenAPI 3.1 contract |
| — | `seed/product-families.json` | All TIGL product families (dryers, radiators, HAG, coconut lines) with stage blueprints and inspection types — roadmap after AXIS |
| — | `seed/axis_templates.json` | AXIS-MM (171 params) and AXIS-TMH (188 params), digitised from the xls |
| — | `rbac/rbac-matrix.csv` | Permission matrix (import into the seed script) |
| — | `backlog/jira-import.csv` | Epics + stories for Jira ITOPS (CSV importer) |
| — | `infra/` | docker-compose (dev + prod), Caddyfile, `.env.example`, `deployment-onprem.md` |

## Non-negotiables (read even if you skip everything else)
1. **The validation engine decides PASS/FAIL. Nothing else does** — not the UI, not AI, not an admin. Same function runs client-side (live feedback) and server-side (authoritative). Server result wins.
2. **No PDF without signatures, and signing is built in.** No Google / third-party signing service. `GET /reports/{id}.pdf` returns `423 Locked` until every required signature slot is filled. Print CSS also blocks browser print of unsigned reports. No "draft PDF" endpoint.
3. **Templates are revisioned, never edited in place.** An inspection stores `template_revision_id`. Publishing rev C must not change any rev B inspection.
4. **Signed records are immutable.** After the first signature, values can't change. Returning an inspection to the inspector voids signatures (logged).
5. **IT roles configure; they don't hold quality authority.** System Admin and Developer cannot approve, sign, or publish specs. Developer has no production data access. Enforced server-side, not just hidden in UI.
6. **`company_id` on every business table from day one** (TIGL, TIPL, future entities).
7. **Every write is audited** (append-only `audit_event`).
8. **Store Odoo IDs from day one** even if the connector ships later.

> All legal/compliance statements in this packet are drafts for internal and legal review before go-live.
