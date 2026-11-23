import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import globals from 'globals';

export default tseslint.config(
  { ignores: ['node_modules/**', 'data/**', 'coverage/**', 'leetkob-eval/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: { globals: globals.node },
    rules: {
      'no-console': ['error', { allow: ['error', 'warn'] }],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    // The screens: plain browser scripts. common.js defines Lk; the page scripts use it.
    files: ['public/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.browser } },
  },
  {
    files: ['public/**/*.js'],
    ignores: ['public/common.js'],
    languageOptions: { globals: { Lk: 'readonly' } },
  },
);
