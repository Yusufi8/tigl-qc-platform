import { readdir, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDatabaseUrl } from './connection.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const migrations = resolve(root, 'migrations');
const env = process.env;
const databaseUrl = getDatabaseUrl(env);
const files = (await readdir(migrations)).filter((f) => f.endsWith('.sql')).sort();
const run = (sql) => new Promise((ok, fail) => {
  const p = spawn('psql', [databaseUrl, '-X', '-v', 'ON_ERROR_STOP=1', '-q'], { stdio: ['pipe', 'inherit', 'inherit'] });
  p.on('error', fail); p.on('exit', (code) => code === 0 ? ok() : fail(new Error(`psql exited ${code}`)));
  p.stdin.end(sql);
});
await run(`CREATE TABLE IF NOT EXISTS schema_migration (name text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now());\n`);
for (const name of files) {
  const sql = await readFile(resolve(migrations, name), 'utf8');
  const checksum = createHash('sha256').update(sql).digest('hex');
  const prior = await new Promise((ok, fail) => {
    const p = spawn('psql', [databaseUrl, '-X', '-At', '-v', 'ON_ERROR_STOP=1', '-c', `SELECT checksum FROM schema_migration WHERE name='${name}'`]);
    let out = ''; p.stdout.on('data', (d) => out += d); p.on('error', fail); p.on('exit', (c) => c === 0 ? ok(out.trim()) : fail(new Error(`psql exited ${c}`)));
  });
  if (prior) { if (prior !== checksum) throw new Error(`Applied migration ${name} was modified`); continue; }
  // Serialize runners and apply each migration atomically. The first migration is self-contained SQL.
  const body = sql.replace(/^\\i .*$/gm, '');
  await run(`BEGIN; SELECT pg_advisory_xact_lock(784311);\n${body}\nINSERT INTO schema_migration(name,checksum) VALUES ('${name}','${checksum}'); COMMIT;\n`);
  console.log(`applied ${name}`);
}
