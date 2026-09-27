// Load .env if present (Node >= 21.7). Real env vars win over the file.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databasePath: process.env.DATABASE_PATH ?? './data/retro.db',
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
