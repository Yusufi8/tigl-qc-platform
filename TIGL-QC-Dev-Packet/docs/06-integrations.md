# 06 — Integrations (Odoo, SMTP, Open API; Google optional)

All outbound calls go through the **outbox → BullMQ worker** with exponential backoff (1m, 5m, 30m, 2h, 12h), dead-letter queue, and an admin reconciliation view. Configuration lives in Admin → Integrations; secrets are write-only and stored in Secret Manager.

## 1. Odoo ERP
**Connection:** URL, DB, integration user, API key, version (16/17/18/19), protocol (JSON-RPC `/jsonrpc` with `execute_kw`; XML-RPC; JSON-2 `/json/2/` for Odoo 19+). Use a dedicated `qc-integration` Odoo user with minimum access rights (read sale/mrp/stock/product/partner; write `mrp.production` QC fields, `ir.attachment`, `mail.message`). *Test connection* calls `common.version` + `authenticate` + `check_access_rights`.

**Pull (on inspection create, by MO name):**
| Odoo | QC field |
|---|---|
| `mrp.production` (`name`, `product_id`, `lot_producing_id`, `origin`, `date_deadline`) | WO, product, serial, SO ref, planned despatch |
| `sale.order` (`name`, `partner_id`) via `origin` / `procurement_group_id` | SO, customer |
| `res.partner.name` | Customer |
| `product.product.default_code` → template mapping table (`product_template_map`) | Suggested QC template |
| `stock.lot.name` | Machine serial no. |

**Push (on approval):** write `x_qc_result` (selection PASS/HOLD/FAIL), `x_qc_inspection_ref`, `x_qc_approved_on` on `mrp.production`; create `ir.attachment` (signed PDF, `res_model=mrp.production`); post chatter `message_post` with summary + link. Custom fields `x_qc_*` require a small Odoo Studio change or a minimal custom module (`tigl_qc_bridge`). Optional: server action blocking delivery validation (`stock.picking.button_validate`) when linked MO lacks `x_qc_result in (PASS, HOLD-approved)`.

**Native Odoo Quality app?** `quality_control` is Odoo **Enterprise**. If TIGL runs Enterprise, optionally also create `quality.check` records; if Community, use the `x_qc_*` fields above. Confirm edition (see open decisions).

**Reconciliation:** nightly job lists approved inspections without Odoo push success and MOs marked done without QC result.

**Inbound (open API for Odoo):** Odoo server actions/automations can call `GET /api/v1/inspections?work_order=WH/MO/00261` with a scoped API key, or subscribe to webhooks.

## 2. Google Workspace — OPTIONAL, not used for sign-in or signatures
Decision: **no Google/LDAP login and no Google dependency for e-signatures** (licensing and control). Google is an optional, off-by-default connector for convenience only:
| Capability | API / scope | Use |
|---|---|---|
| Drive archive | Drive API `drive.file` (service account) | Copy of signed PDFs to a Shared Drive — only if IT enables it |
| Sheets export | Sheets API `spreadsheets` | Dashboard / inspection data export |
| Calendar (opt.) | `calendar.events` | Customer witness inspections |
If Google is switched off (default) nothing in the platform degrades. The primary archive is the local object store + backups.

## 3. SMTP
Settings: host, port, security (STARTTLS / SSL/TLS / none), username, password/app password, from name, from address, reply-to. Default: **the company mail server** (whatever hosts `@tiglobal.com` mail), SMTP AUTH from a dedicated `qc-notify@` mailbox; any SMTP server works. Email is **notification only**: no one signs in or signs documents through email. Library: Nodemailer with pooled transport. Templates: MJML → HTML + plain text, per event, editable subject/body with Handlebars variables (`{{inspection.id}}`, `{{report.url}}`…). *Send test email* in admin. Delivery status logged in `email_log`; bounces surfaced. Per-event toggles and recipient rules (role-based, plus SO salesperson from Odoo for "approved").

## 4. Open REST API
- Base: `https://qc.tiglobal.com/api/v1`; contract: `api/openapi.yaml`
- Auth: user session (web) or **API key** (`Authorization: Bearer tqc_<env>_<random>`), hashed (SHA-256) at rest, shown once, scoped (`inspections:read`, `inspections:write`, `reports:read`, `templates:read`, `templates:write`, `odoo:read`, `admin`), optional IP allow-list, expiry
- Rate limit: 600 req/min per key; 429 with `Retry-After`
- Pagination: cursor; filtering by status, template, date range, serial, work order, company
- Errors: RFC 9457 problem+json
- Idempotency: `Idempotency-Key` header on POST

## 5. Webhooks
Events: `inspection.created|submitted|reviewed|approved|rejected`, `signature.applied`, `report.generated`, `ncr.created|closed`, `template.published`. POST JSON, header `X-TQC-Signature: sha256=<HMAC(secret, body)>`, `X-TQC-Event`, `X-TQC-Delivery`. Retries as above; delivery log in dev console. Typical consumer: n8n (`n8n.tiglobal.com`) for Slack/WhatsApp alerts or Sheets.
