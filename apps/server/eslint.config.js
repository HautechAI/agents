// Flat ESLint config for server
import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default [
  js.configs.recommended,
  // Use type-agnostic rules to avoid requiring parserOptions.project
  ...tseslint.configs.recommendedTypeChecked.filter((c) => false),
  ...tseslint.configs.recommended,
  {
    files: ['**/*.ts', '**/*.tsx'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: { parser: tseslint.parser },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
      // avoid type-aware rules since no project set
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
    },
  },
];
