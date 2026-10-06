# 03 — RBAC and Governance

Access is granted **by role, never by person**. A user has exactly one role per company (multi-company users get a role per company). Permissions are checked server-side by a NestJS guard on every route (`@RequirePerm('insp.approve')`); the UI only hides what the API already forbids.

## Roles
| Role | Purpose | Distinguishing rights |
|---|---|---|
| QC Inspector | Executes inspections | Create, record, sign *Checked by* (own inspections only) |
| QC Supervisor | First-line review | Record (assist), review + sign *Reviewed by*, return to inspector, manage NCRs |
| Quality Manager | Release authority, spec owner (with Engineering) | Approve/reject, concession, sign *Approved by*, publish template revisions, audit log |
| Engineering | Authors specifications | Draft template revisions, send for approval. **Cannot** publish or approve |
| Production | Consumer of results | View inspections/reports/NCRs; NCR owner for rework |
| Management | Oversight | Dashboard, reports, NCRs (read) |
| System Admin (IT) | Configures the platform | Users, roles, modules, branding, workflow policy, integrations, audit. **No quality authority, no inspection data** |
| Developer (IT) | Builds and maintains | Dev console, sandbox API keys, webhooks, flags. **No production data** |

Full matrix: `rbac/rbac-matrix.csv` (seeded). The role editor lets a System Admin change cells **except guardrails** below.

## Guardrails (hard-coded, not editable in UI; enforced in API + DB seed check)
| Role | Permission | Reason |
|---|---|---|
| System Admin | `insp.approve`, `report.sign`, `tmpl.publish`, `data.prod` | IT configures and administers; it does not hold quality authority or data visibility |
| Developer | `data.prod`, `insp.approve`, `report.sign` | Developers work on sandbox data only |
| Engineering | `insp.approve` | Spec author isn't release approver |
| Inspector | `insp.approve` | Can't approve own work |

Additional runtime rules: one person = one signature slot per record; signer's role must match the slot role at signing time; disabled users' sessions are revoked within 60 s (Directory sync + session check).

> Note: `data.prod` gates *all* inspection/report/NCR reads. The System Admin dashboard shows service health only. If IT ever needs record-level access for support, use a time-boxed "break-glass" grant approved by the Quality Manager and fully audited (phase 2).

## Permission keys
`dashboard.view, insp.view, insp.create, insp.execute, insp.review, insp.approve, report.view, report.sign, ncr.view, ncr.manage, tmpl.view, tmpl.edit, tmpl.publish, admin.users, admin.config, admin.integrations, admin.audit, dev.console, data.prod`

## Separation of duties summary
Spec authoring (Engineering) ≠ spec approval (QM) · Recording (Inspector) ≠ review (Supervisor) ≠ release (QM) · Configuration (IT) ≠ quality decisions (Quality).

## Accounts and roles are issued together
- Only **System Admin** creates users. The *Add user* form takes: full name, **username** (`firstname.l`), **role**, designation (printed under their signature), site, optional notification email, and generates a **temporary password**. The admin hands the credentials over in person; the user must set their own password at first sign-in, so IT never knows working passwords.
- Role changes and password resets are audited. A user has exactly one role per company (`user_company_role`); someone working for both TIGL and TIPL gets a row for each.
- New permission `insp.add_check` (add order-specific checks to a draft inspection): **Quality Manager and Engineering**; LOCKED for System Admin and Developer.
