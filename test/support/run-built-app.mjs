import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { appendFileSync, mkdtempSync, rmSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertBuiltProfile, profiles } from '../../scripts/build-profiles.mjs';
import { javaStubOrigin, startJavaCatalogStub } from './java-catalog-stub.mjs';

const [profile, port, mode] = process.argv.slice(2);
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

const withoutCatalog = mode === 'without-catalog';
let stub;
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
    'JAVA_ORDER_BASE_URL',
    'AUTH_DATABASE_URL',
    'OIDC_ISSUER',
    'OIDC_INTERNAL_BASE_URL',
    'OIDC_CLIENT_ID',
    'OIDC_CLIENT_SECRET',
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
  // Give the unconfigured release a real SQLite file to exercise the profile guard.
  const shouldSeed = profile === 'demo' ? !withoutCatalog : withoutCatalog;
  if (shouldSeed) {
    const seed = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'demo-seed.mjs')],
      { cwd: root, env, stdio: 'inherit' },
    );
    if (seed.status !== 0) throw new Error('Teaching catalog seed failed');
  }
  if (profile === 'release' && !withoutCatalog) {
    stub = await startJavaCatalogStub();
    Object.assign(env, {
      JAVA_CATALOG_BASE_URL: javaStubOrigin,
      JAVA_ORDER_BASE_URL: javaStubOrigin,
      AUTH_DATABASE_URL: 'postgresql://fixture@127.0.0.1/fixture',
      OIDC_ISSUER: 'http://127.0.0.1:8180/realms/fixture',
      OIDC_CLIENT_SECRET: 'fixture',
    });
  }
  const runner = fileURLToPath(
    new URL('../../scripts/run-app.mjs', import.meta.url),
  );
  const logs = env.BOOKSTORE_E2E_LOG_DIR;
  const logFile = logs && join(logs, port + '.log');
  const child = spawn(process.execPath, [runner, 'start', profile], {
    cwd: work,
    env,
    stdio: logFile ? ['ignore', 'pipe', 'pipe'] : 'inherit',
  });
  if (logFile) {
    for (const [stream, destination] of [
      [child.stdout, process.stdout],
      [child.stderr, process.stderr],
    ]) {
      stream.on('data', (chunk) => {
        appendFileSync(logFile, chunk);
        destination.write(chunk);
      });
    }
  }
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => child.kill(signal));
  }
  const [code, signal] = await once(child, 'close');
  process.exitCode = code ?? (signal === 'SIGTERM' ? 0 : 1);
} finally {
  stub?.closeAllConnections();
  stub?.close();
  rmSync(work, { recursive: true, force: true });
}
