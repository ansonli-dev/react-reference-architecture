import 'server-only';
import { existsSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { ApiFailure } from '@/shared/api/error';
import { demoDatabasePath, demoSchemaVersion } from './data-path';

export type ReadDemoDb = <T>(read: (db: DatabaseSync) => T) => T;

export function createDemoDb(
  dataDir: string,
  { write = false } = {},
): ReadDemoDb {
  return (read) => {
    let db: DatabaseSync | undefined;
    try {
      const path = demoDatabasePath(dataDir);
      if (write && !existsSync(path))
        throw new Error('Seed the demo database first');
      db = new DatabaseSync(path, {
        readOnly: !write,
        timeout: 500,
      });
      if (
        db.prepare('PRAGMA user_version').get()?.user_version !==
        demoSchemaVersion
      ) {
        throw new Error('Unknown demo database schema');
      }
      return read(db);
    } catch {
      throw new ApiFailure('CATALOG_UNAVAILABLE');
    } finally {
      db?.close();
    }
  };
}
