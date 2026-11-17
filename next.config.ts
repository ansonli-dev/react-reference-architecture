import type { NextConfig } from 'next';
import { profiles } from './scripts/build-profiles.mjs';

const profile =
  process.env.BOOKSTORE_BUILD_TARGET === 'demo' ? 'demo' : 'release';
const { distDir, tsconfigPath } = profiles[profile];

const nextConfig: NextConfig = {
  distDir,
  typescript: { tsconfigPath },
  env: { BOOKSTORE_BUILD_PROFILE: profile },
  cacheComponents: true,
  partialPrefetching: true,
  reactCompiler: true,
  turbopack: {
    rules: {
      '*.css': {
        loaders: ['@tailwindcss/turbopack'],
        as: '*.css',
      },
    },
  },
};

export default nextConfig;
