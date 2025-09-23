module.exports = {
  root: true,
  env: { node: true, es2022: true, browser: false, jest: false },
  parser: '@typescript-eslint/parser',
  parserOptions: { project: ['./apps/server/tsconfig.json', './apps/ui/tsconfig.json'], tsconfigRootDir: __dirname, sourceType: 'module' },
  plugins: ['@typescript-eslint', 'import', 'unused-imports'],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:@typescript-eslint/recommended-requiring-type-checking',
    'plugin:import/recommended',
    'plugin:import/typescript',
    'prettier'
  ],
  rules: {
    '@typescript-eslint/no-explicit-any': ['error'],
    'prefer-const': 'warn',
    'unused-imports/no-unused-imports': 'warn',
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
    'import/order': ['warn', { 'newlines-between': 'always', alphabetize: { order: 'asc', caseInsensitive: true } }],
  },
  ignorePatterns: ['**/dist/**', '**/build/**', '**/*.d.ts', 'node_modules/**'],
  overrides: [
    {
      files: ['**/*.ts', '**/*.tsx'],
      extends: [],
    },
  ],
};
