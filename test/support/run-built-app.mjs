import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBuiltProfile, profiles } from '../../scripts/build-profiles.mjs';

const [profile, port] = process.argv.slice(2);
if (
  !Object.hasOwn(profiles, profile) ||
  !/^\d{1,5}$/.test(port ?? '') ||
  +port < 1 ||
  +port > 65535
) {
  throw new Error('Usage: run-built-app.mjs <demo|release> <loopback port>');
}

const root = resolve(process.cwd());
assertBuiltProfile(root, profile);

const work = mkdtempSync(join(tmpdir(), 'bookstore-' + profile + '-'));
try {
  for (const dir of [
    'node_modules',
    'public',
    'scripts',
    'src',
    profiles[profile].distDir,
  ]) {
    symlinkSync(join(root, dir), join(work, dir), 'junction');
  }
  symlinkSync(
    join(root, 'next.config.ts'),
    join(work, 'next.config.ts'),
    'file',
  );
  const env = { ...process.env };
  for (const name of [
    'JAVA_CATALOG_BASE_URL',
    'JAVA_CONTRACT',
    'CATALOG_CATEGORIES_JSON',
    'JAVA_CATALOG_TOKEN',
  ]) {
    delete env[name];
  }
  Object.assign(env, {
    NODE_ENV: 'production',
    PORT: port,
    APP_ORIGIN: 'http://127.0.0.1:' + port,
    BOOKSTORE_HOST: '127.0.0.1',
    BOOKSTORE_BUILD_PROFILE: profile === 'release' ? 'demo' : 'release',
    DEMO_DATA_DIR: join(work, 'data'),
  });
  const runner = fileURLToPath(
    new URL('../../scripts/run-app.mjs', import.meta.url),
  );
  const child = spawn(process.execPath, [runner, 'start', profile], {
    cwd: work,
    env,
    stdio: 'inherit',
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }
  const [code, signal] = await once(child, 'exit');
  process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1);
} finally {
  rmSync(work, { recursive: true, force: true });
}
