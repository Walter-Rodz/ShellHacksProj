import { afterEach, describe, expect, it, vi } from 'vitest';

// config.ts reads CORS_ORIGINS when it's first imported, so each test sets it and imports a fresh copy
async function withOrigins(origins: string) {
  vi.stubEnv('CORS_ORIGINS', origins);
  vi.resetModules();
  return (await import('../src/config')).isAllowedOrigin;
}

afterEach(() => {
  vi.unstubAllEnvs();
});

describe('isAllowedOrigin', () => {
  it('allows exact addresses only', async () => {
    const isAllowed = await withOrigins('https://goretro.com, http://localhost:3000');
    expect(isAllowed('https://goretro.com')).toBe(true);
    expect(isAllowed('http://localhost:3000')).toBe(true);
    expect(isAllowed('http://goretro.com')).toBe(false);
    expect(isAllowed('https://evil.com')).toBe(false);
  });

  it('lets "*" match one part of a host name, such as Vercel preview addresses', async () => {
    const isAllowed = await withOrigins('https://*.vercel.app');
    expect(isAllowed('https://goretro-abc123.vercel.app')).toBe(true);
    expect(isAllowed('https://vercel.app')).toBe(false);
    expect(isAllowed('https://a.b.vercel.app')).toBe(false);
    expect(isAllowed('https://evil.com/?x=.vercel.app')).toBe(false);
  });
});
