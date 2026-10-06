CREATE TABLE IF NOT EXISTS app_session (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  revoked_at timestamptz,
  last_seen_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS app_session_user_active ON app_session(user_id, expires_at) WHERE revoked_at IS NULL;

CREATE FUNCTION guard_published_revision() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE rid uuid; st text;
BEGIN
  IF TG_TABLE_NAME='template_revision' THEN
    rid := OLD.id;
  ELSIF TG_OP='DELETE' THEN
    rid := OLD.revision_id;
  ELSE
    rid := NEW.revision_id;
  END IF;
  SELECT status INTO st FROM template_revision WHERE id=rid;
  IF TG_TABLE_NAME='template_revision' AND TG_OP='UPDATE' THEN
    IF st='published' AND OLD.status='published' AND NEW.status='superseded'
       AND (to_jsonb(NEW)-'status' = to_jsonb(OLD)-'status') THEN RETURN NEW; END IF;
  END IF;
  IF st IN ('published','superseded') THEN RAISE EXCEPTION 'Revision is %, structure is immutable', st; END IF;
  RETURN COALESCE(NEW,OLD);
END $$;
CREATE TRIGGER template_stage_immutable BEFORE INSERT OR UPDATE OR DELETE ON template_stage FOR EACH ROW EXECUTE FUNCTION guard_published_revision();
CREATE TRIGGER template_section_immutable BEFORE INSERT OR UPDATE OR DELETE ON template_section FOR EACH ROW EXECUTE FUNCTION guard_published_revision();
CREATE TRIGGER template_revision_immutable BEFORE UPDATE OR DELETE ON template_revision FOR EACH ROW EXECUTE FUNCTION guard_published_revision();

ALTER TABLE inspection DROP CONSTRAINT IF EXISTS inspection_status_check;
ALTER TABLE inspection ADD CONSTRAINT inspection_status_check CHECK (status IN ('draft','in_progress','submitted','under_review','returned','reviewed','approved','rejected'));
CREATE TABLE IF NOT EXISTS inspection_number_counter (year int PRIMARY KEY, last_value int NOT NULL);

-- Extend the established packet audit table rather than replacing its columns.
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES app_user(id);
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS occurred_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS request_id text;
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS before_data jsonb;
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS after_data jsonb;
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS previous_hash text;
ALTER TABLE audit_event ADD COLUMN IF NOT EXISTS event_hash text;
CREATE FUNCTION prevent_audit_mutation() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'audit_event is append-only'; END $$;
CREATE TRIGGER audit_event_immutable BEFORE UPDATE OR DELETE ON audit_event FOR EACH ROW EXECUTE FUNCTION prevent_audit_mutation();

INSERT INTO company(id, legal_name) VALUES ('TIGL','T&I Global Limited'),('TIPL','T&I Projects Private Limited') ON CONFLICT DO NOTHING;
INSERT INTO role(key,name) VALUES
 ('inspector','QC Inspector'),('supervisor','QC Supervisor'),('qm','Quality Manager'),
 ('production','Production'),('engineering','Engineering'),('sysadmin','System Administrator'),('management','Management')
ON CONFLICT (key) DO NOTHING;
INSERT INTO permission(key,description) VALUES
 ('dashboard.view','View dashboard'),('insp.view','View inspections'),('insp.create','Create inspections'),
 ('insp.execute','Record inspection results'),('insp.review','Review inspections'),('insp.approve','Approve inspections'),
 ('report.view','View reports'),('report.sign','Sign reports'),('tmpl.view','View templates'),('tmpl.edit','Edit draft templates'),('tmpl.publish','Publish templates'),
 ('admin.users','Manage users and roles'),('admin.audit','View audit log') ON CONFLICT DO NOTHING;
INSERT INTO role_permission_guardrail(role_key,perm_key,reason) VALUES
 ('sysadmin','insp.approve','System administration does not imply QC approval'),
 ('sysadmin','report.sign','System administration does not imply QC signing'),
 ('sysadmin','tmpl.publish','System administration does not imply template authority') ON CONFLICT DO NOTHING;
INSERT INTO role_permission(role_key,perm_key) VALUES
 ('inspector','dashboard.view'),('inspector','insp.view'),('inspector','insp.create'),('inspector','insp.execute'),('inspector','report.view'),('inspector','tmpl.view'),
 ('supervisor','dashboard.view'),('supervisor','insp.view'),('supervisor','insp.create'),('supervisor','insp.execute'),('supervisor','insp.review'),('supervisor','report.view'),('supervisor','tmpl.view'),
 ('qm','dashboard.view'),('qm','insp.view'),('qm','insp.review'),('qm','insp.approve'),('qm','report.view'),('qm','report.sign'),('qm','tmpl.view'),('qm','tmpl.publish'),('qm','admin.audit'),
 ('production','dashboard.view'),('production','insp.view'),('production','report.view'),
 ('engineering','dashboard.view'),('engineering','insp.view'),('engineering','report.view'),('engineering','tmpl.view'),('engineering','tmpl.edit'),
 ('management','dashboard.view'),('management','insp.view'),('management','report.view'),('management','tmpl.view'),
 ('sysadmin','admin.users'),('sysadmin','admin.audit'),('sysadmin','tmpl.view') ON CONFLICT DO NOTHING;
