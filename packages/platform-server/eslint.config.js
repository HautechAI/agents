// Flat ESLint config for server (scoped rules)
import tseslint from 'typescript-eslint';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

// Resolve directory of this config file as a plain string for tsconfigRootDir (ESLint requires a string)
const tsconfigRootDir = path.dirname(fileURLToPath(import.meta.url));

export default [
  {
    files: ['src/**/*.ts', 'src/**/*.tsx'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      parser: tseslint.parser,
      // Explicitly set tsconfigRootDir (must be a string) to disambiguate multiple tsconfig roots in the monorepo
      parserOptions: {
        tsconfigRootDir,
        project: ['./tsconfig.json'],
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      // Global relaxed defaults
      '@typescript-eslint/no-explicit-any': 'off',
      'no-empty': 'off',
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      '@typescript-eslint/no-unsafe-assignment': 'off',
      '@typescript-eslint/no-unsafe-member-access': 'off',
      // Reduce noise from tests and legacy code
      '@typescript-eslint/no-require-imports': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      '@typescript-eslint/ban-types': 'off',
      '@typescript-eslint/no-unsafe-function-type': 'off',
      '@typescript-eslint/no-empty-object-type': 'off',
      'no-control-regex': 'off',
      'no-useless-escape': 'off',
      'prefer-const': 'off',
    },
  },
  {
    files: [
      'src/entities/containerProvider.entity.ts',
      'src/services/env.service.ts',
      'src/tools/shell_command.ts',
      'src/mcp/localMcpServer.ts',
    ],
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'error',
    },
  },
  // Strict rules for llloop folder
  {
    files: ['src/llloop/**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        tsconfigRootDir,
        project: ['./tsconfig.json'],
      },
    },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'max-depth': ['error', 3],
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unsafe-type-assertion': 'error',
      '@typescript-eslint/no-unsafe-assignment': 'error',
      '@typescript-eslint/no-unsafe-call': 'error',
      '@typescript-eslint/no-unsafe-member-access': 'error',
      '@typescript-eslint/no-unsafe-return': 'error',
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/await-thenable': 'error',
      '@typescript-eslint/consistent-type-assertions': ['error', { assertionStyle: 'as', objectLiteralTypeAssertions: 'never' }],
      '@typescript-eslint/no-misused-promises': ['error', { checksVoidReturn: { attributes: false } }],
      'no-void': ['error', { allowAsStatement: true }],
    },
  },
];
