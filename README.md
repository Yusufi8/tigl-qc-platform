# TIGL QC Platform

Company-owned QC digitalization platform for T&I Global Limited and T&I Projects Private Limited. The audited product packet and the deterministic validation engine remain in this repository.

## Run the local foundation

Requirements: Docker Compose v2 and a free TCP port 8080. From the repository root:

```sh
cp .env.example .env
```

Edit `.env` and replace every `replace-with...` value with a unique random secret. Set a private bootstrap username and password of at least 12 characters, configure the approved company email domains, and set the company email/SMS delivery webhook URLs for OTP. Keep `.env` private. The delivery webhook receives JSON `{ channel, to, code, purpose, expiresInMinutes }` and should return a 2xx response only after accepting the message. `OTP_DELIVERY_TOKEN` is sent as a bearer token when set. Then run:

```sh
docker compose -f infra/docker-compose.yml up --build
```

Open [http://localhost:8080](http://localhost:8080). Startup applies database migrations, imports AXIS-MM and AXIS-TMH, and creates a local System Administrator with the bootstrap values. The administrator does not receive QC approval or template publishing authority. Local Compose uses HTTP-only cookies for localhost; set `COOKIE_SECURE=true` behind TLS before company network use.

Sign in with `BOOTSTRAP_USERNAME` and `BOOTSTRAP_PASSWORD` from your private `.env`; the example username is `qc.admin`, and there is no built-in password. On the sign-in screen, employees can request access using a company email or mobile number. The contact must be verified by OTP, then an IT System Administrator reviews the request and assigns a role and site. System Administrators cannot assign System Administrator, developer, or Quality Manager roles through this intake flow; those roles require separate authorization.

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
