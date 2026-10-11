import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import prettier from 'eslint-config-prettier';
import n from 'eslint-plugin-n';
import { defineConfig } from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {
    ignores: [
      'dist/**',
      'coverage/**',
      'node_modules/**',
      'rosetta-out/**',
      '_legacy/**',
      '.impeccable/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  n.configs['flat/recommended-module'],
  {
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      '@typescript-eslint/no-import-type-side-effects': 'error',
      '@typescript-eslint/explicit-module-boundary-types': 'error',
      '@typescript-eslint/prefer-readonly': 'error',
      'no-restricted-exports': [
        'error',
        {
          restrictDefaultExports: {
            direct: true,
            named: true,
            defaultFrom: true,
            namedFrom: true,
            namespaceFrom: true,
          },
        },
      ],
      'no-console': 'error',
      eqeqeq: 'error',
      complexity: ['error', 10],
      'max-depth': ['error', 3],
      'max-params': ['error', 4],
      'max-lines': ['error', 300],
      'max-lines-per-function': ['error', 50],
      'n/no-sync': 'error',
      'n/prefer-node-protocol': 'error',
    },
  },
  {
    files: ['src/presentation/**'],
    rules: { 'no-console': 'off' },
  },
  {
    files: ['src/infrastructure/db/**'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.property.name='query'] > TemplateLiteral:first-child",
          message:
            'SQL must be parameterised: pass a constant string and a values array (ADR-016).',
        },
      ],
    },
  },
  {
    files: ['tests/**'],
    ...vitest.configs.recommended,
  },
  {
    // Plain JavaScript (scripts, CommonJS tool configs) is outside the TypeScript project.
    files: ['**/*.{mjs,cjs}'],
    languageOptions: { globals: { module: 'writable' } },
    extends: [tseslint.configs.disableTypeChecked],
    rules: { 'no-console': 'off', '@typescript-eslint/explicit-module-boundary-types': 'off' },
  },
  {
    // Tools load their configuration through a default export.
    files: ['*.config.ts'],
    rules: { 'no-restricted-exports': 'off' },
  },
  prettier,
);
