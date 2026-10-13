import { configDefaults, defineConfig } from 'vitest/config';

// `npm run test:images`: only the tests on real FM26 screenshots. Their images are in
// src/test/fixtures/, which is git-ignored (local only); missing images are skipped.
export default defineConfig({
  test: {
    include: ['src/**/*.images.test.ts'],
    exclude: configDefaults.exclude,
    testTimeout: 30000,
  },
});
