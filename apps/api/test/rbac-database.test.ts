import { afterAll, describe, expect, it } from 'vitest';
import pg from 'pg';

const enabled = Boolean(process.env.DATABASE_URL);
const pool = enabled ? new pg.Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
describe.skipIf(!enabled)('database RBAC policy', () => {
  afterAll(async () => { await pool?.end(); });
  it('does not grant approval, signing, or publishing to system administrators', async () => {
    const result = await pool!.query("SELECT perm_key FROM role_permission WHERE role_key='sysadmin'");
    const permissions = result.rows.map(x => x.perm_key);
    expect(permissions).not.toContain('insp.approve');
    expect(permissions).not.toContain('report.sign');
    expect(permissions).not.toContain('tmpl.publish');
  });
  it('rejects explicit assignment of a protected QC permission to system administrators', async () => {
    const client = await pool!.connect();
    try {
      await client.query('BEGIN');
      await expect(client.query("INSERT INTO role_permission(role_key,perm_key) VALUES('sysadmin','insp.approve')")).rejects.toThrow(/Permission/);
      await client.query('ROLLBACK');
    } finally { client.release(); }
  });
  it('grants approval and publishing authority to Quality Manager only', async () => {
    const result = await pool!.query("SELECT perm_key FROM role_permission WHERE role_key='qm'");
    const permissions = result.rows.map(x => x.perm_key);
    expect(permissions).toContain('insp.approve');
    expect(permissions).toContain('tmpl.publish');
  });
});
