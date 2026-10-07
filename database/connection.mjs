export function getDatabaseUrl(env = process.env) {
  if (env.DATABASE_URL) return env.DATABASE_URL;

  const user = env.POSTGRES_USER;
  const password = env.POSTGRES_PASSWORD;
  if (!user || !password) {
    throw new Error('Set DATABASE_URL or both POSTGRES_USER and POSTGRES_PASSWORD.');
  }

  const database = env.POSTGRES_DB || 'tigl_qc';
  const port = env.POSTGRES_PORT || '5432';
  return `postgresql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@127.0.0.1:${port}/${encodeURIComponent(database)}`;
}
