import { z } from 'zod';
import { bool, csv, num } from '../lib/http';
import { FIT_ORDER, type DeviceSearchResponse, type FacetCount } from '../types';
import { compactText, playsAtLeast, type Catalog, type CatalogDevice } from './catalog';

/**
 * Emulation tier pills. A device is in a tier when it plays every system in it at least "good".
 * Tiers go from easiest to hardest to emulate.
 */
export const EMULATION_TIERS = [
  { id: 'ps1', label: 'PS1', systems: ['psx'] },
  { id: 'n64', label: 'N64', systems: ['n64'] },
  { id: 'ps2_gc', label: 'PS2/GC', systems: ['ps2', 'gc'] },
  { id: 'switch', label: 'Switch', systems: ['switch'] },
] as const;

type TierId = (typeof EMULATION_TIERS)[number]['id'];

function tiersOf(device: CatalogDevice): TierId[] {
  return EMULATION_TIERS.filter((tier) =>
    tier.systems.every((systemId) => playsAtLeast(device.ratingBySystem.get(systemId), 'good')),
  ).map((tier) => tier.id);
}

/**
 * Query params accepted by GET /api/devices. Lists are comma-separated ("formFactor=vertical,clamshell").
 * This schema is both the validation and the DeviceQuery type, so the two can't drift apart.
 */
export const deviceQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  category: z.enum(['handheld', 'home']).optional(),
  formFactor: csv(z.enum(['vertical', 'horizontal', 'clamshell', 'home'])).optional(),
  brand: csv(z.string()).optional(),
  priceMin: num.min(0).optional(),
  priceMax: num.min(0).optional(),
  screenMin: num.min(0).optional(),
  screenMax: num.min(0).optional(),
  panel: csv(z.string()).optional(),
  aspect: csv(z.string()).optional(),
  os: csv(z.string()).optional(),
  sticks: z.coerce.number().int().min(0).max(2).optional(),
  hallSticks: bool.optional(),
  triggers: bool.optional(),
  batteryMin: num.min(0).optional(),
  wifi: bool.optional(),
  bluetooth: bool.optional(),
  videoOut: bool.optional(),
  /** Emulation tier pills; a device matches if it's in ANY of the selected tiers */
  tier: csv(z.enum(EMULATION_TIERS.map((tier) => tier.id) as [TierId, ...TierId[]])).optional(),
  playsWell: csv(z.string()).optional(),
  fitFor: z.string().optional(),
  fitMin: z.enum(FIT_ORDER).optional(),
  status: z.enum(['available', 'discontinued', 'upcoming']).optional(),
  sort: z.enum(['price_asc', 'price_desc', 'newest', 'popularity', 'name']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(60).default(24),
});

export type DeviceQuery = z.infer<typeof deviceQuerySchema>;

/** Sidebar groups that show counts. Each one's counts ignore its own filter (see searchDevices). */
type FacetName = 'tier' | 'category' | 'formFactor' | 'brand' | 'panel' | 'aspect' | 'os' | 'status';

interface Filter {
  /** Set when the filter belongs to a sidebar group with counts */
  facet?: FacetName;
  matches: (device: CatalogDevice) => boolean;
}

export function searchDevices(catalog: Catalog, query: DeviceQuery): DeviceSearchResponse {
  const filters = buildFilters(query);
  const passes = (device: CatalogDevice, ignoring?: FacetName) =>
    filters.every((filter) => (ignoring && filter.facet === ignoring) || filter.matches(device));

  const results = catalog.devices.filter((device) => passes(device)).sort(sorter(query.sort ?? 'popularity'));
  const start = (query.page - 1) * query.pageSize;

  return {
    items: results.slice(start, start + query.pageSize).map((device) => device.card),
    page: query.page,
    pageSize: query.pageSize,
    total: results.length,
    facets: buildFacets(catalog, passes),
  };
}

/** Price used for price filters and sorting: the card's "from $X" price */
function priceOf(device: CatalogDevice) {
  return device.card.startingPriceUsd;
}

/** One filter per query param that was given. Unknown values ("no data") fail the filter. */
function buildFilters(query: DeviceQuery): Filter[] {
  const filters: Filter[] = [];
  const add = (matches: Filter['matches'], facet?: FacetName) => filters.push({ matches, facet });

  if (query.q) {
    const words = query.q.toLowerCase().split(/\s+/);
    const squashed = compactText(query.q);
    add(
      (d) =>
        words.every((word) => d.searchText.includes(word)) ||
        (squashed !== '' && d.compactSearchText.includes(squashed)),
    );
  }

  const { category, formFactor, brand, status, panel, aspect, os } = query;
  if (category) add((d) => d.card.category === category, 'category');
  if (formFactor?.length) add((d) => formFactor.includes(d.card.formFactor), 'formFactor');
  if (brand?.length) {
    const brands = brand.map((b) => b.toLowerCase());
    add((d) => brands.includes(d.card.brand.toLowerCase()), 'brand');
  }
  if (status) add((d) => d.card.status === status, 'status');
  if (panel?.length) add((d) => panel.includes(d.specs.screen?.panel ?? ''), 'panel');
  if (aspect?.length) add((d) => aspect.includes(d.card.aspectRatio ?? ''), 'aspect');
  if (os?.length) add((d) => d.os.some((option) => os.includes(option.id)), 'os');

  const { priceMin, priceMax, screenMin, screenMax, batteryMin, sticks } = query;
  if (priceMin !== undefined) add((d) => (priceOf(d) ?? -Infinity) >= priceMin);
  if (priceMax !== undefined) add((d) => (priceOf(d) ?? Infinity) <= priceMax);
  if (screenMin !== undefined) add((d) => (d.card.screenSizeIn ?? -Infinity) >= screenMin);
  if (screenMax !== undefined) add((d) => (d.card.screenSizeIn ?? Infinity) <= screenMax);
  if (batteryMin !== undefined) add((d) => (d.specs.batteryLifeHrs?.max ?? 0) >= batteryMin);
  if (sticks !== undefined) add((d) => (d.specs.controls?.analogSticks ?? 0) >= sticks);

  // Yes/no filters: "true" keeps devices that have it, "false" keeps devices that don't
  const yesNo = (wanted: boolean | undefined, has: (d: CatalogDevice) => boolean) => {
    if (wanted !== undefined) add((d) => has(d) === wanted);
  };
  yesNo(query.hallSticks, (d) => ['hall', 'tmr'].includes(d.specs.controls?.stickType ?? ''));
  yesNo(query.triggers, (d) =>
    ['l1r1l2r2', 'l1r1_analog_triggers'].includes(d.specs.controls?.shoulders ?? ''),
  );
  yesNo(query.wifi, (d) => d.specs.connectivity?.wifi === true);
  yesNo(query.bluetooth, (d) => d.specs.connectivity?.bluetooth === true);
  yesNo(query.videoOut, (d) => (d.specs.connectivity?.videoOut ?? 'none') !== 'none');

  const { tier, playsWell, fitFor } = query;
  if (tier?.length) add((d) => tiersOf(d).some((id) => tier.includes(id)), 'tier');
  if (playsWell?.length) {
    add((d) => playsWell.every((systemId) => playsAtLeast(d.ratingBySystem.get(systemId), 'good')));
  }
  if (fitFor) {
    const minFit = FIT_ORDER.indexOf(query.fitMin ?? 'good');
    add((d) => {
      const fit = d.fitBySystem.get(fitFor);
      return fit !== undefined && FIT_ORDER.indexOf(fit.bucket) >= minFit;
    });
  }
  return filters;
}

/**
 * Counts for the sidebar. Each group's counts apply every filter except the group's own, so with
 * "Vertical" ticked the sidebar still shows how many Clamshell devices there are.
 */
function buildFacets(catalog: Catalog, passes: (device: CatalogDevice, ignoring?: FacetName) => boolean) {
  const countBy = (
    facet: FacetName,
    valuesOf: (d: CatalogDevice) => string[],
    labels?: Map<string, string>,
  ) =>
    countValues(
      catalog.devices.filter((device) => passes(device, facet)),
      valuesOf,
      labels,
    );

  // Label OS ids with a family name ("Android 13" -> "Android"), since versions differ between devices
  const osLabels = new Map(
    catalog.devices.flatMap((d) =>
      d.os.map((option) => [option.id, option.name.replace(/\s+[\d./]+$/, '')] as const),
    ),
  );

  return {
    // Always all four tiers, in order, even when a count is 0, so the pills don't jump around
    tier: EMULATION_TIERS.map((tier) => ({
      value: tier.id,
      label: tier.label,
      count: catalog.devices.filter((d) => passes(d, 'tier') && tiersOf(d).includes(tier.id)).length,
    })),
    category: countBy('category', (d) => [d.card.category]),
    formFactor: countBy('formFactor', (d) => [d.card.formFactor]),
    brand: countBy('brand', (d) => [d.card.brand]),
    panel: countBy('panel', (d) => (d.specs.screen ? [d.specs.screen.panel] : [])),
    aspect: countBy('aspect', (d) => (d.card.aspectRatio ? [d.card.aspectRatio] : [])),
    os: countBy('os', (d) => d.os.map((option) => option.id), osLabels),
    status: countBy('status', (d) => [d.card.status]),
    // Slider bounds cover the whole catalog, not the current results
    priceRange: minMax(catalog.devices.map(priceOf)),
    screenRange: minMax(catalog.devices.map((d) => d.card.screenSizeIn)),
  };
}

/** Counts how many devices have each value, most common first */
function countValues(
  devices: CatalogDevice[],
  valuesOf: (d: CatalogDevice) => string[],
  labels?: Map<string, string>,
): FacetCount[] {
  const counts = new Map<string, number>();
  for (const device of devices) {
    for (const value of new Set(valuesOf(device))) counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return [...counts]
    .map(([value, count]) => {
      const label = labels?.get(value);
      return label && label !== value ? { value, count, label } : { value, count };
    })
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
}

/** { min, max } of the known values, or null if there are none */
function minMax(values: (number | null)[]) {
  const known = values.filter((v): v is number => v !== null);
  return known.length ? { min: Math.min(...known), max: Math.max(...known) } : null;
}

type Comparator = (a: CatalogDevice, b: CatalogDevice) => number;

/** Sort order for results. Ties are broken by name so the order is stable. */
function sorter(sort: NonNullable<DeviceQuery['sort']>): Comparator {
  const byName: Comparator = (a, b) => a.card.name.localeCompare(b.card.name);
  const comparators: Record<typeof sort, Comparator> = {
    price_asc: byPrice(1),
    price_desc: byPrice(-1),
    newest: (a, b) => (b.card.releaseDate ?? '').localeCompare(a.card.releaseDate ?? ''),
    popularity: (a, b) => b.card.popularity - a.card.popularity,
    name: byName,
  };
  return (a, b) => comparators[sort](a, b) || byName(a, b);
}

/** Cheapest first (direction 1) or most expensive first (-1). Devices with no price always go last. */
function byPrice(direction: 1 | -1): Comparator {
  return (a, b) => {
    const priceA = priceOf(a);
    const priceB = priceOf(b);
    if (priceA === null || priceB === null) return (priceA === null ? 1 : 0) - (priceB === null ? 1 : 0);
    return (priceA - priceB) * direction;
  };
}
