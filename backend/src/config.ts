// Load .env if present (Node >= 21.7). Real env vars win over the file.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

const isProd = process.env.NODE_ENV === 'production';

if (isProd && !process.env.ADMIN_KEY) throw new Error('ADMIN_KEY must be set in production');

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databasePath: process.env.DATABASE_PATH ?? './data/retro.db',
  /** Uploaded console photos and brand logos are stored here and served at /uploads */
  uploadsDir: process.env.UPLOADS_DIR ?? './uploads',
  /** Sent as the x-admin-key header to add/remove photos */
  adminKey: process.env.ADMIN_KEY ?? 'dev-admin-key',
  maxImageBytes: 8 * 1024 * 1024,
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};
