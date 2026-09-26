import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';

export type Db = DatabaseSync;

const schemaSql = readFileSync(new URL('./schema.sql', import.meta.url), 'utf8');

/**
 * Opens the database file (creating it and its tables if needed). Pass ':memory:' for a throwaway test database.
 *
 * schema.sql only creates tables that don't exist yet. If you change an existing table, delete the database file
 * and re-import, or write the ALTER TABLE statements by hand.
 */
export function openDb(path: string): Db {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec('PRAGMA foreign_keys = ON; PRAGMA journal_mode = WAL;');
  db.exec(schemaSql);
  return db;
}

/** Runs fn in a transaction: either everything it writes is saved, or nothing is. */
export function tx<T>(db: Db, fn: () => T): T {
  db.exec('BEGIN');
  try {
    const result = fn();
    db.exec('COMMIT');
    return result;
  } catch (err) {
    db.exec('ROLLBACK');
    throw err;
  }
}
