// ESLint v9 flat config
import tseslint from '@typescript-eslint/eslint-plugin';
import tsParser from '@typescript-eslint/parser';
import importPlugin from 'eslint-plugin-import';
import unusedImports from 'eslint-plugin-unused-imports';
import prettier from 'eslint-config-prettier';

/** @type {import('eslint').Linter.FlatConfig[]} */
export default [
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        project: ['./apps/server/tsconfig.json', './apps/ui/tsconfig.json'],
        tsconfigRootDir: new URL('.', import.meta.url).pathname,
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
      import: importPlugin,
      'unused-imports': unusedImports,
    },
    rules: {
      ...tseslint.configs.recommended.rules,
      ...tseslint.configs['recommended-requiring-type-checking'].rules,
      // Keep no-explicit-any
      '@typescript-eslint/no-explicit-any': 'error',
      'prefer-const': 'warn',
      'unused-imports/no-unused-imports': 'warn',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'import/order': ['warn', { 'newlines-between': 'always', alphabetize: { order: 'asc', caseInsensitive: true } }],
    },
    linterOptions: {
      reportUnusedDisableDirectives: true,
    },
  },
  // Prettier compatibility (disables conflicting rules)
  prettier,
  // Ignore patterns
  {
    ignores: ['**/dist/**', '**/build/**', '**/*.d.ts', 'node_modules/**'],
  },
];
