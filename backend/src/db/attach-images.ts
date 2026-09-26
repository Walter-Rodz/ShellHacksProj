/*
 * Attach a folder of photos to consoles in one go.
 *
 *   npm run images -- "path/to/photos"            # skips consoles that already have photos
 *   npm run images -- "path/to/photos" --replace  # replaces their photos
 *
 * Files are matched to consoles by name: "RG35XXSP.png", "rg35xxsp.jpg" and "Miyoo Mini +.webp" all work.
 * For several photos per console add a number: "RG35XXSP 2.png", "rg35xxsp-3.jpg". Files are attached in name
 * order, so the one without a number (or the lowest number) becomes the cover photo.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { extname, join } from 'node:path';
import { config } from '../config';
import { loadCatalog } from '../services/catalog';
import { addDeviceImage, deleteDeviceImage } from '../services/images';
import { openDb } from './index';

const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.webp'];

const args = process.argv.slice(2);
const folder = args.find((arg) => !arg.startsWith('--'));
const replaceExisting = args.includes('--replace');
if (!folder) {
  console.error('Usage: npm run images -- <folder> [--replace]');
  process.exit(1);
}

const db = openDb(config.databasePath);
const catalog = loadCatalog(db);

// "Miyoo Mini +" and "miyoo-mini-plus" both become "miyoominiplus"
const matchKey = (name: string) =>
  name
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

const deviceIdByKey = new Map<string, string>();
for (const device of catalog.devices) {
  deviceIdByKey.set(matchKey(device.card.slug), device.card.id);
  deviceIdByKey.set(matchKey(device.card.name), device.card.id);
}

/** "RG35XXSP 2" -> the RG35XXSP's id: tries the full name first, then without a trailing photo number */
function findDeviceId(fileBaseName: string) {
  const withoutNumber = fileBaseName.replace(/[\s_-]*\(?\d{1,2}\)?$/, '');
  return deviceIdByKey.get(matchKey(fileBaseName)) ?? deviceIdByKey.get(matchKey(withoutNumber));
}

const imageFiles = readdirSync(folder)
  .filter((file) => IMAGE_EXTENSIONS.includes(extname(file).toLowerCase()))
  .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

const filesByDevice = new Map<string, string[]>();
const unmatchedFiles: string[] = [];
for (const file of imageFiles) {
  const deviceId = findDeviceId(file.slice(0, -extname(file).length));
  if (!deviceId) unmatchedFiles.push(file);
  else filesByDevice.set(deviceId, [...(filesByDevice.get(deviceId) ?? []), file]);
}

let photosAdded = 0;
const skippedDevices: string[] = [];
for (const [deviceId, files] of filesByDevice) {
  const existing = db.prepare('SELECT id FROM device_images WHERE device_id = ?').all(deviceId) as {
    id: string;
  }[];
  if (existing.length > 0 && !replaceExisting) {
    skippedDevices.push(deviceId);
    continue;
  }

  for (const image of existing) deleteDeviceImage(db, deviceId, image.id);
  for (const file of files) {
    try {
      addDeviceImage(db, deviceId, readFileSync(join(folder, file)));
      photosAdded++;
    } catch (err) {
      console.error(`  ${file}: ${(err as Error).message}`);
    }
  }
}

const stillMissing = catalog.devices
  .filter((device) => !filesByDevice.has(device.card.id) && device.images.length === 0)
  .map((device) => device.card.name);

console.log(`Attached ${photosAdded} photo(s) to ${filesByDevice.size - skippedDevices.length} console(s).`);
if (skippedDevices.length > 0) {
  console.log(`Skipped (already have photos, use --replace): ${skippedDevices.join(', ')}`);
}
if (unmatchedFiles.length > 0) console.log(`No matching console for: ${unmatchedFiles.join(', ')}`);
if (stillMissing.length > 0) {
  console.log(`Consoles still without a photo (${stillMissing.length}): ${stillMissing.join(', ')}`);
}
// The running server picks up the new photos within 30 seconds.
