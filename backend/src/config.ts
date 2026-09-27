// Load .env if present (Node >= 21.7). Real env vars win over the file.
try {
  process.loadEnvFile();
} catch {
  // no .env file
}

export const config = {
  port: Number(process.env.PORT ?? 4000),
  databasePath: process.env.DATABASE_PATH ?? './data/retro.db',
  /**
   * Website addresses allowed to call the API from a browser, comma-separated. A "*" matches any part of a host name,
   * e.g. "https://yourdomain.com,https://*.vercel.app" also allows Vercel preview deployments.
   */
  corsOrigins: (process.env.CORS_ORIGINS ?? 'http://localhost:3000,http://localhost:5173')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean),
};

/** True if a browser page at `origin` may call the API (see corsOrigins) */
export function isAllowedOrigin(origin: string) {
  return config.corsOrigins.some((allowed) => {
    if (!allowed.includes('*')) return allowed === origin;
    // Escape everything except "*", which matches one host-name part (letters, digits, dashes)
    const escaped = allowed.split('*').map((part) => part.replace(/[.+?^${}()|[\]\\]/g, '\\$&'));
    return new RegExp(`^${escaped.join('[a-z0-9-]+')}$`, 'i').test(origin);
  });
}
