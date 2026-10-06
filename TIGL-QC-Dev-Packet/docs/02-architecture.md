# 02 — Architecture

## 1. Stack (aligned with the Nameplate tool spec so IT runs one pattern)
| Layer | Choice | Why |
|---|---|---|
| Web | **Next.js 15** (App Router, TypeScript, React Server Components), Tailwind + shadcn/ui, TanStack Query | Fast shop-floor UI, PWA-capable |
| API | **NestJS 10** (TypeScript) | Native module system = our feature modules; guards for RBAC |
| ORM / DB | **Prisma** on **PostgreSQL 16** (self-hosted, streaming replica optional) | Relational integrity, JSONB for snapshots |
| Shared | `packages/engine` — validation engine (pure TS, zero deps) | Same code in browser and server |
| Jobs | **BullMQ** on Redis | PDF render + seal, email, Odoo sync, optional Drive archive, webhooks — all retried |
| PDF | **Gotenberg** (Chromium) HTML→PDF, then **pdf-lib** for signature manifest/metadata, then **PAdES seal** with the issuing entity's certificate (built in, see `05` §4a) | Pixel-match with on-screen report; tamper-evident |
| Files | **MinIO** (S3-compatible, on our own storage; or plain encrypted disk) — private buckets, 5-min signed URLs, object-lock on signed PDFs | Optional mirror to Drive only if enabled |
| Auth | **Local accounts only**: username + password (Argon2id), role assigned by IT at creation, forced change on first login, lockout, idle timeout, optional built-in TOTP. **No LDAP, no Google, no internet dependency** | Own hosting, own users, no licence exposure |
| Secrets | Docker/Compose secrets or root-only env file on the host (+ encrypted backup copy kept by Director of IT) | Odoo key, SMTP password, signing-key master key, HMAC keys |
| Hosting | **TIGL on-prem Linux server(s)**, Docker Compose, **Caddy/Nginx** reverse proxy with TLS | We are our own vendor: full control, data stays in our premises |
| Observability | Loki/Promtail or plain JSON logs + Prometheus/Grafana (or Uptime Kuma on `/api/v1/health`) | |
| CI/CD | GitHub Actions (or Gitea/GitLab runner) → private container registry → `docker compose pull && up -d` on UAT (auto) / prod (manual approval) | Change control via Jira ITOPS |

**Hosting decision made:** TIGL hosts it locally. Cloud Run/GCP is **not** used. Every service is a container; see `infra/docker-compose.prod.yml` and `infra/deployment-onprem.md`. Cloud migration remains possible later because nothing is cloud-specific.

## 2. Logical architecture
```
Browser / tablet (Next.js PWA) ──HTTPS──> Caddy (TLS) ──> web (container)
                                                          └─> api (NestJS) ──> Postgres
                                                                   │                 ──> Redis (BullMQ)
                                                                   │                 ──> MinIO (evidence, PDFs)
                                                                   └─ enqueue ──> worker ──> Gotenberg + sealing
                                                                                         ├─> Odoo (JSON-RPC)
                                                                                         ├─> (optional) Google Drive / Sheets
                                                                                         ├─> SMTP relay
                                                                                         └─> Webhook subscribers (n8n etc.)
```

## 3. Module boundaries (NestJS modules = product modules)
```
apps/api/src/modules/
  core/            auth (local accounts, Argon2id, sessions, lockout, TOTP, signing re-auth), rbac (guards, permission cache), audit (interceptor), settings, feature-flags, entities
  users/           users (IT-issued username + temp password + role), roles, permissions, password reset by admin
  templates/       templates, revisions, stages, sections, parameters, diff, import/export
  inspections/     inspections, values, evidence, transitions (state machine), re-inspection
  engine/          thin wrapper over packages/engine (server-authoritative results)
  esign/           signature slots, signing ceremony, document hashing, verification
  reports/         report model, HTML render, PDF job, lock enforcement, PAdES seal
  signing/         signature ceremony, per-entity certificates (internal CA / .p12), verify page
  ncr/             NCRs, dispositions
  notifications/   in-app, email templates (MJML), channel = smtp|gmail
  integrations/    odoo (client, mapper, sync jobs, reconciliation), google (optional: drive, sheets), smtp
  dashboard/       materialised views + KPI queries
  devconsole/      api keys, webhooks (HMAC), sandbox seeding
```
Rules: modules talk via exported services or domain events (`@nestjs/event-emitter` → BullMQ for anything external). No module reads another module's tables directly. Each module has `module.manifest.ts` with `{key, toggleable, permissions[], navItems[], events[]}`; the web app builds navigation from `/api/v1/me/modules` (enabled ∩ permitted). Disabling a module returns `404 MODULE_DISABLED` from its routes.

## 4. Repo layout (pnpm + Turborepo monorepo)
```
tigl-qc/
  apps/web            Next.js
  apps/api            NestJS
  apps/worker         NestJS standalone (BullMQ processors)
  packages/engine     validation engine + test vectors (100% branch coverage gate)
  packages/schemas    zod schemas shared web/api (generated types from OpenAPI)
  packages/ui         design tokens (from prototype CSS variables), components
  prisma/             schema.prisma (generated from db/schema.sql), migrations, seed (axis_templates.json, rbac-matrix.csv)
  infra/              docker-compose (dev + prod), Caddy config, backup scripts, deployment notes
  docs/               this packet
```

## 5. Environments
| Env | URL | Data | Who |
|---|---|---|---|
| local | localhost | seed + synthetic | devs |
| sandbox | `qc-sandbox.tiglobal.com` | synthetic only; Odoo **staging** DB | devs, Developer role |
| staging/UAT | `qc-uat.tiglobal.com` | copy of templates, synthetic inspections | QC team UAT |
| production | `qc.tiglobal.com` | real | users |

Developer role exists only in sandbox/staging; in production the role has no data permissions (enforced in RBAC seed and guardrail table).

## 6. DNS, TLS and intranet exposure
- TIGL is its own DNS/hosting vendor: add an **internal DNS record** `qc.tiglobal.com` → the server's LAN IP (also `qc-uat`, `qc-sbx`) on the company DNS server / router; no external vendor ticket needed.
- If staff at remote sites/customer sites must reach it, publish only through the company **VPN** (WireGuard/OpenVPN) or a firewall rule limited to known IPs. Not exposed to the public internet by default.
- **TLS:** either a public cert (Let's Encrypt DNS-01 challenge, works for internal-only names) or the **TIGL internal CA** certificate installed on company PCs. Caddy handles renewal.
- Server time via NTP (signatures carry server time).

## 7. Key design decisions
1. **Snapshot templates into revisions** (normalised tables, immutable once published). Inspections reference `template_revision_id`; parameter rows referenced by `parameter_id` within that revision.
2. **Results are computed, then persisted.** Server recomputes on every value write and stores `result`, `counts` on the inspection; `inspection_value.result` stored per value for analytics.
3. **Signatures bind to a hash** of the canonical record (see `05`). Any post-sign mutation is impossible by state machine and detectable by hash.
4. **Outbox pattern** for integrations: business transaction writes `outbox_event`; worker delivers to Odoo/email/webhooks with retries and dead-letter; reconciliation report in admin.
5. **Multi-entity**: `company_id` on all business tables + row-level filter in the Prisma middleware (Postgres RLS optional phase 2).

## 8. Customer → issuing entity (T&I Global Ltd vs T&I Projects Pvt Ltd)
- `customer.company_id` = default issuing entity. Inspection creation: pick/type customer → issuing entity auto-set (Admin/QM can override); if linked to an Odoo sale order, **the SO's company wins** (mapped Odoo `res.company` → `company.id`).
- Everything that identifies the issuer follows `inspection.company_id`: letterhead and address, report number series (optional per entity), signing certificate, email sender name, Odoo company on push.
- Templates are shared by both entities; users may work for both (`user_company_role`).

## 9. Adding machines that differ — three levels, no code changes
| Level | Situation | How |
|---|---|---|
| 1. New machine | Apron dryer, VIBRANTneo, radiator, coconut line… | Engineering: *Add machine* → blank (family stage blueprint), copy of a similar machine, or XLSX/JSON import → add checks → QM publishes. Stages/sections/checks, 7 check types, critical/evidence/mandatory flags, all in the UI |
| 2. Variants of one machine | AXIS Automatic vs Manual; dryer Steam vs Thermic fluid | Template lists **variants**; each check has *applies to* (all or selected variants). Inspector chooses the variant at start; the engine evaluates only applicable checks. Variant set is part of the revision |
| 3. One-off build | Customer wants a longer chute / extra sensor | Engineering or QM **adds order-specific checks** to that draft inspection (reason mandatory). Stored in `inspection_extra_parameter`, evaluated by the same engine, printed on the report, included in the signed hash; also notifies QM. Repeats of the same ask are a signal to promote it into a template revision |
Never edit a published revision. Engine input = *effective checklist* = revision params filtered by variant + extra params (test vectors in `04`).
