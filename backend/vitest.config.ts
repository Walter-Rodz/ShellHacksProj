import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Keep test uploads out of the real uploads folder
    env: { UPLOADS_DIR: join(tmpdir(), `retro-test-uploads-${process.pid}`), ADMIN_KEY: 'test-admin-key' },
  },
});
