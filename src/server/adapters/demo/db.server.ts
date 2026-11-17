import 'server-only';
import { DatabaseSync } from 'node:sqlite';
import { ApiFailure } from '@/shared/api/error';
import { demoDatabasePath } from './data-path';

export type ReadDemoDb = <T>(read: (db: DatabaseSync) => T) => T;

export function createDemoDb(dataDir: string): ReadDemoDb {
  return (read) => {
    let db: DatabaseSync | undefined;
    try {
      db = new DatabaseSync(demoDatabasePath(dataDir), {
        readOnly: true,
        timeout: 500,
      });
      if (db.prepare('PRAGMA user_version').get()?.user_version !== 1) {
        throw new Error('Unknown teaching schema');
      }
      return read(db);
    } catch {
      throw new ApiFailure('CATALOG_UNAVAILABLE');
    } finally {
      db?.close();
    }
  };
}
