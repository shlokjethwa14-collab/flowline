import js from '@eslint/js'
import next from 'eslint-config-next'
import globals from 'globals'
import tseslint from 'typescript-eslint'

/**
 * ESLint 9 flat config. Replaces .eslintrc.json, which ESLint 9 no longer
 * reads, and `next lint`, which Next 16 removed in favour of running ESLint
 * directly.
 */
export default tseslint.config(
  {
    ignores: [
      'node_modules/**',
      '.next/**',
      'out/**',
      'coverage/**',
      'next-env.d.ts',
      // Build artefacts of the static landing site: a throwaway worktree and
      // the compiled bundle it produces. Both are generated, both are
      // gitignored, and linting minified output produces thousands of
      // meaningless errors.
      '.landing-build/**',
      'landing-out/**',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...next,
  {
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      // console.warn/error are how the server surfaces operational problems;
      // console.log is not, and must never carry request content.
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
)
