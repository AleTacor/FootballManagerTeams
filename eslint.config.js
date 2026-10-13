import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'coverage'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat['recommended-latest']],
    plugins: { 'react-refresh': reactRefresh },
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    rules: {
      // Providers export their hook from the same file (useStore, useI18n, useDnd).
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true, allowExportNames: ['useStore', 'useI18n', 'useDnd'] }],
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    },
  },
  // Tests, test helpers and config files run in Node.
  {
    files: ['**/*.test.ts', 'src/test/**', '*.config.{js,ts}'],
    languageOptions: { globals: globals.node },
  },
);
