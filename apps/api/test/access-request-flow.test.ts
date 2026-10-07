import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer, type Server } from 'node:http';
import { createServer as createTcpServer } from 'node:net';
import pg from 'pg';
import argon2 from 'argon2';
import { randomUUID } from 'node:crypto';

const enabled = Boolean(process.env.DATABASE_URL);
const { Pool } = pg;
const pool = enabled ? new Pool({ connectionString: process.env.DATABASE_URL }) : undefined;
const describeDb = describe.skipIf(!enabled);
let api: ChildProcess | undefined;
let apiPort = 0;
let deliveryServer: Server | undefined;
let deliveryPort = 0;
let deliveredCode = '';

async function unusedPort() {
  const server = createTcpServer();
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  const port = typeof address === 'object' && address ? address.port : 0;
  await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  return port;
}

async function waitForApi() {
  const until = Date.now() + 20_000;
  while (Date.now() < until) {
    try {
      const response = await fetch(`http://127.0.0.1:${apiPort}/api/v1/health`);
      if (response.ok) return;
    } catch { /* The child process is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  throw new Error('API did not become ready');
}

describeDb('employee access request and administrator review', () => {
  beforeAll(async () => {
    apiPort = await unusedPort();
    deliveryServer = createServer(async (req, res) => {
      const parts: Buffer[] = [];
      for await (const part of req) parts.push(Buffer.from(part));
      const body = JSON.parse(Buffer.concat(parts).toString());
      deliveredCode = body.code;
      res.writeHead(202).end();
    });
    await new Promise<void>((resolve) => deliveryServer!.listen(0, '127.0.0.1', resolve));
    deliveryPort = (deliveryServer!.address() as { port: number }).port;
    api = spawn(process.execPath, ['apps/api/src/server.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PORT: String(apiPort),
        COOKIE_SECURE: 'false',
        AUDIT_HMAC_SECRET: 'integration-audit-key-012345678901234567890123',
        OTP_HMAC_SECRET: 'integration-otp-key-012345678901234567890123',
        OTP_ALLOWED_EMAIL_DOMAINS: 'example.test',
        OTP_EMAIL_DELIVERY_URL: `http://127.0.0.1:${deliveryPort}`,
      },
      stdio: 'ignore',
    });
    await waitForApi();
  }, 30_000);

  afterAll(async () => {
    api?.kill('SIGTERM');
    await new Promise<void>((resolve) => deliveryServer?.close(() => resolve()) ?? resolve());
    await pool?.end();
  });

  it('requires verified contact and IT role assignment before account activation', async () => {
    const suffix = randomUUID().slice(0, 8);
    const username = `join.${suffix}`;
    const email = `${username}@example.test`;
    const site = await pool!.query("SELECT id FROM site WHERE company_id='TIGL' ORDER BY name LIMIT 1");
    if (!site.rowCount) throw new Error('CI seed/bootstrap must create a TIGL site');
    const adminUsername = `it.${suffix}`;
    const adminPassword = 'temporary-admin-password-123';
    const adminHash = await argon2.hash(adminPassword, { type: argon2.argon2id });
    const admin = await pool!.query(`INSERT INTO app_user(username,full_name,default_site_id,password_hash,must_change_password)
      VALUES($1,'IT Test Admin',$2,$3,false) RETURNING id`, [adminUsername, site.rows[0].id, adminHash]);
    await pool!.query("INSERT INTO user_company_role(user_id,company_id,role_key) VALUES($1,'TIGL','sysadmin')", [admin.rows[0].id]);

    const requestedPassword = 'employee-chosen-password-123';
    const created = await fetch(`http://127.0.0.1:${apiPort}/api/v1/access-requests`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ fullName: 'Employee Test', department: 'Quality', accessReason: 'Need QC inspection access', username, companyId: 'TIGL', channel: 'email', email, password: requestedPassword }),
    });
    expect(created.status).toBe(202);
    const createdBody = await created.json() as { requestId: string };
    expect(deliveredCode).toMatch(/^\d{6}$/);
    expect((await pool!.query('SELECT 1 FROM app_user WHERE username=$1', [username])).rowCount).toBe(0);

    const verified = await fetch(`http://127.0.0.1:${apiPort}/api/v1/access-requests/${createdBody.requestId}/verify`, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ code: deliveredCode }),
    });
    expect(verified.status).toBe(200);
    expect((await pool!.query('SELECT 1 FROM app_user WHERE username=$1', [username])).rowCount).toBe(0);

    const login = await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username: adminUsername, password: adminPassword }),
    });
    expect(login.status).toBe(200);
    const cookie = login.headers.get('set-cookie')!.split(';')[0];
    const deniedRole = await fetch(`http://127.0.0.1:${apiPort}/api/v1/admin/access-requests/${createdBody.requestId}/review`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', roleKey: 'qm', siteId: site.rows[0].id }),
    });
    expect(deniedRole.status).toBe(403);
    expect((await pool!.query('SELECT 1 FROM app_user WHERE username=$1', [username])).rowCount).toBe(0);

    const approved = await fetch(`http://127.0.0.1:${apiPort}/api/v1/admin/access-requests/${createdBody.requestId}/review`, {
      method: 'POST', headers: { cookie, 'content-type': 'application/json' },
      body: JSON.stringify({ decision: 'approve', roleKey: 'inspector', siteId: site.rows[0].id }),
    });
    expect(approved.status).toBe(201);
    const employeeLogin = await fetch(`http://127.0.0.1:${apiPort}/api/v1/auth/login`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ username, password: requestedPassword }),
    });
    expect(employeeLogin.status).toBe(200);
  }, 30_000);
});
