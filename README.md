# TIGL QC Platform

Company-owned QC digitalization platform for T&I Global Limited and T&I Projects Private Limited. The audited product packet and the deterministic validation engine remain in this repository.

## Run the local foundation

Requirements: Docker Compose v2 and free TCP ports 3000 and 8080. Use Node.js 22 or 24 and npm 10+ for non-container development commands. From the repository root:

```sh
cp .env.example .env
```

Edit `.env` and replace every `replace-with...` value with a unique random secret. Set a private bootstrap username and password of at least 12 characters, configure the approved company email domains, and set the company email/SMS delivery webhook URLs for OTP. Keep `.env` private. The delivery webhook receives JSON `{ channel, to, code, purpose, expiresInMinutes }` and should return a 2xx response only after accepting the message. `OTP_DELIVERY_TOKEN` is sent as a bearer token when set. Then run:

```sh
docker compose -f infra/docker-compose.yml -f infra/docker-compose.dev.yml up --build
```

Open [http://localhost:8080](http://localhost:8080). This explicit local-development Compose overlay enables the development-only OTP logger when no delivery webhook is configured; codes appear in the API container logs and are never stored in plaintext. Do not use the development overlay for a company or production deployment. Startup applies database migrations, imports AXIS-MM and AXIS-TMH, and creates a local System Administrator with the bootstrap values. The administrator does not receive QC approval or template publishing authority. Local Compose uses HTTP-only cookies for localhost; set `COOKIE_SECURE=true` behind TLS before company network use.

Sign in with `BOOTSTRAP_USERNAME` and `BOOTSTRAP_PASSWORD` from your private `.env`; the example username is `qc.admin`, and there is no built-in password. On the sign-in screen, employees can request access using a company email or mobile number. The contact must be verified by OTP, then an IT System Administrator reviews the request and assigns a role and site. System Administrators cannot assign System Administrator, developer, or Quality Manager roles through this intake flow; those roles require separate authorization.

To stop the stack, press Ctrl+C or run `docker compose -f infra/docker-compose.yml down`. Database, Redis, and evidence volumes remain. `down -v` removes them.

## Development commands

Use Node.js 22 or 24 and npm 10 or later (see `.nvmrc`). Run `npm ci`, then run the API and web frontend in separate terminals:

```sh
npm run api
```

In the second terminal, run:

```sh
npm run web
```

The API listens on port 3001 and the Next.js frontend on port 3000; open [http://localhost:3000](http://localhost:3000). The Next.js app proxies `/api/*` to `API_INTERNAL_URL` (defaults to `http://127.0.0.1:3001`). Both the API and database scripts load the ignored root `.env`; the database URL is derived from `POSTGRES_USER` and `POSTGRES_PASSWORD` for a local PostgreSQL server. Docker Compose remains the supported one-command way to start PostgreSQL 16, migrations, seed data, and bootstrap.

For local access-request testing without mail/SMS infrastructure, `npm run api` runs with `NODE_ENV=development` and prints a clearly marked `[DEVELOPMENT OTP - LOCAL ONLY]` code in the API terminal. The Compose development overlay does the same. Production mode never logs a code and still requires the configured delivery webhook.

## Current implementation scope

The API implements local Argon2id sign-in, first-login password changes, expiring HttpOnly sessions, lockout, OTP-verified employee access requests, administrator review and role/site assignment, password reset/session revocation, company-scoped permission checks, published AXIS revision lookup, inspection header creation, value/remark recording, server-side evaluation, submission, supervisor workflow transitions, and QM decisions. Client-supplied PASS/FAIL values are ignored. The Next.js app provides a responsive shell, a parameter-by-parameter AXIS inspection flow, employee access request screens, and an administrator review queue. OTP delivery uses configured company webhook endpoints; email requests require an allowlisted domain. The source packet remains available in [`TIGL-QC-Dev-Packet/`](TIGL-QC-Dev-Packet/); the earlier standalone UX preview remains a prototype.

This is an early implementation slice, not the Phase 1 exit build. Evidence upload and malware scanning, full supervisor review screens, TOTP, an HTTP audit-chain verification endpoint, Redis/BullMQ processors, PDF output, and Playwright desktop/tablet/mobile E2E suites remain. The worker container is a readiness process without queue processors. Docker is unavailable in the current environment; the PostgreSQL integration workflow runs in GitHub CI. Real OTP delivery requires the company webhook endpoints and office domain policy to be configured in `.env`. Do not use this build for production QC decisions until the remaining workflows and tests are complete.

See [`docs/api-foundation.md`](docs/api-foundation.md) for the route list.

## Validation semantics

- Decimal measurements accept `.` or `,` as the decimal separator; units and exponent notation are rejected.
- Numeric comparisons use decimal integer arithmetic; ranges are inclusive.
- Empty mandatory values and required evidence are incomplete.
- Summary precedence is critical FAIL, INCOMPLETE, non-critical HOLD, then PASS.
- Checks outside the selected variant are excluded.
- Engineering and Quality must approve all AXIS TBC specifications before pilot use.
