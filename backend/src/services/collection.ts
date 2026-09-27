import { z } from 'zod';
import { round2 } from '../lib/pricing';
import type { DeviceCard, PriceSummary } from '../types';
import type { Catalog, CatalogDevice } from './catalog';

/*
 * "My Collection" and price tracking, without accounts: each visitor's collection and watchlist are saved in their
 * own browser, and the page sends them here to get today's prices, values, totals and alerts. Nothing is stored
 * on the server.
 */

const MAX_ENTRIES = 200;

export const collectionRequestSchema = z.object({
  /** Consoles the user owns. The same console can appear more than once (e.g. two colors). */
  items: z
    .array(
      z.object({
        slug: z.string().min(1),
        /** What they paid, in USD; leave out if they don't want to say */
        paidUsd: z.number().min(0).nullable().optional(),
      }),
    )
    .max(MAX_ENTRIES)
    .default([]),
  /** Consoles the user is tracking, with an optional "tell me at or below this price" */
  watchlist: z
    .array(
      z.object({
        slug: z.string().min(1),
        targetPriceUsd: z.number().positive().nullable().optional(),
      }),
    )
    .max(MAX_ENTRIES)
    .default([]),
});

export type CollectionRequest = z.infer<typeof collectionRequestSchema>;

export interface CollectionResponse {
  items: {
    slug: string;
    device: DeviceCard;
    paidUsd: number | null;
    /** Today's market value (typical price over the last 90 days); null when there's no price */
    valueUsd: number | null;
    /** valueUsd - paidUsd; null unless both are known */
    gainUsd: number | null;
  }[];
  totals: {
    count: number;
    /** Sum of the known values */
    valueUsd: number;
    /** Sum of the known prices paid */
    paidUsd: number;
    /** Value minus paid, over the consoles where both are known */
    gainUsd: number;
  };
  watchlist: {
    slug: string;
    device: DeviceCard;
    targetPriceUsd: number | null;
    currentPriceUsd: number | null;
    /** true when there's a target and the current price is at or below it */
    belowTarget: boolean;
    trend: PriceSummary['trend'];
    trendPct: number | null;
    /** A recent listing is at least 15% under the usual price */
    isGoodDeal: boolean;
  }[];
  /** How many tracked consoles are at or below their target price */
  alertCount: number;
  /** Saved slugs that aren't in the catalog anymore (the page can drop them) */
  unknownSlugs: string[];
}

/** Today's market value: the typical (median) price over the last 90 days, else the card price */
function marketValue(device: CatalogDevice) {
  return device.price.medianUsd ?? device.card.startingPriceUsd;
}

export function summarizeCollection(catalog: Catalog, request: CollectionRequest): CollectionResponse {
  const unknownSlugs = new Set<string>();
  const find = (slug: string) => {
    const device = catalog.bySlug.get(slug);
    if (!device) unknownSlugs.add(slug);
    return device;
  };

  const items = request.items.flatMap(({ slug, paidUsd = null }) => {
    const device = find(slug);
    if (!device) return [];
    const valueUsd = marketValue(device);
    const gainUsd = valueUsd !== null && paidUsd !== null ? round2(valueUsd - paidUsd) : null;
    return [{ slug, device: device.card, paidUsd, valueUsd, gainUsd }];
  });

  const watchlist = request.watchlist.flatMap(({ slug, targetPriceUsd = null }) => {
    const device = find(slug);
    if (!device) return [];
    const currentPriceUsd = device.card.startingPriceUsd;
    return [
      {
        slug,
        device: device.card,
        targetPriceUsd,
        currentPriceUsd,
        belowTarget: targetPriceUsd !== null && currentPriceUsd !== null && currentPriceUsd <= targetPriceUsd,
        trend: device.price.trend,
        trendPct: device.price.trendPct,
        isGoodDeal: device.deal.isGoodDeal,
      },
    ];
  });

  const sum = (values: number[]) => round2(values.reduce((total, value) => total + value, 0));
  const withBoth = items.filter((item) => item.gainUsd !== null);

  return {
    items,
    totals: {
      count: items.length,
      valueUsd: sum(items.map((item) => item.valueUsd ?? 0)),
      paidUsd: sum(items.map((item) => item.paidUsd ?? 0)),
      gainUsd: sum(withBoth.map((item) => item.gainUsd!)),
    },
    watchlist,
    alertCount: watchlist.filter((entry) => entry.belowTarget).length,
    unknownSlugs: [...unknownSlugs],
  };
}
