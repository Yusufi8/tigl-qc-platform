# 01 — Product Requirements

## 1. Problem
Machine QC at TIGL runs on paper/Excel checklists (e.g. AXIS Milling Machine: component verification, assembly checks, alignment, 27 tolerance checks, electrical testing, tools list). Problems: tolerances not enforced, no evidence, no revision control, no traceability to Odoo SO/MO/serial, approvals on paper, reports re-typed for customers.

## 2. Goal
A company-owned web app at `qc.tiglobal.com` where inspectors run inspections on a tablet/phone/PC against controlled machine templates; the system validates deterministically, routes for review/approval with e-signatures, produces a signed customer-grade PDF, and links everything to Odoo.

**Pilot success metrics (8 weeks, AXIS line):** ≥ 90% of AXIS inspections captured digitally · median entry time ≤ paper baseline · 0 PASS results with missing mandatory data · 100% of despatched AXIS machines have a signed PDF on the Odoo MO · inspection complete → signed PDF < 1 working day.

## 3. Roles
QC Inspector · QC Supervisor · Quality Manager · Engineering · Production · Management · System Admin · Developer. Matrix: `03-rbac-and-governance.md`.

## 4. Modules (feature modules, toggleable unless marked core)
| Module | Key | Toggle | Summary |
|---|---|---|---|
| Core (auth, RBAC, audit, settings, notifications) | `core` | No | Always on |
| Dashboard | `dashboard` | Yes | KPIs, weekly trend, top failing params, pass rate by template, activity. IT roles see service health only |
| Inspections | `inspections` | No | Create from template (+ Odoo MO lookup), staged runner, live validation, evidence, remarks |
| Approvals | `approvals` | Yes | Supervisor review queue, QM approval queue, concession for HOLD |
| QC Reports | `reports` | Yes | Preview, Adobe-style e-sign (built in), sealed signed PDF |
| Non-conformance | `ncr` | Yes | Auto-raised on critical FAIL, disposition, closure, re-inspection link |
| Machine templates | `templates` | Yes | Template → stage → section → parameter; draft/review/publish revisions; diff |
| Integrations | `integrations` | Yes | Odoo, SMTP config + test, optional Google Drive/Sheets |
| Administration | `admin` | No | Users, role matrix, modules, branding, workflow/e-sign policy, entities/sites, audit log |
| Developer console | `devconsole` | Yes | API explorer (sandbox), keys, webhooks, feature flags, health |

## 5. Functional requirements

### 5.1 Inspection lifecycle
`draft → submitted → reviewed → approved`; branches `submitted → draft` (returned), `reviewed → rejected`, `submit with critical FAIL → rejected + NCR`.

| ID | Requirement | Acceptance criteria |
|---|---|---|
| INS-01 | Create from a **published** template's latest revision | Draft/in-review revisions not selectable. `template_revision_id` stored. |
| INS-02 | Odoo lookup by MO number | Pre-fills customer, SO, product, serial (`stock.lot`). Manual entry allowed if Odoo is down; record flagged "not linked" and can be linked later. |
| INS-03 | Header: customer, SO, WO, serial, machine type, despatch date, entity, site | Customer, WO, serial mandatory. Duplicate open inspection for same serial+template warns. |
| INS-04 | Staged runner with per-stage progress (recorded/total, failed) | Only the active stage renders; usable at 360 px width. |
| INS-05 | Input types `qty`, `range`, `exact`, `yes_no`, `pass_fail`, `select`, `text` | Per `04-validation-engine.md`. Numeric keypad on mobile for numeric types. |
| INS-06 | Live result chip + tolerance gauge on range params | Updates ≤ 250 ms after typing. |
| INS-07 | Evidence per parameter (photo/video/PDF; camera capture on mobile) | ≤ 25 MB/file; images compressed client-side to ≤ 2 MP. Evidence-required params can't PASS without a file. |
| INS-08 | Remarks per parameter | Printed under the parameter on the report. |
| INS-09 | Autosave | Every change persisted; optimistic UI with retry and conflict detection (`version` column). |
| INS-10 | Submit and sign (Checked by) | Disabled while result = INCOMPLETE. Opens e-sign dialog. |
| INS-11 | Critical FAIL on submit auto-raises NCR, status → rejected | NCR linked to inspection + parameter; notifications sent. |
| INS-12 | Supervisor: Review and sign, or Return to inspector | Return voids the Checked-by signature (audited). |
| INS-13 | QM: Approve and sign; HOLD needs concession text (≥ 10 chars), printed on report | FAIL can never be approved (server returns 422). |
| INS-14 | One person, one signature per record | Same user can't fill two slots. |
| INS-15 | Lock after first signature | Value writes return 409 `RECORD_SIGNED`. |
| INS-16 | Re-inspection | On a rejected inspection, "Re-inspect" creates a new one with `parent_inspection_id`, header copied, values blank. |
| INS-17 | QR/barcode | Scan WO/serial tag to open or start (flag `barcodeScan`). |

### 5.2 Templates
| ID | Requirement | Acceptance criteria |
|---|---|---|
| TPL-01 | Template → revision → stage → section → parameter | As in `seed/axis_templates.json` |
| TPL-02 | Param attributes: stable code (e.g. `TOL-018`), label, type, unit, min, max, expected, options, accept list, mandatory, critical, evidence, hint, sequence, `spec_tbc` | Codes stable across revisions so trends work |
| TPL-03 | Engineering creates draft (copy of current), edits, sends for approval | Approver sees field-level diff |
| TPL-04 | QM publishes; previous → superseded; effective date set | Existing inspections untouched (automated test) |
| TPL-05 | Import/export template JSON + XLSX | Bulk authoring of new machine families (VIBRANTneo, Coconut Conquest, Apron Band, etc.) |
| TPL-06 | "Spec TBC" flag | Highlighted in runner and template; publishing with TBC params warns |

### 5.3 Reports and e-signature
See `05-esignature-spec.md`. Adobe-style dialog (Type full name / Initials, designation, 4 handwriting styles, live preview, intent statement, re-auth). Signature block appended under the report. **PDF download, print, Drive archive and Odoo attachment are blocked until all required slots are signed.** Unsigned preview shows an "UNSIGNED DRAFT" watermark.

### 5.4 NCR
Auto-create on critical FAIL. Fields: number, inspection, parameter, description, disposition (Rework / Repair / Use as-is (concession) / Scrap / Return to supplier), owner, due date, root cause, status, closure evidence, re-inspection link. Close requires disposition.

### 5.5 Dashboard
KPIs: first-pass yield (30 d), waiting on sign-off, on hold, open NCRs, drafts in progress. Charts: weekly inspections by result, top failing params, pass rate by template, activity. Filters: entity, site, template, date range. Export XLSX / Google Sheets.

### 5.6 Administration (System Admin)
Users (IT-issued username + temporary password + role; disable; reset password), role-permission matrix (locked guardrail cells), modules on/off, branding (name, colour, theme, report header/footer), workflow & e-sign policy (optional Reviewed-by slot, re-auth, numbering, retention), entities & sites, integrations, audit log + export.

### 5.7 Notifications
In-app + email (SMTP or Gmail API) on: submitted, reviewed, approved, critical fail, NCR raised/closed, signature requested, template published. Per-event toggles.

### 5.8 Non-functional
| Area | Target |
|---|---|
| Availability | 99.5% in working hours (07:00–22:00 IST, Mon–Sat) |
| Performance | p95 API < 300 ms; stage render < 1 s on mid-range Android tablet |
| Devices | Chrome/Edge (Windows), Chrome (Android), Safari iOS 16+ |
| Accessibility | WCAG 2.1 AA; runner touch targets ≥ 44 px |
| Offline | Phase 2 (PWA + IndexedDB queue), flag `offlineCapture` |
| Retention | QC records, evidence and audit log: 10 years (configurable) |
| Time | IST on reports; ISO 8601 UTC in API/DB |

### 5.9 Inspection types and product families
| ID | Requirement | Acceptance criteria |
|---|---|---|
| FAM-01 | Templates belong to a **product family** (`seed/product-families.json`): AXIS, Apron Band, Multipass Band, VIBRANTneo, Coconut Conquest, Dual-Stage, Heat Pump, Radiators, HAG, prep equipment, coconut lines | Family shown on template, inspection, dashboard filters |
| FAM-02 | Inspection type per template: IPQC, FQC, FAT, SAT | Type printed on report; signature slots configurable per type (FAT/SAT may add customer witness slot) |
| FAM-03 | Line/project inspections (turnkey) reference child machine inspections | Line FAT/SAT cannot be approved while any child inspection is not approved |
| FAM-04 | Trial-run parameters support time-series readings (e.g. temperature at intervals) | Param type `series` with per-reading min/max; engine evaluates every reading |
| FAM-05 | SAT captured offline at customer site | Flag `offlineCapture`; sync with conflict detection; signatures only once online (re-auth) |

### 5.10 Accounts, entities, machine flexibility (decisions of 01 Oct 2026)
| ID | Requirement | Acceptance criteria |
|---|---|---|
| ACC-01 | Local accounts only; no LDAP/Google sign-in | Login works with the network cable to the internet unplugged |
| ACC-02 | System Admin creates user + role + temporary password in one step; first login forces new password | User cannot reach any page until password changed; admin never sees the new password |
| ACC-03 | Password policy, lockout, idle timeout, optional TOTP, admin reset | Configurable in Admin → Sign-in and passwords; all events audited |
| ENT-01 | Issuing entity (T&I Global Ltd / T&I Projects Pvt Ltd) comes from the **customer**; Odoo SO company overrides | Letterhead, address, report numbering, signing certificate follow the entity; Admin/QM can override with audit |
| ENT-02 | Customer master maintained by Admin/QM; new customer typed at inspection start is added with the chosen entity | Customers tab lists entity per customer |
| SIG-01 | Signatures and PDF seal are **built into the platform**; no Google or third-party signing service | Per-entity certificate (internal CA or uploaded .p12); PDF opens in Acrobat with seal; tamper test fails verification |
| MCH-01 | Engineering can add a new machine without code: blank/blueprint, copy, or import | Draft rev A → QM publish |
| MCH-02 | Variants per machine; checks can apply to selected variants | Manual variant hides Automatic-only checks; counts and PASS/FAIL exclude them |
| MCH-03 | Order-specific checks on a draft inspection by QM/Engineering with mandatory reason | Included in result, report and signed hash; notification to QM |

## 6. Out of scope (v1)
Incoming/supplier inspection, calibration management, SPC charts, customer portal (phase 3 flag), AI report narrative (phase 3 flag — narrative only, never results).
