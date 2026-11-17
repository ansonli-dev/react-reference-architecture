import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { assertBuiltProfile, profiles } from './build-profiles.mjs';

const [command, profile, ...args] = process.argv.slice(2);
if (
  !['dev', 'build', 'start', 'typegen'].includes(command) ||
  !Object.hasOwn(profiles, profile) ||
  args.length
) {
  throw new Error(
    'Usage: run-app.mjs <dev|build|start|typegen> <release|demo>. Set PORT to change the server port.',
  );
}
if (command === 'start') assertBuiltProfile(process.cwd(), profile);

const env = { ...process.env, BOOKSTORE_BUILD_TARGET: profile };
const options = [];
if (command === 'dev' || command === 'start') {
  const host =
    profile === 'demo' || command === 'dev'
      ? '127.0.0.1'
      : env.BOOKSTORE_HOST || '0.0.0.0';
  options.push('--hostname', host);
}

const next = createRequire(import.meta.url).resolve('next/dist/bin/next');
const child = spawn(process.execPath, [next, command, ...options], {
  env,
  stdio: 'inherit',
});

for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => child.kill(signal));
}
child.on('exit', (code) => {
  process.exitCode = code ?? 1;
});
child.on('error', (error) => {
  console.error(error.message);
  process.exitCode = 1;
});
