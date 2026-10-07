process.env.NODE_ENV ||= 'development';
await import('../apps/api/src/server.mjs');
