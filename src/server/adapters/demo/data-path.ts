import { lstatSync } from 'node:fs';
import { isAbsolute, join, normalize, parse } from 'node:path';
import { z } from 'zod';

export const demoSchemaVersion = 3;

export const demoDataDir = z
  .string()
  .refine(
    (value) =>
      isAbsolute(value) &&
      normalize(value) !== parse(value).root &&
      !/[\u0000-\u001f\u007f]/u.test(value) &&
      !value.split(/[/\\]/).includes('..'),
  )
  .transform((value) => normalize(value));

export function demoDatabasePath(dataDir: string) {
  const path = join(demoDataDir.parse(dataDir), 'demo.sqlite');
  const file = lstatSync(path, { throwIfNoEntry: false });
  if (file && !file.isFile())
    throw new Error('Expected a regular demo.sqlite file');
  return path;
}
