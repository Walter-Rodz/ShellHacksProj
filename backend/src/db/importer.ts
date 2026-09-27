import { z } from 'zod';
import { tx, type Db } from './index';

/*
 * Import format (one JSON file, every top-level key optional):
 *   { systems: System[], devices: Device[], pricePoints: PricePoint[], pairs: Pair[] }
 * Systems and devices are upserted by id. A device's `os` and `emulation` lists replace what was stored for
 * that device. Price points are appended; exact duplicates are skipped. See data/example-import.json.
 *
 * With `"removeDevicesNotListed": true` the file is treated as the whole catalog: consoles that aren't in it are
 * deleted, with their prices. The spreadsheet converter always sets this.
 */

const resolution = z.object({ w: z.number().int().positive(), h: z.number().int().positive() });
const screen = z.object({
  sizeIn: z.number().positive(),
  resolution,
  panel: z.enum(['ips', 'oled', 'amoled', 'lcd', 'tn']),
  aspectRatio: z.string(),
  touch: z.boolean().default(false),
});

const specs = z.looseObject({
  chip: z.string(),
  cpu: z.string().optional(),
  gpu: z.string().optional(),
  ramGb: z.number().nonnegative(),
  storage: z.object({
    internalGb: z.number().nonnegative(),
    expandable: z.boolean(),
    note: z.string().optional(),
  }),
  screen: screen.extend({ secondary: screen.optional() }).optional(),
  batteryMah: z.number().positive().optional(),
  batteryLifeHrs: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }).optional(),
  weightG: z.number().nonnegative().optional(),
  dimensionsMm: z.object({ w: z.number(), h: z.number(), d: z.number() }).optional(),
  // Omitted control/connectivity fields mean "unknown"
  controls: z
    .object({
      dpad: z.boolean().optional(),
      analogSticks: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
      stickType: z.enum(['hall', 'potentiometer', 'tmr']).optional(),
      faceButtons: z.number().int().nonnegative().optional(),
      shoulders: z.enum(['none', 'l1r1', 'l1r1l2r2', 'l1r1_analog_triggers']).optional(),
      rumble: z.boolean().optional(),
    })
    .default({}),
  connectivity: z
    .object({
      wifi: z.boolean().optional(),
      bluetooth: z.boolean().optional(),
      videoOut: z.enum(['none', 'usb_c', 'mini_hdmi', 'hdmi']).optional(),
      headphoneJack: z.boolean().optional(),
    })
    .default({}),
  colors: z.array(z.string()).optional(),
  speakers: z.string().optional(),
  charging: z.string().optional(),
  features: z.array(z.string()).optional(),
});

const rating = z.enum(['great', 'good', 'playable', 'poor', 'unplayable']);
const isoDate = z.iso.date();

const importSchema = z.object({
  removeDevicesNotListed: z.boolean().default(false),
  systems: z
    .array(
      z.object({
        id: z.string().min(1),
        name: z.string(),
        generation: z.number().int(),
        native: resolution,
        aspectRatio: z.string(),
        dualScreen: z.boolean().default(false),
        sortOrder: z.number().int(),
      }),
    )
    .default([]),
  devices: z
    .array(
      z.object({
        // Also used as the photo folder name, so keep it path-safe
        id: z.string().regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes'),
        slug: z.string().regex(/^[a-z0-9-]+$/, 'lowercase letters, digits and dashes'),
        name: z.string(),
        brand: z.string(),
        category: z.enum(['handheld', 'home']),
        formFactor: z.enum(['vertical', 'horizontal', 'clamshell', 'home']),
        releaseDate: isoDate.nullable().default(null),
        msrpUsd: z.number().positive().nullable().default(null),
        status: z.enum(['available', 'discontinued', 'upcoming']).default('available'),
        popularity: z.number().int().default(0),
        summary: z.string().default(''),
        specs,
        communityActivity: z.enum(['very_active', 'active', 'moderate', 'low']).nullable().default(null),
        buildQuality: z.number().int().min(1).max(5).nullable().default(null),
        aliases: z.array(z.string()).default([]),
        os: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              kind: z.enum(['stock', 'custom']),
              description: z.string().optional(),
              url: z.string().optional(),
            }),
          )
          .optional(),
        /** Either a list or a { systemId: rating } map */
        emulation: z
          .union([
            z.array(z.object({ systemId: z.string(), rating, notes: z.string().optional() })),
            z
              .record(z.string(), rating)
              .transform((m) =>
                Object.entries(m).map(([systemId, r]) => ({ systemId, rating: r, notes: undefined })),
              ),
          ])
          .optional(),
      }),
    )
    .default([]),
  pricePoints: z
    .array(
      z.object({
        deviceId: z.string(),
        observedAt: isoDate,
        priceUsd: z.number().positive(),
        condition: z.enum(['new', 'used', 'refurb']),
        source: z.string().default('manual'),
        url: z.string().optional(),
      }),
    )
    .default([]),
  pairs: z
    .array(z.object({ deviceId: z.string(), pairDeviceId: z.string(), reason: z.string() }))
    .default([]),
});

export type ImportData = z.input<typeof importSchema>;

export function importData(db: Db, raw: unknown) {
  const data = importSchema.parse(raw);
  const counts = {
    systems: 0,
    devices: 0,
    os: 0,
    emulation: 0,
    pricePoints: 0,
    pricePointsSkipped: 0,
    pairs: 0,
  };
  const removed: { id: string; name: string }[] = [];

  tx(db, () => {
    const upSystem = db.prepare(
      `INSERT INTO systems (id, name, generation, native_w, native_h, aspect_ratio, dual_screen, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET name = excluded.name, generation = excluded.generation, native_w = excluded.native_w,
         native_h = excluded.native_h, aspect_ratio = excluded.aspect_ratio, dual_screen = excluded.dual_screen,
         sort_order = excluded.sort_order`,
    );
    for (const s of data.systems) {
      upSystem.run(
        s.id,
        s.name,
        s.generation,
        s.native.w,
        s.native.h,
        s.aspectRatio,
        s.dualScreen ? 1 : 0,
        s.sortOrder,
      );
      counts.systems++;
    }

    const upDevice = db.prepare(
      `INSERT INTO devices (id, slug, name, brand, category, form_factor, release_date, msrp_usd, status, popularity,
         summary, specs, community_activity, build_quality, aliases)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT (id) DO UPDATE SET slug = excluded.slug, name = excluded.name, brand = excluded.brand,
         category = excluded.category, form_factor = excluded.form_factor, release_date = excluded.release_date,
         msrp_usd = excluded.msrp_usd, status = excluded.status, popularity = excluded.popularity,
         summary = excluded.summary, specs = excluded.specs,
         community_activity = excluded.community_activity, build_quality = excluded.build_quality,
         aliases = excluded.aliases`,
    );
    const delOs = db.prepare('DELETE FROM device_os WHERE device_id = ?');
    const insOs = db.prepare(
      'INSERT INTO device_os (device_id, os_id, name, kind, description, url) VALUES (?, ?, ?, ?, ?, ?)',
    );
    const delEmu = db.prepare('DELETE FROM emulation_ratings WHERE device_id = ?');
    const insEmu = db.prepare(
      'INSERT INTO emulation_ratings (device_id, system_id, rating, notes) VALUES (?, ?, ?, ?)',
    );

    for (const d of data.devices) {
      upDevice.run(
        d.id,
        d.slug,
        d.name,
        d.brand,
        d.category,
        d.formFactor,
        d.releaseDate,
        d.msrpUsd,
        d.status,
        d.popularity,
        d.summary,
        JSON.stringify(d.specs),
        d.communityActivity,
        d.buildQuality,
        JSON.stringify(d.aliases),
      );
      counts.devices++;
      if (d.os) {
        delOs.run(d.id);
        for (const o of d.os) {
          insOs.run(d.id, o.id, o.name, o.kind, o.description ?? null, o.url ?? null);
          counts.os++;
        }
      }
      if (d.emulation) {
        delEmu.run(d.id);
        for (const e of d.emulation) {
          insEmu.run(d.id, e.systemId, e.rating, e.notes ?? null);
          counts.emulation++;
        }
      }
    }

    const insPrice = db.prepare(
      `INSERT OR IGNORE INTO price_points (device_id, observed_at, price_usd, condition, source, url) VALUES (?, ?, ?, ?, ?, ?)`,
    );
    for (const p of data.pricePoints) {
      const { changes } = insPrice.run(
        p.deviceId,
        p.observedAt,
        p.priceUsd,
        p.condition,
        p.source,
        p.url ?? null,
      );
      if (changes) counts.pricePoints++;
      else counts.pricePointsSkipped++;
    }

    const upPair = db.prepare(
      `INSERT INTO device_pairs (device_id, pair_device_id, reason) VALUES (?, ?, ?)
       ON CONFLICT (device_id, pair_device_id) DO UPDATE SET reason = excluded.reason`,
    );
    for (const p of data.pairs) {
      upPair.run(p.deviceId, p.pairDeviceId, p.reason);
      counts.pairs++;
    }

    if (data.removeDevicesNotListed) {
      const listed = new Set(data.devices.map((d) => d.id));
      const stored = db.prepare('SELECT id, name FROM devices').all() as { id: string; name: string }[];
      for (const device of stored.filter((d) => !listed.has(d.id))) {
        // Prices, ratings, OS options and pairs go with it (ON DELETE CASCADE)
        db.prepare('DELETE FROM devices WHERE id = ?').run(device.id);
        removed.push(device);
      }
    }
  });

  return { ...counts, removedDevices: removed.map((device) => device.name) };
}
