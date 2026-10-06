-- TIGL Quality Platform — PostgreSQL 16 schema (authoritative; generate Prisma from this)
-- Conventions: UUID PKs (gen_random_uuid), timestamptz UTC, company_id on every business table, soft-delete only where stated.
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS citext;

-- ===== Core: tenancy, users, RBAC =====
-- Issuing entity rule: customer.company_id is the default; if the inspection is linked to an Odoo sale order, the SO's company wins.
-- Machine templates are shared by both entities (they describe TIGL products); inspection.company_id is what differs.
CREATE TABLE company (
  id            text PRIMARY KEY,                 -- 'TIGL' (T&I Global Limited), 'TIPL' (T&I Projects Private Limited): the ISSUING entity of a QC report
  legal_name    text NOT NULL,
  report_header text, report_address text,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE customer (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES company(id),           -- default issuing entity for this customer
  name citext NOT NULL UNIQUE, country text, odoo_partner_id int,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE signing_certificate (                           -- built-in document sealing; one active cert per company, no external service
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES company(id),
  subject text NOT NULL, issuer text NOT NULL, fingerprint_sha256 text NOT NULL, not_before timestamptz NOT NULL, not_after timestamptz NOT NULL,
  cert_pem text NOT NULL,
  key_enc bytea NOT NULL,                                    -- private key encrypted (AES-256-GCM) with the server master key; never exported, never returned by API
  status text NOT NULL CHECK (status IN ('active','retired','revoked')) DEFAULT 'active',
  created_by uuid REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX one_active_cert ON signing_certificate(company_id) WHERE status='active';
CREATE TABLE site (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES company(id),
  name text NOT NULL, kind text NOT NULL CHECK (kind IN ('factory','office')),
  UNIQUE (company_id, name)
);
CREATE TABLE app_user (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username citext NOT NULL UNIQUE CHECK (username ~ '^[a-z][a-z0-9._-]{2,31}$'),   -- issued by IT, e.g. kavitha.s
  email citext,                                    -- optional, notifications only; NOT an identity
  full_name text NOT NULL, designation text,       -- designation is printed under the signature
  default_site_id uuid REFERENCES site(id),
  password_hash text NOT NULL,                     -- Argon2id (never reversible, never shown, never logged)
  must_change_password boolean NOT NULL DEFAULT true,  -- true after create/reset: temp password issued by IT
  password_changed_at timestamptz,
  failed_attempts int NOT NULL DEFAULT 0, locked_until timestamptz,
  totp_secret_enc bytea, totp_enabled boolean NOT NULL DEFAULT false,   -- optional authenticator-app 2FA, built in
  active boolean NOT NULL DEFAULT true,
  last_login_at timestamptz, created_by uuid REFERENCES app_user(id), created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE password_history ( user_id uuid REFERENCES app_user(id) ON DELETE CASCADE, password_hash text NOT NULL, set_at timestamptz NOT NULL DEFAULT now() );  -- reuse check (last N)
CREATE TABLE role (
  key text PRIMARY KEY,                            -- inspector, supervisor, qm, engineering, production, management, sysadmin, developer
  name text NOT NULL, description text, is_system boolean NOT NULL DEFAULT true
);
CREATE TABLE permission ( key text PRIMARY KEY, description text NOT NULL );
CREATE TABLE role_permission (
  role_key text REFERENCES role(key) ON DELETE CASCADE,
  perm_key text REFERENCES permission(key),
  PRIMARY KEY (role_key, perm_key)
);
CREATE TABLE role_permission_guardrail (           -- combinations that may never be granted
  role_key text REFERENCES role(key), perm_key text REFERENCES permission(key), reason text NOT NULL,
  PRIMARY KEY (role_key, perm_key)
);
CREATE TABLE user_company_role (
  user_id uuid REFERENCES app_user(id) ON DELETE CASCADE,
  company_id text REFERENCES company(id),
  role_key text NOT NULL REFERENCES role(key),
  PRIMARY KEY (user_id, company_id)
);
-- enforce guardrails at DB level too
CREATE FUNCTION trg_guardrail() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM role_permission_guardrail g WHERE g.role_key=NEW.role_key AND g.perm_key=NEW.perm_key) THEN
    RAISE EXCEPTION 'Permission % is not allowed for role % (governance guardrail)', NEW.perm_key, NEW.role_key;
  END IF; RETURN NEW;
END $$;
CREATE TRIGGER role_permission_guardrail_chk BEFORE INSERT OR UPDATE ON role_permission FOR EACH ROW EXECUTE FUNCTION trg_guardrail();

-- ===== Settings, modules, flags =====
CREATE TABLE setting ( company_id text REFERENCES company(id), key text, value jsonb NOT NULL, updated_by uuid REFERENCES app_user(id), updated_at timestamptz DEFAULT now(), PRIMARY KEY (company_id, key) );
CREATE TABLE module_toggle ( key text PRIMARY KEY, enabled boolean NOT NULL, core boolean NOT NULL DEFAULT false, updated_by uuid, updated_at timestamptz DEFAULT now() );
CREATE TABLE feature_flag ( key text PRIMARY KEY, enabled boolean NOT NULL DEFAULT false, description text );
CREATE TABLE signature_slot (
  company_id text REFERENCES company(id), key text, label text NOT NULL, role_key text NOT NULL REFERENCES role(key),
  required boolean NOT NULL, locked_required boolean NOT NULL DEFAULT false, sequence int NOT NULL,
  PRIMARY KEY (company_id, key)
);

-- ===== Templates (revision-controlled) =====
CREATE TABLE machine_template (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id text NOT NULL REFERENCES company(id),
  code text NOT NULL, name text NOT NULL, family text,
  UNIQUE (company_id, code)
);
CREATE TABLE template_revision (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES machine_template(id),
  revision text NOT NULL,                                     -- A, B, C …
  status text NOT NULL CHECK (status IN ('draft','in_review','published','superseded')),
  effective_from date, change_note text,
  header_fields jsonb NOT NULL DEFAULT '[]', machine_types jsonb NOT NULL DEFAULT '[]',   -- machine_types = VARIANTS (Automatic, Manual, Steam, Thermic fluid …)
  variant_label text NOT NULL DEFAULT 'Machine type',
  created_by uuid REFERENCES app_user(id), submitted_by uuid REFERENCES app_user(id), published_by uuid REFERENCES app_user(id),
  created_at timestamptz DEFAULT now(), published_at timestamptz,
  UNIQUE (template_id, revision)
);
CREATE UNIQUE INDEX one_published_rev ON template_revision(template_id) WHERE status='published';
CREATE UNIQUE INDEX one_open_draft   ON template_revision(template_id) WHERE status IN ('draft','in_review');
CREATE TABLE template_stage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES template_revision(id) ON DELETE CASCADE,
  code text NOT NULL, name text NOT NULL, sequence int NOT NULL, UNIQUE (revision_id, code)
);
CREATE TABLE template_section (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  stage_id uuid NOT NULL REFERENCES template_stage(id) ON DELETE CASCADE,
  name text NOT NULL, sequence int NOT NULL
);
CREATE TABLE template_parameter (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  revision_id uuid NOT NULL REFERENCES template_revision(id) ON DELETE CASCADE,
  section_id uuid NOT NULL REFERENCES template_section(id) ON DELETE CASCADE,
  code text NOT NULL,                                          -- stable across revisions, e.g. TOL-018
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('qty','range','exact','yes_no','pass_fail','select','text')),
  unit text, min_value numeric(12,4), max_value numeric(12,4), expected text,
  options jsonb, accept jsonb, criteria text, hint text,
  mandatory boolean NOT NULL DEFAULT true, critical boolean NOT NULL DEFAULT false, evidence_required boolean NOT NULL DEFAULT false,
  spec_tbc boolean NOT NULL DEFAULT false, sequence int NOT NULL,
  applies_to text[],                                           -- NULL/empty = all variants; else only these variants see and evaluate it
  UNIQUE (revision_id, code),
  CHECK (type <> 'range' OR (min_value IS NOT NULL AND max_value IS NOT NULL AND min_value <= max_value))
);
-- published revisions are immutable
CREATE FUNCTION trg_rev_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE st text;
BEGIN
  SELECT status INTO st FROM template_revision WHERE id = COALESCE(NEW.revision_id, OLD.revision_id);
  IF st IN ('published','superseded') THEN RAISE EXCEPTION 'Revision is %, parameters are immutable', st; END IF;
  RETURN COALESCE(NEW, OLD);
END $$;
CREATE TRIGGER template_parameter_immutable BEFORE INSERT OR UPDATE OR DELETE ON template_parameter FOR EACH ROW EXECUTE FUNCTION trg_rev_immutable();
CREATE TABLE product_template_map ( company_id text REFERENCES company(id), odoo_default_code text, template_id uuid REFERENCES machine_template(id), PRIMARY KEY (company_id, odoo_default_code) );

-- ===== Inspections =====
CREATE TABLE inspection (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE,                                  -- QC-2026-0153
  company_id text NOT NULL REFERENCES company(id),
  site_id uuid NOT NULL REFERENCES site(id),
  template_revision_id uuid NOT NULL REFERENCES template_revision(id),
  parent_inspection_id uuid REFERENCES inspection(id),          -- re-inspection chain
  status text NOT NULL CHECK (status IN ('draft','submitted','reviewed','approved','rejected')),
  result text NOT NULL DEFAULT 'INCOMPLETE' CHECK (result IN ('INCOMPLETE','HOLD','FAIL','PASS')),
  counts jsonb NOT NULL DEFAULT '{}',                            -- engine summary cache
  customer_name text NOT NULL, sales_order text, work_order text NOT NULL, machine_serial text NOT NULL,
  customer_id uuid REFERENCES customer(id),
  machine_type text,                                             -- the chosen VARIANT; engine evaluates template params where applies_to is empty or contains it
  despatch_date date, header_extra jsonb NOT NULL DEFAULT '{}',
  odoo_sale_order_id int, odoo_partner_id int, odoo_mrp_production_id int, odoo_product_id int, odoo_lot_id int,
  odoo_sync_status text CHECK (odoo_sync_status IN ('not_linked','linked','pushed','error')) DEFAULT 'not_linked',
  inspector_id uuid NOT NULL REFERENCES app_user(id),
  concession_note text, concession_by uuid REFERENCES app_user(id), concession_at timestamptz,
  version int NOT NULL DEFAULT 1,                                -- optimistic locking
  created_at timestamptz NOT NULL DEFAULT now(), submitted_at timestamptz, approved_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ON inspection (company_id, status, created_at DESC);
CREATE INDEX ON inspection (machine_serial);
CREATE INDEX ON inspection (work_order);
CREATE TABLE inspection_extra_parameter (                      -- order-specific checks for a one-off build; same shape/rules as template_parameter
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspection(id) ON DELETE CASCADE,
  code text NOT NULL,                                          -- ORD-01, ORD-02 …
  label text NOT NULL,
  type text NOT NULL CHECK (type IN ('qty','range','exact','yes_no','pass_fail','select','text')),
  unit text, min_value numeric(12,4), max_value numeric(12,4), expected text, options jsonb, accept jsonb,
  mandatory boolean NOT NULL DEFAULT true, critical boolean NOT NULL DEFAULT false, evidence_required boolean NOT NULL DEFAULT false,
  reason text NOT NULL,                                        -- customer requirement / SO reference; printed on the report
  added_by uuid NOT NULL REFERENCES app_user(id), added_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (inspection_id, code),
  CHECK (type <> 'range' OR (min_value IS NOT NULL AND max_value IS NOT NULL AND min_value <= max_value))
);
CREATE TABLE inspection_value (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspection(id) ON DELETE CASCADE,
  parameter_id uuid REFERENCES template_parameter(id),
  extra_parameter_id uuid REFERENCES inspection_extra_parameter(id),
  value_text text, value_num numeric(12,4),
  result text NOT NULL CHECK (result IN ('pass','fail','missing','invalid','evidence','recorded','na')),
  remark text, recorded_by uuid REFERENCES app_user(id), recorded_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((parameter_id IS NULL) <> (extra_parameter_id IS NULL))
);
CREATE UNIQUE INDEX inspection_value_tpl ON inspection_value(inspection_id, parameter_id) WHERE parameter_id IS NOT NULL;
CREATE UNIQUE INDEX inspection_value_extra ON inspection_value(inspection_id, extra_parameter_id) WHERE extra_parameter_id IS NOT NULL;
CREATE TABLE evidence (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspection(id), parameter_id uuid REFERENCES template_parameter(id), extra_parameter_id uuid REFERENCES inspection_extra_parameter(id),
  storage_path text NOT NULL, file_name text NOT NULL, mime text NOT NULL, bytes bigint NOT NULL, sha256 char(64) NOT NULL,
  uploaded_by uuid REFERENCES app_user(id), uploaded_at timestamptz DEFAULT now(), deleted_at timestamptz
);
-- block value/evidence writes once any active signature exists
CREATE FUNCTION trg_lock_signed() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM signature s WHERE s.inspection_id = COALESCE(NEW.inspection_id, OLD.inspection_id) AND s.revoked_at IS NULL) THEN
    RAISE EXCEPTION 'RECORD_SIGNED';
  END IF; RETURN COALESCE(NEW, OLD);
END $$;

-- ===== E-signatures =====
CREATE TABLE signature (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  public_id text NOT NULL UNIQUE,                                -- SIG-8F2A91C3
  company_id text NOT NULL REFERENCES company(id),
  inspection_id uuid NOT NULL REFERENCES inspection(id),
  slot_key text NOT NULL, meaning text NOT NULL,
  signer_user_id uuid NOT NULL REFERENCES app_user(id), signer_username citext NOT NULL,
  certificate_id uuid NOT NULL REFERENCES signing_certificate(id),   -- issuing entity's certificate in force at signing
  typed_name text NOT NULL, initials text NOT NULL, designation text NOT NULL,
  mode text NOT NULL CHECK (mode IN ('type','initials')), font text NOT NULL,
  reauth_method text NOT NULL CHECK (reauth_method IN ('password','password_totp')), reauth_at timestamptz NOT NULL,
  intent_text text NOT NULL, doc_hash_sha256 char(64) NOT NULL, canonical_version int NOT NULL DEFAULT 1,
  ip inet, user_agent text, signed_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz, revoked_by uuid REFERENCES app_user(id), revoked_reason text
);
CREATE UNIQUE INDEX one_active_sig_per_slot ON signature(inspection_id, slot_key) WHERE revoked_at IS NULL;
CREATE UNIQUE INDEX one_active_sig_per_person ON signature(inspection_id, signer_user_id) WHERE revoked_at IS NULL;
CREATE TRIGGER extra_param_lock BEFORE INSERT OR UPDATE OR DELETE ON inspection_extra_parameter FOR EACH ROW EXECUTE FUNCTION trg_lock_signed();
CREATE TRIGGER inspection_value_lock BEFORE INSERT OR UPDATE OR DELETE ON inspection_value FOR EACH ROW EXECUTE FUNCTION trg_lock_signed();
CREATE TRIGGER evidence_lock BEFORE INSERT OR UPDATE OR DELETE ON evidence FOR EACH ROW EXECUTE FUNCTION trg_lock_signed();

CREATE TABLE report_artifact (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inspection_id uuid NOT NULL REFERENCES inspection(id),
  storage_path text NOT NULL, sha256 char(64) NOT NULL, signatures_hash char(64) NOT NULL,
  sealed_with_certificate_id uuid REFERENCES signing_certificate(id),   -- PAdES seal; NOT NULL in practice, report cannot exist unsealed
  drive_file_id text,                                          -- only if optional Google Drive archive is enabled
  odoo_attachment_id int,
  generated_at timestamptz DEFAULT now(), invalidated_at timestamptz
);
CREATE TABLE report_download ( id bigserial PRIMARY KEY, report_id uuid REFERENCES report_artifact(id), user_id uuid REFERENCES app_user(id), at timestamptz DEFAULT now(), ip inet );

-- ===== NCR =====
CREATE TABLE ncr (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number text NOT NULL UNIQUE, company_id text NOT NULL REFERENCES company(id),
  inspection_id uuid NOT NULL REFERENCES inspection(id), parameter_id uuid REFERENCES template_parameter(id),
  description text, disposition text CHECK (disposition IN ('Rework','Repair','Use as-is (concession)','Scrap','Return to supplier')),
  root_cause text, owner_id uuid REFERENCES app_user(id), due_date date,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','closed')),
  reinspection_id uuid REFERENCES inspection(id),
  raised_at timestamptz DEFAULT now(), closed_at timestamptz, closed_by uuid REFERENCES app_user(id),
  CHECK (status = 'open' OR disposition IS NOT NULL)
);

-- ===== Audit, notifications, integrations =====
CREATE TABLE audit_event (
  id bigserial PRIMARY KEY, at timestamptz NOT NULL DEFAULT now(),
  company_id text, actor_user_id uuid, actor_role text, actor_ip inet, via text CHECK (via IN ('web','api_key','system')),
  action text NOT NULL, entity text NOT NULL, entity_id text, before jsonb, after jsonb, detail text,
  prev_hash char(64), row_hash char(64)                          -- hash chain for tamper evidence
);
REVOKE UPDATE, DELETE ON audit_event FROM PUBLIC;               -- app role gets INSERT/SELECT only
CREATE TABLE notification ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), company_id text, user_id uuid REFERENCES app_user(id), event text, title text, link text, read_at timestamptz, created_at timestamptz DEFAULT now() );
CREATE TABLE email_log ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), event text, to_addr text, subject text, channel text CHECK (channel IN ('smtp','gmail')), status text, error text, sent_at timestamptz DEFAULT now() );
CREATE TABLE integration_config ( key text PRIMARY KEY CHECK (key IN ('odoo','google','smtp')), enabled boolean NOT NULL DEFAULT false, config jsonb NOT NULL DEFAULT '{}', secret_ref text, status text, last_tested_at timestamptz, updated_by uuid, updated_at timestamptz DEFAULT now() );
CREATE TABLE outbox_event ( id bigserial PRIMARY KEY, topic text NOT NULL, payload jsonb NOT NULL, status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed','dead')), attempts int NOT NULL DEFAULT 0, next_attempt_at timestamptz DEFAULT now(), last_error text, created_at timestamptz DEFAULT now() );
CREATE INDEX ON outbox_event (status, next_attempt_at);
CREATE TABLE api_key ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), name text NOT NULL, env text NOT NULL CHECK (env IN ('sbx','prod')), prefix text NOT NULL, key_hash char(64) NOT NULL UNIQUE, scopes text[] NOT NULL, ip_allow cidr[], created_by uuid REFERENCES app_user(id), created_at timestamptz DEFAULT now(), expires_at timestamptz, last_used_at timestamptz, revoked_at timestamptz );
CREATE TABLE webhook ( id uuid PRIMARY KEY DEFAULT gen_random_uuid(), url text NOT NULL CHECK (url LIKE 'https://%'), events text[] NOT NULL, secret_ref text NOT NULL, active boolean DEFAULT true, created_by uuid, created_at timestamptz DEFAULT now() );
CREATE TABLE webhook_delivery ( id bigserial PRIMARY KEY, webhook_id uuid REFERENCES webhook(id), event text, status_code int, duration_ms int, attempt int, at timestamptz DEFAULT now() );
