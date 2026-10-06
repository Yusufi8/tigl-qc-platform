# 09 — Delivery Plan

Assumes 2 full-stack devs + 1 part-time QA, 2-week sprints. Adjust after estimation.

| Phase | Sprints | Scope | Exit |
|---|---|---|---|
| **0. Setup** | 0.5 | Repo, CI/CD, private registry, server(s) prepared, internal DNS (`qc` / `qc-uat` / `qc-sbx`), TLS, Compose stacks, local-account login | Hello-world behind local login on `qc-sbx.tiglobal.com` |
| **1. Core** | 2 | Shell, module registry, local accounts (create user + role + temp password), password policy, RBAC + guardrails, entities/customers, audit chain, settings, branding | Role matrix demo; pgTAP green |
| **2. Templates + engine** | 2 | Template/revision model with variants, import `seed/axis_templates.json`, engine package (100 %), *Add machine* + template editor + diff + publish | AXIS-MM/TMH live in sandbox |
| **3. Inspections** | 2 | Create (customer → issuing entity, variant), runner (stages, live result, evidence upload, remarks), order-specific checks, workflow transitions, NCR auto-create | Scenarios 1, 4–8 pass |
| **4. Reports + e-sign** | 2 | Report view, sign dialog, password re-auth, hashing, per-entity signing certificates (internal CA / .p12), PDF render (Gotenberg) + manifest + PAdES seal, verify page, 423 lock | Scenarios 2–3 pass |
| **5. Integrations** | 2 | Odoo pull/push + reconciliation, SMTP + templates + toggles, webhooks, API keys, Dev console, (optional) Google Drive/Sheets | Scenario 11–12; Odoo sandbox round trip |
| **6. Dashboard + hardening** | 1.5 | Dashboard, perf, ZAP, a11y, backups/restore drill, runbooks | UAT-ready |
| **7. UAT + pilot** | 2 | Shadow mode on 5 AXIS machines; fixes | QM UAT sign-off → go-live |
| **8. Roll-out** | ongoing | Digitise dryer families (see `seed/product-families.json`), FAT/SAT, offline capture for site commissioning, CAPA, gauge register | Per family |

≈ 14 sprints to AXIS go-live (~7 months at the assumed team size).

## Definition of Done (every story)
- Acceptance criteria met; tests added; CI green (lint, types, tests, Trivy, ZAP baseline).
- Permissions enforced server-side; audit events emitted.
- `company_id` respected; migrations reversible.
- OpenAPI updated if contract changed.
- Matches prototype UX or deviation agreed with Director of IT.
- Demoed in sandbox; Jira ticket moved through approval → UAT → prod per ITOPS workflow.

## Release process
Feature branch → PR (1 review) → merge to `main` deploys **sandbox** → tag `vX.Y.Z-rc` deploys **uat** → Director of IT + QM approve in Jira → tag `vX.Y.Z` deploys **prod** (`RELEASE` tag on the prod Compose stack). Rollback = redeploy previous `RELEASE`. Prod deploys Tue–Thu, not during despatch peaks.
