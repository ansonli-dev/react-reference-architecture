import { mkdirSync, readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { demoBooks } from '../src/mocks/fixtures/catalog.ts';
import {
  demoDatabasePath,
  demoDataDir,
  demoSchemaVersion,
} from '../src/server/adapters/demo/data-path.ts';

const dir = demoDataDir.safeParse(process.env.DEMO_DATA_DIR);
if (!dir.success)
  throw new Error('Set DEMO_DATA_DIR to an absolute data directory.');

mkdirSync(dir.data, { recursive: true });
const db = new DatabaseSync(demoDatabasePath(dir.data), { timeout: 1000 });
try {
  db.exec('PRAGMA journal_mode = WAL');
  db.exec('BEGIN IMMEDIATE');
  try {
    const version = db.prepare('PRAGMA user_version').get().user_version;
    const migrations = [
      '001-catalog.sql',
      '002-checkout.sql',
      '003-checkout-resources.sql',
    ];
    if (
      typeof version !== 'number' ||
      version < 0 ||
      version > demoSchemaVersion
    )
      throw new Error('Unknown demo database schema');
    for (const file of migrations.slice(version)) {
      db.exec(
        readFileSync(
          new URL(
            '../src/server/adapters/demo/migrations/' + file,
            import.meta.url,
          ),
          'utf8',
        ),
      );
    }
    const insert = db.prepare(
      'INSERT INTO books (id, title, author, category, price_minor, currency, stock) ' +
        'VALUES (?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO NOTHING',
    );
    for (const book of demoBooks) {
      insert.run(
        book.id,
        book.title,
        book.author,
        book.category,
        book.priceMinor,
        book.currency,
        book.stock,
      );
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
} finally {
  db.close();
}

console.log('Demo bookstore seeded.');
