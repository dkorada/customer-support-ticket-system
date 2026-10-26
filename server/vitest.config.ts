import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    // API tests share one SQLite file per test file; run files one at a time.
    fileParallelism: false,
  },
});
