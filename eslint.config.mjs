import eslint from '@eslint/js';
import tseslint from '@typescript-eslint/eslint-plugin';
import tsparser from '@typescript-eslint/parser';
import globals from 'globals';

export default [
  {
    ignores: ['**/dist/', '**/node_modules/', '**/coverage/', '**/*.js', '!eslint.config.mjs'],
  },
  // Backend: Node.js TypeScript files
  {
    files: ['packages/**/*.ts', 'apps/**/*.ts'],
    ignores: ['apps/frontend/**'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.es2022,
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // Frontend: React TSX/TS files
  {
    files: ['apps/frontend/**/*.ts', 'apps/frontend/**/*.tsx', 'packages/shared-ui/**/*.tsx'],
    languageOptions: {
      parser: tsparser,
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        jsx: true,
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      '@typescript-eslint': tseslint,
    },
    rules: {
      ...eslint.configs.recommended.rules,
      ...tseslint.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      'no-undef': 'off', // TypeScript handles this; ESLint false-positives on JSX transform
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  // LLM sanitizer: allow control-char regex (intentional)
  {
    files: ['packages/shared-enrichment/src/llm-sanitizer.ts'],
    rules: {
      'no-control-regex': 'off',
    },
  },
];
