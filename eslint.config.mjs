// eslint.config.mjs
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import prettierConfig from 'eslint-config-prettier';

export default [
  // 0. Ignore patterns (flat-config replacement for .eslintignore)
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.yarn/**',
      '**/coverage/**',
      '**/*.config.js',
      '**/*.config.ts',
    ],
  },

  // 1. Base JS rules
  js.configs.recommended,

  // 2. TypeScript recommended rules
  ...tseslint.configs.recommended,

  // 3. Frontend-specific: React + React Hooks
  {
    files: ['frontend/**/*.{ts,tsx}'],
    plugins: {
      react: reactPlugin,
      'react-hooks': reactHooksPlugin,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      ...reactPlugin.configs.recommended.rules,
      ...reactHooksPlugin.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off', // React 17+ JSX transform
      'no-console': 'warn',
    },
  },

  // 4. Backend-specific: no-console OFF (pino is the logger)
  {
    files: ['backend/**/*.ts'],
    rules: {
      'no-console': 'off',
    },
  },

  // 5. Shared workspace: minimal rules
  {
    files: ['shared/**/*.ts'],
    rules: {
      'no-console': 'error', // shared is a library — absolutely no console
    },
  },

  // 6. Prettier compat — MUST be last to disable conflicting style rules
  prettierConfig,
];
