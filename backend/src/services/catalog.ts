import type { Db } from '../db';
import { daysAgo, dealFlag, inWindow, isoDay, startingPrice, summarize } from '../lib/pricing';
import { notFound } from '../lib/http';
import { screenFitAll } from '../lib/screenFit';
import {
  RATING_ORDER,
  type CommunityActivity,
  type DealFlag,
  type DeviceCard,
  type DeviceSpecs,
  type EmulatedSystem,
  type EmulationRating,
  type EmulationRatingLevel,
  type OsOption,
  type PricePoint,
  type PriceSummary,
  type ScreenFit,
} from '../types';

/*
 * The whole catalog is read from the database into memory, with prices and screen-fit already worked out,
 * and search/detail requests use that copy. A few hundred devices is a few hundred KB, and filters like
 * "screen fit for GBA" need computed values anyway.
 *
 * The copy is refreshed every 30 seconds, so data imported by another process shows up without a restart.
 * Code that changes the catalog in this process calls invalidateCatalog() to refresh it right away.
 */
const CACHE_TTL_MS = 30_000;

/** One device with everything the API needs, pre-computed */
export interface CatalogDevice {
  card: DeviceCard;
  summary: string;
  aliases: string[];
  specs: DeviceSpecs;
  os: OsOption[];
  communityActivity: CommunityActivity | null;
  buildQuality: 1 | 2 | 3 | 4 | 5 | null;
  emulation: EmulationRating[];
  ratingBySystem: Map<string, EmulationRatingLevel>;
  screenFit: ScreenFit[];
  fitBySystem: Map<string, ScreenFit>;
  prices: PricePoint[];
  /** Stats over the last 90 days */
  price: PriceSummary;
  deal: DealFlag;
  /** Name, brand, slug and aliases in lowercase, for search */
  searchText: string;
  /** searchText without spaces or punctuation, so "rg35xx sp" finds "RG35XXSP" */
  compactSearchText: string;
}

export interface Catalog {
  systems: EmulatedSystem[];
  devices: CatalogDevice[];
  byId: Map<string, CatalogDevice>;
  bySlug: Map<string, CatalogDevice>;
  /** Hand-picked "pairs well with" entries, by device id */
  curatedPairs: Map<string, { pairId: string; reason: string }[]>;
  loadedAt: number;
}

let cached: { db: Db; catalog: Catalog } | null = null;

export function getCatalog(db: Db): Catalog {
  const isFresh = cached && cached.db === db && Date.now() - cached.catalog.loadedAt < CACHE_TTL_MS;
  if (!isFresh) cached = { db, catalog: loadCatalog(db) };
  return cached!.catalog;
}

export function invalidateCatalog() {
  cached = null;
}

/** Looks a device up by slug or id, or throws a 404 */
export function requireDevice(catalog: Catalog, slugOrId: string): CatalogDevice {
  const device = catalog.bySlug.get(slugOrId) ?? catalog.byId.get(slugOrId);
  if (!device) throw notFound('Device');
  return device;
}

/** True if a device's rating for a system is `min` or better. No rating counts as "no". */
export function playsAtLeast(rating: EmulationRatingLevel | undefined, min: EmulationRatingLevel) {
  return rating !== undefined && RATING_ORDER.indexOf(rating) >= RATING_ORDER.indexOf(min);
}

/** Lowercase, letters and digits only ("+" kept so "Miyoo Mini +" stays distinct) */
export function compactText(text: string) {
  return text.toLowerCase().replace(/[^a-z0-9+|]/g, '');
}

/* ------------------------------------------------------------------ loading */

// Rows come straight from SQLite, so they're loosely typed here and shaped into the API types below.
type Row = Record<string, any>;

export function loadCatalog(db: Db, now = new Date()): Catalog {
  const all = (sql: string) => db.prepare(sql).all() as Row[];

  const systems = all('SELECT * FROM systems ORDER BY sort_order').map((row): EmulatedSystem => ({
    id: row.id,
    name: row.name,
    generation: row.generation,
    native: { w: row.native_w, h: row.native_h },
    aspectRatio: row.aspect_ratio,
    dualScreen: Boolean(row.dual_screen),
    sortOrder: row.sort_order,
  }));

  const osByDevice = groupByDevice(
    all('SELECT * FROM device_os ORDER BY kind DESC, name'),
    (row): OsOption => ({
      id: row.os_id,
      name: row.name,
      kind: row.kind,
      description: row.description ?? undefined,
      url: row.url ?? undefined,
    }),
  );

  const systemOrder = new Map(systems.map((system) => [system.id, system.sortOrder]));
  const ratingsByDevice = groupByDevice(all('SELECT * FROM emulation_ratings'), (row): EmulationRating => ({
    systemId: row.system_id,
    rating: row.rating,
    notes: row.notes ?? undefined,
  }));

  const pricesByDevice = groupByDevice(
    all('SELECT * FROM price_points ORDER BY observed_at'),
    (row): PricePoint => ({
      observedAt: row.observed_at,
      priceUsd: row.price_usd,
      condition: row.condition,
      source: row.source,
      url: row.url ?? undefined,
    }),
  );

  const curatedPairs = groupByDevice(all('SELECT * FROM device_pairs'), (row) => ({
    pairId: row.pair_device_id as string,
    reason: row.reason as string,
  }));

  const devices = all('SELECT * FROM devices').map((row): CatalogDevice => {
    const specs = parseJson<DeviceSpecs>(row.specs, {} as DeviceSpecs);
    const aliases = parseJson<string[]>(row.aliases, []);
    const prices = pricesByDevice.get(row.id) ?? [];
    const price = summarize(inWindow(prices, daysAgo(now, 90), isoDay(now)), prices, now);
    const screenFit = screenFitAll(specs.screen, systems);
    const emulation = (ratingsByDevice.get(row.id) ?? []).sort(
      (a, b) => (systemOrder.get(a.systemId) ?? Infinity) - (systemOrder.get(b.systemId) ?? Infinity),
    );

    return {
      card: {
        id: row.id,
        slug: row.slug,
        name: row.name,
        brand: row.brand,
        category: row.category,
        formFactor: row.form_factor,
        releaseDate: row.release_date,
        status: row.status,
        startingPriceUsd: startingPrice(prices, row.msrp_usd, now),
        msrpUsd: row.msrp_usd,
        screenSizeIn: specs.screen?.sizeIn ?? null,
        aspectRatio: specs.screen?.aspectRatio ?? null,
        popularity: row.popularity,
      },
      summary: row.summary,
      aliases,
      specs,
      os: osByDevice.get(row.id) ?? [],
      communityActivity: row.community_activity,
      buildQuality: row.build_quality,
      emulation,
      ratingBySystem: new Map(emulation.map((e) => [e.systemId, e.rating])),
      screenFit,
      fitBySystem: new Map(screenFit.map((fit) => [fit.systemId, fit])),
      prices,
      price,
      deal: dealFlag(prices, now),
      searchText: [row.name, row.brand, row.slug, ...aliases].join(' ').toLowerCase(),
      compactSearchText: compactText([row.name, row.brand, ...aliases].join('|')),
    };
  });

  return {
    systems,
    devices,
    byId: new Map(devices.map((device) => [device.card.id, device])),
    bySlug: new Map(devices.map((device) => [device.card.slug, device])),
    curatedPairs,
    loadedAt: Date.now(),
  };
}

/** Groups rows by their device_id column, converting each with `toItem` */
function groupByDevice<T>(rows: Row[], toItem: (row: Row) => T) {
  const groups = new Map<string, T[]>();
  for (const row of rows) {
    const group = groups.get(row.device_id) ?? [];
    group.push(toItem(row));
    groups.set(row.device_id, group);
  }
  return groups;
}

function parseJson<T>(text: string | null, fallback: T): T {
  if (!text) return fallback;
  try {
    return JSON.parse(text) as T;
  } catch {
    return fallback;
  }
}
