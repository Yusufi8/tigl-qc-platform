# TIGL QC Digitalization Platform — Audit and Delivery Plan

**Prepared:** 6 October 2026  
**Scope reviewed:** `TIGL-QC-Dev-Packet.zip` (36 archive entries, 465,889 bytes) and connected GitHub repositories available at the time of the audit. The project repository URL was supplied after this audit was written.  
**Source boundary:** The original `Axis_Final.xls` referenced by the packet was not included. Findings about its contents rely only on the packet's source notes and digitized seed. No production environment, Odoo instance, database, or application repository was supplied.

## Executive assessment

The packet is a detailed product/architecture handoff, not an application codebase. It contains a substantial single-file clickable prototype, draft requirements and design documents, SQL DDL, a draft OpenAPI contract, seed data, a permission matrix, and Compose examples. It contains no backend/frontend implementation, package/dependency manifests, migrations, app Dockerfiles, CI workflows, or automated tests. Therefore the production workflow is **DOCUMENTED ONLY** and the prototype interactions are **PROTOTYPE ONLY**; production behavior cannot be claimed as implemented.

There are blocking correctness issues in the DDL and contradictory workflow/permission definitions. The development Compose stack cannot initialize the supplied DDL as written because `signing_certificate` references `app_user` before that table exists. `docker-compose.yml` also refers to missing app Dockerfiles and a missing repository root build context. Critical requirements (server-side validation, immutable signed records, auditing, isolation, signing, and recovery) are specified but have no implementation evidence.

At audit time, no repository matching “TIGL QC” was available. The similarly named `Yusufi8/T-I-Product-Intelligence-System` repository was a different project. The user subsequently supplied `Yusufi8/tigl-qc-platform`, which contains the handoff packet on `main`; implementation work now proceeds in that repository on a feature branch.

**Readiness:** Not production-ready; not yet an executable software project. Proceed by resolving P0 decisions and creating a real source repository, then implement and verify the AXIS pilot in small phases. This report completes Phase 0. It does not claim implementation or production readiness.

## A. Project audit

| Component | Status | Evidence and assessment |
|---|---|---|
| Product requirements / BRD | DOCUMENTED ONLY | `docs/01-product-requirements.md` contains scope, modules, stories and acceptance criteria; it is a draft handoff, not approved requirements traceability. |
| Architecture | DOCUMENTED ONLY | `docs/02-architecture.md` describes a TypeScript monorepo/NestJS-style stack and deployment, but no repo scaffold or implementation is present. |
| UX prototype | PROTOTYPE ONLY | `prototype/qc-platform-prototype.html` is a 224 KB standalone HTML file. It embeds seed data, simulated users/roles, state, and behavior in the browser; `localStorage` is its persistence layer. It is not connected to a server, API, database, or object storage. |
| Templates and AXIS data | PARTIALLY IMPLEMENTED (as prototype seed) | `seed/axis_templates.json` parses as JSON and has AXIS-MM rev B (171 parameters) and AXIS-TMH rev A (188). This is digitized data, not a validated import or active database template. Three specification interpretations remain TBC; three electrical variant assignments are explicitly demos. Original spreadsheet is absent. |
| Other product families | DOCUMENTED ONLY | `seed/product-families.json` describes 11 families and stage blueprints; all beyond AXIS are marked as awaiting checklists. Blueprints are not approved inspection specifications. |
| Validation engine | PROTOTYPE ONLY / BROKEN AGAINST SPEC | A browser-side `Engine` exists in the prototype. There is no shared TypeScript package or server-authoritative validator. `parseFloat` accepts trailing units (e.g. `0.03mm`) and therefore violates the documented rejection rule. Numeric `exact` comparison in doc 04 is also absent in the prototype. |
| Workflow | DOCUMENTED ONLY / CONTRADICTORY | Requirements/docs, prototype, and schema use differing states and transitions (details in B). No workflow service or server guard exists. |
| Database | DOCUMENTED ONLY / BLOCKED | `db/schema.sql` contains 37 `CREATE TABLE` statements and indexes/triggers, but no migrations or migration runner. DDL ordering has a foreign-key creation failure; immutability and tenant coverage are incomplete. |
| API | DOCUMENTED ONLY | `api/openapi.yaml` parses as OpenAPI 3.1 with 37 paths and 46 operations. No API source or generated contract checks exist; several request/status semantics contradict the workflow and schema. |
| RBAC/security | DOCUMENTED ONLY / CONTRADICTORY | `rbac/rbac-matrix.csv` defines 20 permissions across 8 roles. `LOCKED`, blank and `Y` are not defined as a canonical import contract; it differs from descriptions in docs/schema/prototype. No server authorization exists. |
| Seed/import | PARTIALLY IMPLEMENTED (script only) | `seed/build_seed.py` is present, but no importer target, package runtime, idempotency guarantees, database, or import validation tests are supplied. The referenced source workbook is absent. |
| Evidence / object storage | DOCUMENTED ONLY | Schema and infra mention MinIO and evidence metadata; no upload path, malware scan flow, lifecycle, authorization, or reconciliation job exists. |
| E-signature / PDF | DOCUMENTED ONLY | Draft spec outlines re-auth, hashes and PAdES. No signing implementation, certificate lifecycle, PDF renderer, verification endpoint or tests exist. The spec itself leaves signing-library/licensing and legal review open. |
| Odoo / SMTP / webhooks | DOCUMENTED ONLY | Draft API/docs/schema describe integrations and an outbox; there is no adapter, queue consumer, retry policy implementation, or integration test. Odoo version/protocol is undecided. |
| NCR / calibration | DOCUMENTED ONLY / OUT OF SCOPE GAP | NCR fields are proposed in DDL; no service/UI exists. Calibration is referenced as a phase 2 mapping but has no register schema/UI/API; doc 01 calls calibration management out of scope for v1. |
| Infrastructure | PARTIALLY DOCUMENTED / UNBUILDABLE | Compose/Caddy/env/deployment examples exist, but app Dockerfiles, source tree, CI, migration/init procedure for production, backup scripts and monitored health checks do not. Dev Compose cannot build the referenced `apps/*/Dockerfile` files. |
| Tests / UAT | DOCUMENTED ONLY | `docs/08-test-and-uat-plan.md` lists desired tests and coverage targets. No test files, test runner, CI config, or test evidence are included. |
| Developer / operational docs | PARTIALLY DOCUMENTED | Architecture, deploy, security and UAT drafts exist. README identifies open decisions; backup restore guide, developer setup, API/database manuals, QC authoring guide, release notes, and implemented-system documentation are absent. |

## B. Gap analysis and prioritized findings

Complexity: S = small, M = medium, L = large, XL = extra large. Acceptance criteria below are proposed measurable exit conditions.

| ID / Priority | Problem and evidence | Impact / recommendation | Complexity / dependencies | Acceptance criteria |
|---|---|---|---|---|
| G-01 P0 | No application source tree, dependency manifests, migrations, test suite, or Dockerfiles in the packet; Compose references missing files. | Cannot build, run, deploy, or test the target. Establish/identify the canonical company-owned source repo and scaffold only after stack/ownership decisions. | L; repo ownership and D1/D5 decisions. | Clean checkout can install, migrate an empty DB, start all required services and pass health checks from documented commands. |
| G-02 P0 | `db/schema.sql` creates `signing_certificate` before `app_user`, but references `app_user(id)`; a forward FK target must exist when the constraint is declared. | Fresh DDL fails before application startup. Move table creation or add the FK after both tables; validate the entire DDL in disposable PostgreSQL. | S; G-01. | PostgreSQL 16 applies the complete schema from a clean database without error; repeatable migration is recorded. |
| G-03 P0 | Workflow state differs: docs mention `draft → submitted → reviewed → approved`, return-to-draft and reject; user target additionally requires IN_PROGRESS, UNDER_REVIEW, RETURNED, HOLD, CANCELLED. Schema allows only draft/submitted/reviewed/approved/rejected; API uses action `review` and `reject`; doc 04 says fail submit → rejected, while other sections describe FAIL as a result. | State/result ambiguity can release or block the wrong inspection and makes UI/API/DB inconsistent. Approve one state machine and transition table before backend work. | M; Quality Manager + Engineering + Production. | One signed-off state diagram, role/guard table, and transition test matrix agree across FRD, schema, API and implementation. |
| G-04 P0 | `insp.review` is granted to Supervisor and QM in the RBAC CSV; but the CSV grants QM approval and docs imply separate review/approval. Same-person separation is unclear. Prototype permission rules differ. | Separation-of-duties and quality governance may be bypassed. Define who can perform each slot/transition and enforce distinct actors server-side. | M; G-03, QM approval. | Permission matrix has unambiguous values; API rejects self-review/self-approval where policy requires; audit records denial and success. |
| G-05 P0 | Tenant/issuing entity claims conflict with DDL: docs say `company_id` on every business table, but numerous detail tables rely only on indirect parent links and `inspection_value` has no company field. `customer.name` is globally unique; user role is keyed by one company assignment. | Cross-entity leakage and wrong report identity risks. Define tenant boundary, entity scope, and customer uniqueness; implement consistent authorization and DB constraints/RLS where selected. | L; architecture/security decision. | Cross-company negative tests cover reads, writes, evidence, reports, audit and integration lookups; DB integrity checks pass. |
| G-06 P0 | Published immutability trigger protects only `template_parameter`; stage/section/revision changes are not guarded. `inspection` status/result/value rows have no shown immutable-approved-record guard. Audit append-only rule is only `REVOKE ... FROM PUBLIC`, with no trigger, role grants, or hash-chain writer. | Historical QC data and audit trail can be altered through ordinary SQL/app paths. Add transactional service rules and DB protections for all signed/approved source data; prove audit chain behavior. | L; G-01, G-03. | Attempts to mutate published revision or approved/signed inspection fail; audit captures actor/action/before/after and chain verification detects tampering. |
| G-07 P1 | Validation engine is only in the browser. Prototype `parseFloat("0.03mm")` accepts a value that doc 04 says is invalid; exact numeric comparison and comma decimals also differ. | Client values are untrusted; acceptance decisions could be manipulated or differ by layer. Build one pure deterministic engine used by UI and API, with server as authority and fixed-point/decimal rules. | M; template rule schema. | Every doc 04 vector passes; malformed numeric units are invalid; API recomputes outcomes and ignores supplied result values. |
| G-08 P1 | Evidence schema permits evidence attached to neither or both parameter and extra parameter; evidence metadata lacks an explicit scan/quarantine state and storage integrity/lifecycle workflow. | Incorrect evidence association, unsafe uploads, or evidence deleted/changed after approval. Add exactly-one attachment constraint, upload staging/scan controls and signed-record lifecycle. | M; object storage/security design. | Invalid associations fail at DB; uploads are authorized, size/type checked, scanned before use; hash and retrieval audit are verified. |
| G-09 P1 | DDL offers one `inspection_value` row per parameter, not series/multiple readings; requirement mentions future series only, but inspect whether repeat measurements are needed for AXIS. Numeric storage is `numeric(12,4)` with no documented rounding, unit conversion, or significant-digit rules. | Could lose real inspection workflow or introduce tolerance boundary errors. Confirm AXIS data/input semantics and decimal policy with Engineering before freeze. | M; source workbook and Engineering. | Approved per-parameter input contract defines cardinality, precision, units and boundary behavior; import review signs off all 359 seed parameters. |
| G-10 P1 | API gaps and mismatches: transition actions and state names are not schema-aligned; `InspectionCreate`/`ValueResult` are not documented here as implementation; file/evidence ownership lacks path parameter; 423 described for PDF but missing security/ownership response; `company_id` list filter cannot be trusted as tenant authorization. | Clients cannot rely on stable validated behavior. Generate/validate API from implementation, scope every operation server-side, standardize error codes/status and idempotency. | L; G-01, G-03, G-05. | Contract tests cover every operation, auth/tenant scoping, problem response, optimistic lock and idempotency behavior. |
| G-11 P1 | Development Compose uses `api`, `worker`, `web` under profile `app` while no app images/build files are present; root build context is unavailable. Production references external images but has no release pipeline or migration/init job. `.env.example` duplicates `SESSION_SECRET`; sample DB/storage credentials are weak local defaults. | Setup is not reproducible and configuration drift/secrets risk is high. Create explicit local profiles, production secret inventory, migration job, pinned image versions and CI build/publish. | M; G-01, D5. | New developer setup succeeds from clean clone; production config rejects unset/weak secrets and mutable image tags; release/rollback documented and exercised. |
| G-12 P1 | E-signature spec asserts legal positioning and PAdES behavior while legal review and library licensing are open. `signature` uniqueness prevents a user signing two slots (perhaps intended), but role-at-signing and signer eligibility are not DB-bound. | Legal/compliance claims and signature meaning are unverified. Treat as controlled internal approval until Legal validates; implement crypto and authorization with reproducible verification. | L; Legal, QM, certificate ownership. | Approved legal wording; threat model and crypto review; signed PDF cryptographically validates after download and fails after tamper; revoked signature is explicit. |
| G-13 P1 | AXIS source is absent and listed TBC items/variant mapping are not Engineering-approved. | No defensible go-live acceptance limits. Obtain source-controlled checklist and sign off each interpretation/criticality/variant. | M; Engineering + QM. | Every AXIS parameter has source reference, unit, type, limit, criticality, mandatory/evidence rule and approved revision. |
| G-14 P2 | No machine registry or explicit product-family tables despite flexible machine/variant requirements; inspection stores serial and free-text type. Seed family structure is not represented in DDL. | Asset history, QR ownership, duplicate serial validation and family expansion may be brittle. Define machine identity model and use cases before expanding beyond AXIS. | M; business process. | Machine lookup/QR resolves a stable machine record with family/model/variant and permitted inspection templates. |
| G-15 P2 | DDL indexes are only partly workload-driven; indexes on serial/work order lack company scoping; many FK columns have no visible indexes (e.g. evidence, signatures, NCR). | Search may slow and deletes/joins may become costly; blind extra indexes also add write cost. Use target queries and explain plans after pilot data. | S/M; representative query set. | Query plan review and measured latency meet agreed SLO at expected pilot and growth volumes; only evidence-backed indexes retained. |
| G-16 P2 | Backup guide is prose only. Compose volumes are local; deployment text suggests separate second host but no scripts, key restore procedure, RPO/RTO, object-store consistency, or restore evidence. Signing master key backup is a critical dependency. | A database restore without matching object evidence/signing keys may leave records unverifiable. Automate and drill full restore. | M; infrastructure owner. | Quarterly UAT restore recovers DB, evidence, cert/key backups and verifies report hashes within approved RPO/RTO. |
| G-17 P2 | Offline/SAT is named as a later PWA feature; no conflict model or local key/data protection is designed. | Field use may lose records or create unsafe overwrites. Defer offline capture until conflict, encryption, expiry and audit behavior are specified. | L; QM/Projects. | Offline acceptance tests demonstrate encrypted queue, idempotent sync, visible conflicts and no silent overwrite. |
| G-18 P3 | AI narrative/search and wider family analytics appear in long-term requirements, while AXIS pilot is not built. | Scope could distract from deterministic inspection workflow. Keep AI outside technical decisions and defer until verified production data exists. | M/L; post-pilot. | Any AI feature only consumes verified data, is labelled and reviewed, and cannot write result/specification/approval fields. |

## C. BRD — business requirements baseline

**Purpose:** Replace handwritten QC execution and report preparation for AXIS final inspection with a traceable digital checklist that preserves the approved paper acceptance criteria.

**Users:** QC Inspector, QC Supervisor, Quality Manager, Engineering, Production, System Administrator, Management. IT configuration access must not grant quality authority. Final role names and separation rules require Quality Manager approval.

**Business flow:** Select/scan machine → select a published revision → record checks and measurements → deterministic evaluation → attach required evidence and remarks → submit → supervisor review/return → Quality Manager approval/concession → signed report → audit/history → asynchronous Odoo update. The application remains the QC system of record if Odoo is unavailable.

**Business rules:** Published templates are immutable; each inspection pins a revision. The server computes status. A customer/order-specific check must record a reason and be included in the inspection snapshot/report. Signed/approved records must be reproducible. PASS/FAIL/HOLD/INCOMPLETE are distinct result states; workflow state is a separate concept. The approved source sheet and Engineering's interpretation are the acceptance authority.

**Success measures:** AXIS inspection completion without paper duplication; required checks and evidence cannot be bypassed; reviewers can identify who changed what and when; report content matches the inspection snapshot; remote Odoo outage does not block QC capture; restore drill meets agreed RPO/RTO. Numeric targets and pilot volume must be approved before UAT.

**Scope for pilot:** AXIS-MM and AXIS-TMH only after checklist approval; desktop/tablet/mobile inspection; template revisions; deterministic validation; evidence; review/approval; auditable signed report; basic Odoo lookup/push with retry. Calibration register, offline SAT, customer portal, and AI remain later unless management changes priority.

## D. FRD — functional requirements baseline

1. **Identity:** IT creates named accounts and roles; first login changes temporary password; sessions expire and can be revoked. Authentication, lockout, password reset and optional TOTP require server-side implementation.
2. **Authorization:** Every API and file/report request authorizes actor, role, company/entity and record relationship. UI hiding is not enforcement. Quality approval cannot be granted to IT-only roles.
3. **Machine and inspection creation:** Resolve or enter customer/order/machine; pin a published template revision; validate required identifiers; never silently change variant after values exist.
4. **Checklist execution:** Render one stage/section/parameter at a time with specification, unit, method, input, feedback, evidence and remark. Support draft save and version conflict feedback. Required checks/evidence block submission.
5. **Validation:** Shared deterministic rules; server recomputes each value and summary. Preserve decimal semantics, inclusive limits, invalid input and evidence state. Client-supplied result is ignored.
6. **Template lifecycle:** Engineering authors a draft from source-controlled data; changes are diffed; Quality Manager publishes; prior revisions become superseded; inspections retain their pinned revision.
7. **Workflow:** Approve one state machine including return, HOLD/concession, FAIL/NCR, rejection and cancellation. Each transition records actor, time, reason, required signature slot and guard result.
8. **Evidence:** Upload to private object storage; validate size/content; scan; bind to exactly one check or permitted inspection-level evidence; calculate server hash; authorize downloads; retain according to policy.
9. **Review and approval:** Reviewer can return with reason; approver sees result, failures, evidence and revision; HOLD requires controlled concession; separation of duties is enforced.
10. **Reports/signatures:** Generate report from immutable inspection snapshot; require required signatures; bind signature to canonical content hash; cryptographically verify PDF; record downloads and revocations. Legal significance must be described only after Legal approval.
11. **NCR:** Link nonconformance to failed check/inspection, disposition, cause, owner, due date, closure and reinspection. Confirm mandatory fields and failure workflow before implementation.
12. **Odoo:** Lookup is read-only during capture; integration writes use a durable outbox, idempotency key, retries/backoff, dead-letter visibility and reconciliation. QC continues during Odoo outage.
13. **Audit/management:** Record all writes and security-relevant events; expose filtered audit to authorized quality roles. Dashboard uses defined formulas and traceable data, not prototype sample figures.
14. **Administration/deployment:** Secure configuration, user/role management, migrations, secret rotation, health/readiness, backup and restore are documented and tested before production.

## E. UX/UI improvement plan

Retain the prototype's checklist-first concept, AXIS terminology, progress indication, stage navigation and immediate feedback as design hypotheses. Replace browser-only state and simulated role switching with authenticated server-backed screens.

- **Phone:** QR/machine lookup, one parameter card at a time, numeric keypad, camera capture, large next/back/save controls, clear offline/online state. Keep specification and result text visible.
- **Tablet/shop floor:** Stage/section navigator plus one active check; large touch targets; portrait and landscape layouts; avoid dense tables and modal-heavy entry.
- **Laptop:** Inspection and review queues, side-by-side specification/value/evidence, template authoring and approvals.
- **Desktop:** Template authoring, audit search, report administration, management filters and wider tables.
- **Accessibility:** Pair every color with text/icon; keyboard support, visible focus, labels, contrast, error association, zoom and screen-reader semantics.
- **Error handling:** Preserve entered drafts on network failure; show save status and version conflicts; require reason for return/reject/cancel; make missing evidence and invalid measurement actionable.
- **Template conversion:** Import source checklist into draft; map row/source reference, section, parameter, type/unit/limit, mandatory/critical/evidence/method; show unmapped/ambiguous rows; require Engineering review and QM publication. Never infer an acceptance limit from AI or prototype defaults.

## F. Technical architecture recommendation

Use the packet's proposed modular TypeScript architecture only after confirming an owner and executable scaffold. Keep a pure shared validation/domain package; expose versioned API; use PostgreSQL for authoritative records; private S3-compatible object storage for evidence/reports; a durable database outbox and worker for PDF/email/Odoo; Redis only for short-lived sessions/cache/queue support where recoverability is clear. Keep application, API and worker within self-hosted network boundaries behind Caddy. Use migrations as the sole schema evolution path.

Required boundaries: identity/RBAC; machine/template/revision; inspection/value/validation; workflow/approval; evidence; signatures/report; NCR; integration/outbox; audit; platform/admin. Business transitions must be service methods with database transactions and concurrency/version checks. Do not rely on the browser, Prisma middleware alone, or a trigger alone for authorization.

Before fixing stack details: confirm canonical repository, Node/package manager versions, framework, supported Odoo version/protocol, production registry, SMTP/TLS, storage, internal CA, environment topology, restore target, and signing requirements. Production API and worker must expose readiness checks and structured redacted logs.

## G. Database improvement plan

1. Fix clean-install DDL order and immediately create versioned migrations; do not use edited `schema.sql` as production upgrade strategy.
2. Define tenant/entity model: clarify whether `company_id` means legal issuer or security tenant. Apply consistent composite keys/foreign keys or scoped joins; make customer uniqueness company-aware if customers can differ by issuer.
3. Define machine/product-family/variant records and QR lookup relationship if the system needs durable machine history.
4. Add constraints for evidence XOR ownership; ensure `inspection_value` belongs to the same inspection as its parameter/revision; validate same-revision stage/section/parameter links. Add trigger/service invariants transactionally.
5. Expand workflow enums only after sign-off; separate inspection `status` from computed `result`; ensure no caller can persist a supplied result without recomputation.
6. Protect every published template child and finalized inspection/report source snapshot; define amendment and reinspection model rather than editing approved records.
7. Define audit writer, append-only DB role, chain serialization/concurrency and verification process. Current nullable hash columns and public revoke alone do not implement tamper evidence.
8. Define decimal precision/rounding/unit rules and whether repeated readings/series are required. Use fixed-point comparison at exact specified precision.
9. Add evidence scan/deletion/retention metadata and object-store reconciliation; define report/artifact invalidation and retention.
10. Design indexes from representative queries and EXPLAIN plans. Review missing FK-side indexes, tenancy filters and expected pagination/search patterns before adding indexes.

## H. Security review

**Critical design gaps:** no running server to assess; no implementation for authorization, session management, upload scanning, audit writer, signature crypto, rate limiting, CSRF/CORS, secret handling, backup access, or integration egress. Therefore no claim of OWASP ASVS L2 compliance is supported.

**Required controls before UAT:** server-side least privilege on every route and object; secure cookies/CSRF defense; strong password/session lifecycle; lockout/rate limits and generic auth errors; secrets outside images/repository with rotation; TLS and private service network; SSRF-safe webhook delivery and allowlisted Odoo/SMTP destinations; upload MIME/content/size checks plus malware scan; private object storage with short-lived authorized downloads; redacted logs; append-only audit access; DB least-privilege roles; dependency and image scanning; backup encryption and key recovery; security tests for cross-entity access and signed-record mutation.

Legal, DPDPA, ISO mapping, and signature statements in the supplied docs are drafts. Get legal/quality review before relying on them externally.

## I. Deployment plan

1. Build/version web, API and worker images in CI from a clean source checkout; pin base/service versions and publish to the internal registry.
2. Provision separate sandbox/UAT/prod configuration and credentials; use Docker secrets or root-only secret files. Keep developer environment on synthetic data.
3. Apply forward-compatible migrations as an explicit release job; verify backup and migration status before application rollout.
4. Run PostgreSQL, Redis if needed, private object store, PDF service, malware scanner and worker on internal networks; expose only Caddy on LAN/VPN. Confirm Caddy routes both web and `/api` as implemented.
5. Configure TLS, SMTP, Odoo credentials, object-store bucket policies, logging, health/readiness, disk alerts and certificate expiry alerts.
6. Back up DB and object data consistently; separately encrypt signing master key/cert backups. Define RPO/RTO, retention and off-site copy.
7. Restore to UAT, verify record/evidence/report hashes and sign-in, run UAT, then promote the same image digest to production.
8. Roll back app image only where migration compatibility allows; document forward repair for irreversible schema changes.

The current Compose files are illustrative and cannot meet these steps alone. The sample Caddyfile only covers `qc.tiglobal.com`; sandbox/UAT sites need explicit host handling. Development Compose should not be treated as production configuration.

## J. Development roadmap

| Phase | Scope | Exit evidence |
|---|---|---|
| 0 Audit (complete) | Inspect packet and cross-check layers; record priorities and open decisions. | This report; implementation status classified with evidence. |
| 0A Decisions/repository | Identify canonical source repo and owner; approve workflow/RBAC/tenant semantics; resolve Odoo, hosting, TLS, signing, source checklist and pilot policy. | Decision log signed by IT, QM, Engineering and Legal as applicable. |
| 1 Foundation | Scaffold executable monorepo, config, identity/RBAC, audit, migrations, Docker, health checks and synthetic seed. | Clean build/migrate/start; auth and authorization integration tests; no production data in developer env. |
| 2 QC masters | Product family/machine/variant/template/revision authoring/import/diff. | AXIS source mapping reviewed; publish revision and prove old revision stable. |
| 3 Validation/workflow | Shared validation, authoritative API evaluation, result aggregation, approved state machine. | Full doc 04 vectors and transition/permission tests pass; fixed-point edges agreed. |
| 4 Inspection UX | Responsive inspector flow, autosave/version handling, stage progress and QR flow. | QC users complete AXIS on target phone/tablet/laptop in UAT. |
| 5 Evidence | Secure upload, scan, hash, attachment and retention. | Required evidence blocks submission; access isolation and tamper tests pass. |
| 6 Review/approval | Supervisor return/review, QM approval/concession, signatures and audit. | Separation-of-duties tests and controlled role UAT pass. |
| 7 Reporting | Canonical PDF, seal/verification, download audit. | Report matches signed snapshot; tamper verification and legal review complete. |
| 8 NCR/calibration | Failure/NCR lifecycle and any approved calibration register. | QM-approved NCR closure/reinspection scenarios pass. |
| 9 Odoo | Lookup, outbox, retry/reconcile and mapping. | Odoo outage/recovery test proves no lost QC record; pilot policy approved. |
| 10 Hardening | Backup/restore, monitoring, security testing, performance, responsive/accessibility and production runbook. | Restore drill, security signoff, UAT signoff, change/release procedures complete. |

## K. UAT plan

Run with QC inspectors, supervisors, QM, Engineering, IT and Production on production-like synthetic or approved pilot data. Record operator/device, build, template revision, expected result, actual result, evidence and defect ID.

1. Complete an AXIS-MM checklist on tablet and phone; verify stage progress, draft save/reload and no lost entries after network interruption.
2. Enter values at inclusive min/max, just outside each boundary, comma decimal, malformed unit suffix and negative tolerance; verify same result in UI and server.
3. Test each type: quantity, exact numeric/text, select accept/reject, yes/no, pass/fail and mandatory/optional blank.
4. Verify critical fail dominates missing; missing/evidence blocks completion; non-critical fail becomes HOLD; all valid results PASS.
5. Verify variant-only checks are included/excluded correctly and variant changes are blocked after values exist, pending Engineering's confirmed policy.
6. Verify wrong role, wrong company, inactive user, forged client result, stale version, duplicate request, and direct unauthorized evidence/report URL are rejected and audited.
7. Verify required evidence, invalid file, malware test file, oversized file, hash mismatch, deletion attempt after signing and upload retry behavior.
8. Verify supervisor return reason, returned field edit policy, signature revocation/audit, resubmission, distinct reviewer/approver and HOLD concession policy.
9. Publish a new template revision; prove existing inspection remains on prior revision with unchanged labels/specs/rules/report.
10. Verify PDF lock before signatures, required slot sequencing, password re-auth timeout/single-use behavior, report hash, PAdES validation, tamper failure, revocation and every download audit event.
11. Make Odoo unavailable during lookup/push; complete QC locally, observe retry/dead-letter behavior, restore Odoo and reconcile without duplicate records.
12. Restore database, evidence and signing key material on UAT; verify report and evidence hashes, login, audit search and recovery time against approved RPO/RTO.
13. Test keyboard-only use, screen reader labels, contrast/non-color states, 200% zoom, phone portrait/landscape, tablet touch controls and desktop review layout.
14. Confirm no sample/seed/demonstration status is presented as live management KPI; reconcile dashboard metrics against source records.

## Open decisions required before implementation

- Canonical repo and whether this packet is the initial source of truth or a handoff to another private repository.
- D1–D16 in `docs/10-open-decisions.md`, especially Odoo version/protocol, remote access, TLS, numbering, signature slots, AXIS TBC specs/variant mapping, and pilot staffing.
- State machine and separation-of-duties policy, including whether FAIL can be submitted, HOLD may be approved, and whether one person can review and approve.
- Meaning of company/entity tenancy, customer ownership and cross-entity visibility.
- Original AXIS workbook/source control, mandatory evidence/method/criticality and all acceptance criteria approval.
- Legal position and key custody for typed signatures and PAdES-sealed customer reports.
- Pilot volumes, service availability, RPO/RTO, retention, performance and accessibility acceptance thresholds.

## Implementation disposition

Phase 0 is complete. At the time the audit was prepared, no canonical code repository was available, so no application implementation could be targeted. The user has now provided the canonical repository URL. Phase 1 can proceed there while workflow/RBAC/tenant decisions remain tracked as blockers to the affected features. No production behavior is claimed by this audit.
