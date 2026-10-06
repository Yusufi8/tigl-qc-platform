# Implementation status

**Updated:** 6 October 2026  
**Branch:** `codex/foundation-validation`

## Phase 0 — Audit

Completed. See [`audit/phase-0-project-audit.md`](audit/phase-0-project-audit.md). The audit reflects the packet at the time of review; the user supplied the canonical GitHub repository after the report was drafted.

## Initial implementation slice

- Added `packages/engine`, a pure TypeScript evaluator and inspection summarizer.
- Uses scaled `BigInt` arithmetic for exact decimal comparisons and inclusive ranges; accepts comma decimal input and rejects units/exponents.
- Implements qty, range, exact, yes/no, pass/fail, select and text checks; required evidence; optional checks; critical-fail/incomplete/hold/pass precedence; variant filtering.
- Added 26 Vitest cases, including AXIS-MM (171 checks) and AXIS-TMH (188 checks) seed contract validation.
- Fixed DDL order so `app_user` exists before `signing_certificate` declares its creator foreign key.
- Added Node/TypeScript workspace configuration and GitHub Actions checks for tests and typechecking.

## Browser UX preview

- Refreshed the packet's clickable prototype with a lighter default theme, stronger page hierarchy, more legible status and KPI cards, larger touch targets, and a responsive inspection-stage layout.
- Added a dependency-free local preview server. Run `npm run preview` with the documented Node/npm versions and open `http://127.0.0.1:4173/`.
- This is still a prototype: demo accounts and local browser storage stand in for authentication and persistence. The preview does not call the validation package or a server API.

## Verification

- Unit tests: 26 passed.
- TypeScript: `tsc --noEmit` passed.
- Static foreign-key creation-order scan: all 37 tables checked, no forward or missing references.
- GitHub Actions run [37424871869](https://github.com/Yusufi8/tigl-qc-platform/actions/runs/37424871869) completed successfully on the published feature branch: `npm ci`, all 26 tests, TypeScript checking, and clean PostgreSQL 16 schema application passed.
- Local PostgreSQL execution remains unavailable in this environment; the CI PostgreSQL 16 result is the authoritative schema execution check.

## Not implemented yet

No production authentication or RBAC service, API, inspection implementation, database migration runner, evidence service, signing/PDF workflow, Odoo integration, production deployment, or complete UAT suite is present. The clickable UI is a local-only UX prototype and is not wired to the validation package or a server. Do not deploy this repository as a production QC system.

## Next phases

1. Resolve workflow/RBAC/company-scope decisions before implementing guarded inspection transitions.
2. Create versioned migrations and validate them against PostgreSQL 16.
3. Implement server foundation: config, health/readiness, local authentication, sessions, RBAC guards, audit writes and migrations.
4. Implement template/revision persistence and seed import, then call this engine from the API as the authoritative evaluator.
5. Connect the validated inspection UX to the server, then implement evidence, review/approval, signed reporting, NCR and Odoo in the order set by the project roadmap.
