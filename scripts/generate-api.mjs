import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { renderContract } from './api-codegen/render.mjs';

const check = process.argv[2] === '--check';
const specs = [
  ['contracts/bff/v1.yaml', 'src/shared/api/generated/bff.ts'],
  [
    'contracts/java/catalog-v1.yaml',
    'src/server/adapters/java/generated/catalog-v1.ts',
  ],
];

for (const [source, target] of specs) {
  const output = new URL('../' + target, import.meta.url);
  const text = await renderContract(new URL('../' + source, import.meta.url));
  if (check) {
    const existing = await readFile(output, 'utf8').catch((error) => {
      if (error.code === 'ENOENT') return null;
      throw error;
    });
    if (existing !== text) {
      console.error(target + ' needs regeneration');
      process.exitCode = 1;
    }
  } else {
    await mkdir(new URL('.', output), { recursive: true });
    await writeFile(output, text);
  }
}
