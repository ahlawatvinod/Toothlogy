import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    rules: {
      /**
       * Allow a leading underscore to mark a deliberately unused binding.
       *
       * Some signatures are fixed by a contract we do not control — a route
       * handler receives a Request whether or not it reads it. Renaming the
       * parameter to `_request` states "unused on purpose", which is more
       * informative than deleting it and more honest than a blanket disable.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    /**
     * Node tooling scripts are CommonJS by extension and legitimately use
     * `require()`. They run locally, never ship to the browser, and are not
     * part of the application bundle.
     */
    files: ['scripts/**/*.cjs'],
    rules: {
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    // Generated Prisma client.
    'node_modules/**',
  ]),
]);

export default eslintConfig;
