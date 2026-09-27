// Usage: npm run import -- path/to/data.json [more.json ...]
import { readFileSync } from 'node:fs';
import { ZodError, z } from 'zod';
import { config } from '../config';
import { openDb } from './index';
import { importData } from './importer';

const files = process.argv.slice(2);
if (files.length === 0) {
  console.error('Usage: npm run import -- <file.json> [...]');
  process.exit(1);
}

const db = openDb(config.databasePath);
for (const file of files) {
  try {
    const counts = importData(db, JSON.parse(readFileSync(file, 'utf8')));
    console.log(`${file}:`, counts);
  } catch (err) {
    console.error(`${file}: import failed, nothing from this file was written.`);
    console.error(err instanceof ZodError ? z.prettifyError(err) : err);
    process.exitCode = 1;
  }
}
