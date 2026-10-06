# TIGL QC Platform

Company-owned QC digitalization platform for T&I Global Limited and T&I Projects Private Limited. The audited product packet and the deterministic validation engine remain in this repository.

## Run the local foundation

Requirements: Docker Compose v2 and a free TCP port 8080. From the repository root:

```sh
cp .env.example .env
```

Edit `.env` and replace every `replace-with...` value with a unique random secret. Set a private bootstrap username and password of at least 12 characters. Keep `.env` private. Then run:

```sh
docker compose -f infra/docker-compose.yml up --build
```

Open [http://localhost:8080](http://localhost:8080). Startup applies database migrations, imports AXIS-MM and AXIS-TMH, and creates a local System Administrator with the bootstrap values. The administrator does not receive QC approval or template publishing authority. Local Compose uses HTTP-only cookies for localhost; set `COOKIE_SECURE=true` behind TLS before company network use.

To stop the stack, press Ctrl+C or run `docker compose -f infra/docker-compose.yml down`. Database, Redis, and evidence volumes remain. `down -v` removes them.

## Development commands

Use Node.js 22 or 24 and npm 10 or later (see `.nvmrc`). Run `npm ci`, then:

```sh
npm test
npm run typecheck
npm run db:migrate
npm run db:seed
npm run api
npm run web
```

Database commands need `DATABASE_URL` and `psql`; the API also needs `AUDIT_HMAC_SECRET`. The Next.js app proxies `/api/*` to `API_INTERNAL_URL` (defaults to `http://127.0.0.1:3001`).

## Current implementation scope

The API implements local Argon2id sign-in, first-login password changes, expiring HttpOnly sessions, lockout, administrator user creation/password reset/session revocation, company-scoped permission checks, published AXIS revision lookup, inspection header creation, value/remark recording, server-side evaluation, submission, supervisor workflow transitions, and QM decisions. Client-supplied PASS/FAIL values are ignored. The Next.js app provides a responsive shell and a parameter-by-parameter AXIS inspection flow connected to the API. The source packet remains available in [`TIGL-QC-Dev-Packet/`](TIGL-QC-Dev-Packet/); the earlier standalone UX preview remains a prototype.

This is an early implementation slice, not the Phase 1 exit build. Evidence upload and malware scanning, supervisor review screens, TOTP, an HTTP audit-chain verification endpoint, Redis/BullMQ processors, PDF output, and Playwright desktop/tablet/mobile E2E suites remain. The worker container is a readiness process without queue processors. Docker and PostgreSQL were unavailable in the current environment, so migrations, Compose startup, and API database flows have not been run here. Do not use this build for production QC decisions until those workflows and tests are complete.

See [`docs/api-foundation.md`](docs/api-foundation.md) for the route list.

## Validation semantics

- Decimal measurements accept `.` or `,` as the decimal separator; units and exponent notation are rejected.
- Numeric comparisons use decimal integer arithmetic; ranges are inclusive.
- Empty mandatory values and required evidence are incomplete.
- Summary precedence is critical FAIL, INCOMPLETE, non-critical HOLD, then PASS.
- Checks outside the selected variant are excluded.
- Engineering and Quality must approve all AXIS TBC specifications before pilot use.
