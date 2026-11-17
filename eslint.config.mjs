import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    files: [
      'src/features/*/model.ts',
      'src/features/*/model/**/*.{js,jsx,ts,tsx,mjs,cjs,mts,cts}',
    ],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          globals: [{ name: 'fetch', message: 'Keep HTTP reads in adapters.' }],
          checkGlobalObject: true,
        },
      ],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.next-demo/**',
    '.bookstore-demo/**',
    'test-results/**',
    'playwright-report/**',
    'src/shared/api/generated/**',
    'src/server/adapters/java/generated/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
]);

export default eslintConfig;
