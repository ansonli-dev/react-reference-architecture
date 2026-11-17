import { readFileSync } from 'node:fs';
import { join } from 'node:path';

export const profiles = {
  release: { distDir: '.next', tsconfigPath: 'tsconfig.json' },
  demo: { distDir: '.next-demo', tsconfigPath: 'tsconfig.demo.json' },
};

export function assertBuiltProfile(root, profile) {
  const dir = join(root, profiles[profile].distDir);
  try {
    const id = readFileSync(join(dir, 'BUILD_ID'), 'utf8').trim();
    const { config } = JSON.parse(
      readFileSync(join(dir, 'required-server-files.json'), 'utf8'),
    );
    if (
      id &&
      config?.distDir === profiles[profile].distDir &&
      config?.env?.BOOKSTORE_BUILD_PROFILE === profile
    )
      return;
  } catch {
    // Missing and unreadable artifacts have the same recovery step.
  }
  throw new Error(
    `Expected a ${profile} build in ${dir}. Run pnpm ${profile === 'demo' ? 'build:demo' : 'build'}.`,
  );
}
