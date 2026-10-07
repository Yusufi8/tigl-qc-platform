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

## Remaining Phase 1 work

Evidence capture/storage and scanning, TOTP, user administration UI, full supervisor review UI, audit-chain verification integration, the complete API-backed mobile checklist, browser camera support, Redis/BullMQ jobs, and Playwright desktop/tablet/mobile E2E coverage remain. Compose/Docker and PostgreSQL execution are not verified in the current environment. Do not deploy this repository as a production QC system until the exit criteria pass.

## Next phases

1. Resolve workflow/RBAC/company-scope decisions before implementing guarded inspection transitions.
2. Create versioned migrations and validate them against PostgreSQL 16.
3. Implement server foundation: config, health/readiness, local authentication, sessions, RBAC guards, audit writes and migrations.
4. Implement template/revision persistence and seed import, then call this engine from the API as the authoritative evaluator.
5. Connect the validated inspection UX to the server, then implement evidence, review/approval, signed reporting, NCR and Odoo in the order set by the project roadmap.

## Application foundation work in progress — 6 October 2026

- Added `apps/web`, `apps/api`, and `apps/worker` directories and Dockerfiles, a local Compose stack, Caddy routing, and `.env.example`.
- Added managed SQL migrations: the original PostgreSQL schema as migration 001, plus sessions, audit extensions, RBAC seed/guardrails, published-revision immutability, and workflow-state extensions in migration 002.
- Added an AXIS seed importer and a one-time local administrator bootstrap command.
- Implemented API endpoints for local sign-in, password change, logout, current user, administrator provisioning/reset/revoke, AXIS revision lookup, inspection creation, result evaluation, value recording, and submission. The API recomputes results with the shared engine.
- Added a responsive Next.js shell and sign-in view.
- Verified 28 tests passed and TypeScript typecheck; the three PostgreSQL RBAC tests skip without a configured database. Next.js production build succeeded.
- Docker/PostgreSQL execution was not available in the current environment. No database migration, API integration, RBAC integration, E2E, evidence, or end-to-end inspection run has yet been verified. Phase 1 remains in progress.
