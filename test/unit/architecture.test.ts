import { spawnSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

function runGate(files: Record<string, string>) {
  const cwd = mkdtempSync(join(tmpdir(), 'bookstore-boundaries-'));
  try {
    const repo = new URL('../../', import.meta.url);
    const script = fileURLToPath(new URL('scripts/check-boundaries.mjs', repo));
    symlinkSync(
      fileURLToPath(new URL('node_modules', repo)),
      join(cwd, 'node_modules'),
      'junction',
    );
    writeFileSync(
      join(cwd, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: { paths: { '@/*': ['./src/*'] } },
      }),
    );
    for (const [path, content] of Object.entries(files)) {
      const file = join(cwd, path);
      mkdirSync(dirname(file), { recursive: true });
      writeFileSync(file, content);
    }
    const result = spawnSync(process.execPath, [script], {
      cwd,
      encoding: 'utf8',
      timeout: 8000,
    });
    return { exit: result.status, output: result.stdout + result.stderr };
  } finally {
    rmSync(cwd, { recursive: true, force: true });
  }
}

describe('architecture gate', () => {
  it('reports the transitive client-to-server path through aliases', () => {
    const result = runGate({
      'src/app/widget.tsx':
        "'use client'; import { answer } from '@/shared/bridge'; console.log(answer);",
      'src/shared/bridge.ts': "export { answer } from '@/shared/secret';",
      'src/shared/secret.ts': "import 'server-only'; export const answer = 42;",
    });
    expect(result.exit).toBe(1);
    expect(result.output).toContain(
      'src/app/widget.tsx -> src/shared/bridge.ts -> src/shared/secret.ts',
    );
  });

  it.each(['', "'use client'; "])(
    'checks a public client entry even when only an RSC imports it (directive: %s)',
    (directive) => {
      const result = runGate({
        'src/app/page.ts':
          "export { answer } from '@/features/catalog/client';",
        'src/features/catalog/client.ts':
          directive + "export { answer } from './bridge';",
        'src/features/catalog/bridge.ts':
          "export { answer } from '@/shared/secret';",
        'src/shared/secret.ts':
          "import 'server-only'; export const answer = 42;",
      });
      expect(result.exit).toBe(1);
      expect(result.output.match(/^no-client-to-server: .*$/gm)).toEqual([
        'no-client-to-server: src/features/catalog/client.ts -> src/features/catalog/bridge.ts -> src/shared/secret.ts',
      ]);
    },
  );

  it('allows type-only imports through client public entries', () => {
    const result = runGate({
      'src/app/page.ts':
        "export type { Secret } from '@/features/catalog/client';",
      'src/features/catalog/client.ts':
        "export type { Secret } from '@/shared/secret';",
      'src/shared/secret.ts':
        "import 'server-only'; export type Secret = string;",
    });
    expect(result.exit).toBe(0);
  });

  it('limits global fetch in the model entry and descendants but allows it in adapters', async () => {
    const eslint = new ESLint();
    const cases = [
      ['src/features/catalog/model.ts', 'fetch', 1],
      ['src/features/catalog/model/nested/rules.ts', 'globalThis.fetch', 1],
      ['src/server/adapters/java/catalog-v1.server.ts', 'fetch', 0],
    ] as const;
    for (const [filePath, fetchName, errors] of cases) {
      const [result] = await eslint.lintText(
        'export const read = () => ' + fetchName + '("https://example.test");',
        { filePath },
      );
      expect(
        result.messages.map(({ ruleId, severity }) => [ruleId, severity]),
      ).toEqual(errors ? [['no-restricted-globals', 2]] : []);
    }
  });

  it('forbids cross-feature dependencies and feature internals in composition', () => {
    const result = runGate({
      'src/features/cart/model.ts':
        "export { title } from '@/features/catalog/ui/book';",
      'src/features/catalog/ui/book.ts': "export const title = 'React';",
      'src/app/page.ts': "export { title } from '@/features/catalog/ui/book';",
    });
    expect(result.exit).toBe(1);
    expect(result.output).toContain('no-cross-feature');
    expect(result.output).toContain('feature-public-entries');
  });

  it('keeps React out of pure models even through a helper', () => {
    const result = runGate({
      'src/features/catalog/model.ts':
        "export { createElement } from '@/shared/view';",
      'src/shared/view.ts': "export { createElement } from 'react';",
    });
    expect(result.exit).toBe(1);
    expect(result.output).toContain('pure-model');
  });

  it('rejects a computed module path', () => {
    const result = runGate({
      'src/app/loader.ts':
        'export const load = (name: string) => import(name);',
    });
    expect(result.exit).toBe(1);
    expect(result.output).toContain('non-literal module path');
  });

  it('permits an RSC to pass a server action to a client component', () => {
    const result = runGate({
      'src/app/page.tsx':
        "import { Button } from './widget'; import { save } from './action'; export default function Page() { return <Button action={save} />; }",
      'src/app/action.ts': "'use server'; export async function save() {}",
      'src/app/widget.tsx':
        "'use client'; export function Button({action}: { action: () => Promise<void> }) { return <form action={action} />; }",
    });
    expect(result.output).toContain('No architecture violations');
    expect(result.exit).toBe(0);
  });
});
