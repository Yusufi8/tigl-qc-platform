# 08 — Test and UAT Plan

## 1. Test pyramid
| Layer | Tool | Gate |
|---|---|---|
| Validation engine (`packages/engine`) | Vitest | **100 % line + branch**; all vectors in doc 04 |
| API unit/integration | Vitest + Testcontainers (Postgres, Redis) | ≥ 80 % lines; every guard (409, 422, 423, 403) has a test |
| DB | pgTAP | Triggers: guardrails, immutable published revision, signed-record lock, audit chain |
| Contract | Schemathesis against `api/openapi.yaml` | No 5xx; responses match schema |
| E2E | Playwright | Scripts below on Chromium + mobile WebKit viewport |
| Security | OWASP ZAP baseline in CI; manual pen-test pre go-live | No high findings |
| Performance | k6 | p95 < 400 ms for value save; PDF < 10 s |
| Accessibility | axe-core in Playwright | No serious/critical |

## 2. Must-pass E2E scenarios (automate all)
1. Inspector creates inspection from Odoo MO (sandbox Odoo), records all values, submits with signature → `submitted`.
2. Supervisor reviews and signs; QM approves and signs → `approved`; PDF downloads; Odoo MO gets `x_qc_result=PASS` + PDF attachment.
3. **PDF lock:** `GET /reports/{id}.pdf` returns 423 at each of: draft, submitted, reviewed-unsigned. Browser print of unsigned report shows watermark only.
4. Critical FAIL → status `rejected`, NCR auto-created, Production notified by email.
5. Non-critical fail → HOLD → QM concession with note → approved with concession printed on report.
6. Missing mandatory or evidence → INCOMPLETE → submit blocked.
7. Template rev C published; open rev B inspection still evaluates against rev B.
8. Signed record: value edit returns 409 `RECORD_SIGNED`; return-to-inspector voids signatures and logs it.
9. System Admin and Developer: approve/sign/publish endpoints return 403 even with crafted requests; permission matrix refuses LOCKED cells.
10. Developer cannot read prod inspections (RLS) — sandbox only.
11. SMTP test email received; notification toggles respected.
12. Admin disables a user: login refused immediately, active sessions revoked, their past signatures still render.
13. **Local accounts:** admin creates user + role + temp password → first login forces password change → role-appropriate menu; 5 wrong passwords lock the account; admin reset issues a new temp password; works with internet unplugged.
14. **Signing without Google:** sign with own password (wrong password → no signature, audit entry); sealed PDF opens in Acrobat with seal; altering one byte breaks verification; verify page recomputes hash offline.
15. **Entity by customer:** customer mapped to T&I Projects → inspection, letterhead, certificate and numbering are T&I Projects; Odoo SO company overrides; QM override audited.
16. **Machines that differ:** (a) new machine from blueprint → draft → QM publish → usable; (b) *Manual* variant hides Automatic-only checks and excludes them from result; (c) order-specific check added by QM → affects result, appears on report with reason, included in signed hash; rejected after first signature.

## 3. UAT (QC team, factory floor)
- **Who:** 2 inspectors, 1 supervisor, QM, 1 Engineering, Production head. IT facilitates, does not execute.
- **Where:** On the shop floor, on the tablets/phones actually used. Test with gloves and in bright light.
- **What:** 5 real AXIS machines run in parallel with paper (shadow mode, 2 weeks). Compare paper vs app result for every parameter; target 0 mismatches attributable to the app.
- **Exit criteria:** all must-pass scenarios green in UAT; ≤ 3 open minor defects; QM signs UAT acceptance in the app itself.
- Defects logged in Jira ITOPS (Bug type → triage → fix → UAT retest).

## 4. Pilot metrics (from report)
Time per inspection vs paper; % inspections with complete evidence; report turnaround (submit → approved PDF); data-entry errors caught by engine.
