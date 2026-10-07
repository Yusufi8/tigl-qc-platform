# Implementation status

**Updated:** 7 October 2026
**Branch:** `codex/auth-runtime-fixes` (the foundation PR was merged to `main`)

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
- At the time of this audit, local PostgreSQL execution was unavailable; see the 7 October runtime verification below for the later disposable PostgreSQL 14 smoke run.

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

## Authentication runtime verification — 7 October 2026

- The configured app URL was port 3002 because that Next.js process had `PORT=3002`; it was serving this repository's web app. Port 3000 is the standard Next.js development port, 3001 is the API, 8080 is the Compose Caddy entry point, and 4173 is the standalone prototype preview.
- The API on 3001 initially returned 503 because it was launched with an invalid database connection. Docker is not installed. The host PostgreSQL 14 service also required credentials unavailable to this workspace, so a fresh disposable PostgreSQL 14 cluster was created under `/tmp` for verification; no existing database was changed.
- Applied migrations 001–003, seeded AXIS-MM (171 parameters) and AXIS-TMH (188 parameters), and bootstrapped `qc.admin` with the System Administrator role, TIGL company, and Main Factory site. The generated bootstrap password is stored only in the ignored local `.env` and is changed on first login.
- The API health endpoint and the Next.js `/api/*` proxy both returned healthy. A real API smoke flow passed bootstrap login, password change, PostgreSQL-backed session, logout/relogin, local development OTP, contact verification, admin role/site approval, employee login, and inspector RBAC checks. AXIS-MM inspection creation and server-side value validation passed.
- Unit and database tests: 35 passed against the disposable PostgreSQL database. TypeScript checking and the production web build passed. This local database is PostgreSQL 14; Docker Compose PostgreSQL 16 has not been run here.
- Real company OTP webhooks are not configured. Development mode logs a clearly marked, short-lived OTP to the API console only; production still requires the email/SMS webhook. The sample allowlisted domain remains `tiglobal.com`; the company's actual office email domain needs confirmation.
- A complete AXIS inspection submission remains unverified because evidence upload is not implemented and required-evidence checks must not be bypassed. Phase 1 remains in progress.
