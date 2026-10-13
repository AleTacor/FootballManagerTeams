import { configDefaults, defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// `base: './'` lets the built app run from any folder (or GitHub Pages).
export default defineConfig({
  plugins: [react()],
  base: './',
  test: {
    // Tests on real screenshots need local images: `npm run test:images` (vitest.images.config.ts).
    exclude: [...configDefaults.exclude, '**/*.images.test.ts'],
  },
});
