/*
 * Attach brand logos from a folder in one go.
 *
 *   npm run logos -- "path/to/logos"
 *
 * Name each file after the brand, e.g. "Anbernic.png", "retroid.jpg", "TrimUI.webp" (PNG, JPEG or WebP).
 * An existing logo for the same brand is replaced.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { config } from '../config';
import { loadCatalog } from '../services/catalog';
import { setBrandLogo } from '../services/images';
import { openDb } from './index';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const folder = process.argv[2];
if (!folder) {
  console.error('Usage: npm run logos -- <folder>');
  process.exit(1);
}

const db = openDb(config.databasePath);
const brands = [...new Set(loadCatalog(db).devices.map((device) => device.card.brand))];

// "Trim UI" and "trimui" both become "trimui"
const matchKey = (name: string) => name.toLowerCase().replace(/[^a-z0-9]/g, '');
const brandByKey = new Map(brands.map((brand) => [matchKey(brand), brand]));

const attached: string[] = [];
const unmatchedFiles: string[] = [];
for (const file of readdirSync(folder)) {
  if (!IMAGE_EXTENSIONS.includes(extname(file).toLowerCase())) continue;

  const brand = brandByKey.get(matchKey(file.slice(0, -extname(file).length)));
  if (!brand) {
    unmatchedFiles.push(file);
    continue;
  }
  try {
    setBrandLogo(db, brand, readFileSync(join(folder, file)));
    attached.push(brand);
  } catch (err) {
    console.error(`  ${file}: ${(err as Error).message}`);
  }
}

const missing = brands.filter((brand) => !attached.includes(brand));
console.log(`Attached ${attached.length} logo(s): ${attached.join(', ') || 'none'}`);
if (unmatchedFiles.length > 0) {
  console.log(`No brand matches: ${unmatchedFiles.join(', ')} (brands are: ${brands.join(', ')})`);
}
if (missing.length > 0) console.log(`Brands not in this folder: ${missing.join(', ')}`);
// The running server picks up new logos within 30 seconds.
