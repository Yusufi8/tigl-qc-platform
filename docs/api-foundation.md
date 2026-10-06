# API foundation

All routes are served under `/api/v1`. Successful JSON responses use the shared server session cookie. Protected operations verify session, company membership, and the requested permission against `user_company_role` and `role_permission` in PostgreSQL. Inspection values and workflow transitions are audited in the same transaction as their write.

| Method | Route | Permission / purpose |
|---|---|---|
| GET | `/health` | Database readiness |
| POST | `/auth/login` | Local username/password login; creates an Argon2id-backed session |
| POST | `/auth/password` | Set a first-login or reset password (minimum 12 characters) |
| POST | `/auth/logout` | Revoke the current session |
| GET | `/auth/me` | Current user, default company, roles, and permissions |
| POST | `/admin/users` | `admin.users`; create IT-issued local account and role |
| POST | `/admin/users/:id/reset-password` | `admin.users`; reset password and revoke sessions |
| DELETE | `/admin/users/:id/sessions` | `admin.users`; revoke active sessions |
| GET | `/templates/axis` | `tmpl.view`; list only published AXIS-MM and AXIS-TMH revisions |
| GET | `/templates/revisions/:id` | `tmpl.view`; load published revision parameters |
| GET | `/sites` | List sites assigned to the user's issuing entities |
| GET | `/inspections` | `insp.view`; recent inspections in the default company |
| POST | `/inspections` | `insp.create`; create an in-progress inspection with an immutable revision reference |
| GET | `/inspections/:id` | `insp.view`; inspection header, revision parameters, and recorded values |
| PUT | `/inspections/:id/values` | `insp.execute`; store value/remark and recompute the inspection with the shared engine |
| POST | `/inspections/:id/submit` | `insp.execute`; submit complete inspections |
| POST | `/inspections/:id/review` | `insp.review`; start review, return with reason, or mark reviewed |
| POST | `/inspections/:id/decision` | `insp.approve`; approve or reject a reviewed inspection |
| POST | `/inspections/evaluate` | `insp.execute`; recompute against a published revision; client result/template claims are ignored |

QC result (`PASS`, `FAIL`, `HOLD`, `INCOMPLETE`) is a separate field from workflow status (`in_progress`, `submitted`, `under_review`, `returned`, `reviewed`, `approved`, `rejected`). Evidence records are not writable through the API yet; a required-evidence parameter therefore stays incomplete.
