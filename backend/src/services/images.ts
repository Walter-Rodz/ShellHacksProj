import { randomUUID } from 'node:crypto';
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { config } from '../config';
import type { Db } from '../db';
import { ApiError, notFound } from '../lib/http';

/*
 * Console photos are stored as files in UPLOADS_DIR/devices/<deviceId>/<imageId>.<ext> and listed in the
 * device_images table. The photo with the lowest sort_order is the cover shown on the grid.
 * Brand logos are stored in UPLOADS_DIR/brands/ and listed in the brand_logos table, one per brand.
 *
 * These functions only change the database and files. Callers must call invalidateCatalog() afterwards so
 * the API shows the change.
 */

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Works out the image type from the file's first bytes. The file name and browser-sent type can't be trusted. */
function detectImageType(data: Buffer): 'png' | 'jpg' | 'webp' | null {
  if (data.subarray(0, 8).equals(PNG_SIGNATURE)) return 'png';
  if (data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff) return 'jpg';
  if (data.toString('ascii', 0, 4) === 'RIFF' && data.toString('ascii', 8, 12) === 'WEBP') return 'webp';
  return null;
}

/** The path the backend serves a photo at (see the /uploads static route in app.ts) */
export function imagePath(deviceId: string, fileName: string) {
  return `/uploads/devices/${encodeURIComponent(deviceId)}/${encodeURIComponent(fileName)}`;
}

function deviceFolder(deviceId: string) {
  return join(config.uploadsDir, 'devices', deviceId);
}

function sortOrderRange(db: Db, deviceId: string) {
  return db
    .prepare(
      'SELECT MIN(sort_order) AS first, MAX(sort_order) AS last FROM device_images WHERE device_id = ?',
    )
    .get(deviceId) as { first: number | null; last: number | null };
}

/** Throws a 400 unless `data` is a PNG, JPEG or WebP within the size limit. Returns the file extension. */
function checkImage(data: Buffer) {
  if (data.length > config.maxImageBytes) {
    throw new ApiError('bad_request', `Image is larger than ${config.maxImageBytes / 1024 / 1024} MB`);
  }
  const type = detectImageType(data);
  if (!type) throw new ApiError('bad_request', 'File must be a PNG, JPEG or WebP image');
  return type;
}

/** Checks and saves one photo. It goes last, or first when `asCover` is true. */
export function addDeviceImage(db: Db, deviceId: string, data: Buffer, asCover = false) {
  const type = checkImage(data);
  const id = randomUUID();
  const fileName = `${id}.${type}`;
  mkdirSync(deviceFolder(deviceId), { recursive: true });
  writeFileSync(join(deviceFolder(deviceId), fileName), data);

  const { first, last } = sortOrderRange(db, deviceId);
  const sortOrder = asCover ? (first ?? 0) - 1 : (last ?? -1) + 1;
  db.prepare(
    'INSERT INTO device_images (id, device_id, file_name, sort_order, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(id, deviceId, fileName, sortOrder, new Date().toISOString());
  return { id, url: imagePath(deviceId, fileName) };
}

export function deleteDeviceImage(db: Db, deviceId: string, imageId: string) {
  const image = db
    .prepare('SELECT file_name FROM device_images WHERE id = ? AND device_id = ?')
    .get(imageId, deviceId) as { file_name: string } | undefined;
  if (!image) throw notFound('Image');

  db.prepare('DELETE FROM device_images WHERE id = ?').run(imageId);
  rmSync(join(deviceFolder(deviceId), image.file_name), { force: true });
}

export function setCoverImage(db: Db, deviceId: string, imageId: string) {
  const exists = db
    .prepare('SELECT 1 FROM device_images WHERE id = ? AND device_id = ?')
    .get(imageId, deviceId);
  if (!exists) throw notFound('Image');

  const { first } = sortOrderRange(db, deviceId);
  db.prepare('UPDATE device_images SET sort_order = ? WHERE id = ?').run(first! - 1, imageId);
}

/* ------------------------------------------------------------------ brand logos */

const brandsFolder = () => join(config.uploadsDir, 'brands');

export function brandLogoPath(fileName: string) {
  return `/uploads/brands/${encodeURIComponent(fileName)}`;
}

/** Saves a brand's logo, replacing any previous one. */
export function setBrandLogo(db: Db, brand: string, data: Buffer) {
  const type = checkImage(data);
  // A new file name each time, so browsers that cached the old logo fetch the new one
  const brandSlug = brand.toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const fileName = `${brandSlug}-${randomUUID().slice(0, 8)}.${type}`;
  mkdirSync(brandsFolder(), { recursive: true });
  writeFileSync(join(brandsFolder(), fileName), data);

  const previous = db.prepare('SELECT file_name FROM brand_logos WHERE brand = ?').get(brand) as
    { file_name: string } | undefined;
  db.prepare(
    'INSERT INTO brand_logos (brand, file_name) VALUES (?, ?) ON CONFLICT (brand) DO UPDATE SET file_name = excluded.file_name',
  ).run(brand, fileName);
  if (previous) rmSync(join(brandsFolder(), previous.file_name), { force: true });

  return { brand, url: brandLogoPath(fileName) };
}
