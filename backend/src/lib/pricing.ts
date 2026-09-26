import type { DealFlag, PriceEvent, PricePoint, PriceSummary } from '../types';

/** Fewer price points than this and we say "not enough data" instead of showing a number */
const MIN_SAMPLE_SIZE = 3;
/** Trend is "flat" within this many percent */
const FLAT_TREND_PCT = 3;
/** A current listing this far below the 90-day median (15%) counts as a good deal */
const GOOD_DEAL_RATIO = 0.85;
/** Chart events: a move of at least this many percent in the 14-day rolling median */
const EVENT_THRESHOLD_PCT = 10;

const DAY_MS = 86_400_000;

/* ------------------------------------------------------------------ small helpers */

/** Rounds to cents */
export function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Date -> "YYYY-MM-DD" (UTC) */
export function isoDay(date: Date) {
  return date.toISOString().slice(0, 10);
}

/** "YYYY-MM-DD" of the day `days` before `now` */
export function daysAgo(now: Date, days: number) {
  return isoDay(new Date(now.getTime() - days * DAY_MS));
}

function parseDay(day: string) {
  return new Date(`${day}T00:00:00Z`);
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Points observed between `from` and `to`, both "YYYY-MM-DD" and inclusive */
export function inWindow(points: PricePoint[], from: string, to: string) {
  return points.filter((point) => point.observedAt >= from && point.observedAt <= to);
}

function pricesOf(points: PricePoint[]) {
  return points.map((point) => point.priceUsd);
}

/* ------------------------------------------------------------------ summaries */

/**
 * Average/median/low/high over `points` (the caller picks the date range and condition).
 * The trend compares the median of the last 30 days of `trendPoints` with the 30 days before that.
 */
export function summarize(points: PricePoint[], trendPoints: PricePoint[], now: Date): PriceSummary {
  const prices = pricesOf(points);
  const hasEnough = prices.length >= MIN_SAMPLE_SIZE;
  const latest =
    trendPoints
      .map((point) => point.observedAt)
      .sort()
      .at(-1) ?? null;

  return {
    avgUsd: hasEnough ? round2(prices.reduce((sum, price) => sum + price, 0) / prices.length) : null,
    medianUsd: hasEnough ? round2(median(prices)!) : null,
    lowUsd: hasEnough ? Math.min(...prices) : null,
    highUsd: hasEnough ? Math.max(...prices) : null,
    sampleSize: prices.length,
    ...trend(trendPoints, now),
    lastUpdated: latest,
  };
}

function trend(points: PricePoint[], now: Date): Pick<PriceSummary, 'trend' | 'trendPct'> {
  const last30Days = pricesOf(inWindow(points, daysAgo(now, 30), isoDay(now)));
  const previous30Days = pricesOf(inWindow(points, daysAgo(now, 60), daysAgo(now, 31)));
  if (last30Days.length < MIN_SAMPLE_SIZE || previous30Days.length < MIN_SAMPLE_SIZE) {
    return { trend: 'unknown', trendPct: null };
  }

  const recent = median(last30Days)!;
  const before = median(previous30Days)!;
  const changePct = round2(((recent - before) / before) * 100);
  const direction = changePct > FLAT_TREND_PCT ? 'up' : changePct < -FLAT_TREND_PCT ? 'down' : 'flat';
  return { trend: direction, trendPct: changePct };
}

/** Good deal: the cheapest listing from the last 7 days is at least 15% under the 90-day median. */
export function dealFlag(points: PricePoint[], now: Date): DealFlag {
  const last90Days = pricesOf(inWindow(points, daysAgo(now, 90), isoDay(now)));
  const last7Days = pricesOf(inWindow(points, daysAgo(now, 7), isoDay(now)));
  const typicalPrice = last90Days.length >= MIN_SAMPLE_SIZE ? round2(median(last90Days)!) : null;
  const lowestNow = last7Days.length > 0 ? Math.min(...last7Days) : null;

  if (typicalPrice === null || lowestNow === null) {
    return {
      isGoodDeal: false,
      lowestCurrentUsd: lowestNow,
      median90dUsd: typicalPrice,
      percentBelowMedian: null,
    };
  }
  return {
    isGoodDeal: lowestNow <= typicalPrice * GOOD_DEAL_RATIO,
    lowestCurrentUsd: lowestNow,
    median90dUsd: typicalPrice,
    percentBelowMedian: round2(((typicalPrice - lowestNow) / typicalPrice) * 100),
  };
}

/* ------------------------------------------------------------------ chart data */

/** Median price per week (weeks start on Monday), oldest first */
export function weeklyMedians(points: PricePoint[]) {
  const pricesByWeek = new Map<string, number[]>();
  for (const point of points) {
    const day = parseDay(point.observedAt);
    const daysSinceMonday = (day.getUTCDay() + 6) % 7;
    const weekStart = isoDay(new Date(day.getTime() - daysSinceMonday * DAY_MS));
    pricesByWeek.set(weekStart, [...(pricesByWeek.get(weekStart) ?? []), point.priceUsd]);
  }

  return [...pricesByWeek]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([weekStart, prices]) => ({ weekStart, medianUsd: round2(median(prices)!), count: prices.length }));
}

/**
 * Markers for the price chart: the release date, plus price drops and spikes. Every week, the median of the last
 * 14 days is compared with the median of the 14 days before; a change of 10% or more is a drop or spike.
 * Several weeks in a row moving the same way are reported once, at the biggest change.
 */
export function detectEvents(points: PricePoint[], releaseDate: string | null, from: string): PriceEvent[] {
  const events: PriceEvent[] = [];
  if (releaseDate && releaseDate >= from) events.push({ date: releaseDate, kind: 'release', changePct: 0 });
  if (points.length < 6) return events;

  const sorted = [...points].sort((a, b) => a.observedAt.localeCompare(b.observedAt));
  const medianOf14DaysEndingAt = (endMs: number) => {
    const prices = sorted
      .filter(
        (point) =>
          point.observedAt > isoDay(new Date(endMs - 14 * DAY_MS)) &&
          point.observedAt <= isoDay(new Date(endMs)),
      )
      .map((point) => point.priceUsd);
    return prices.length >= 2 ? median(prices) : null;
  };

  // Start 4 weeks in, so both 14-day windows have data
  const firstWeek = parseDay(sorted[0].observedAt).getTime() + 28 * DAY_MS;
  const lastDay = parseDay(sorted[sorted.length - 1].observedAt).getTime();

  let currentRun: PriceEvent | null = null;
  for (let week = firstWeek; week <= lastDay; week += 7 * DAY_MS) {
    const now = medianOf14DaysEndingAt(week);
    const before = medianOf14DaysEndingAt(week - 14 * DAY_MS);
    if (now === null || before === null) continue;

    const changePct = round2(((now - before) / before) * 100);
    const kind =
      changePct <= -EVENT_THRESHOLD_PCT ? 'drop' : changePct >= EVENT_THRESHOLD_PCT ? 'spike' : null;
    const event: PriceEvent | null = kind ? { date: isoDay(new Date(week)), kind, changePct } : null;

    if (event && currentRun?.kind === event.kind) {
      // Same direction as last week: keep whichever change was bigger
      if (Math.abs(event.changePct) > Math.abs(currentRun.changePct)) currentRun = event;
    } else {
      if (currentRun) events.push(currentRun);
      currentRun = event;
    }
  }
  if (currentRun) events.push(currentRun);

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

/* ------------------------------------------------------------------ card price */

/**
 * The "from $X" price on a card: the cheapest price seen in the last 30 days, or the MSRP when there's no
 * recent price. null when neither is known.
 */
export function startingPrice(points: PricePoint[], msrp: number | null, now: Date): number | null {
  const last30Days = pricesOf(inWindow(points, daysAgo(now, 30), isoDay(now)));
  if (last30Days.length > 0) return Math.min(...last30Days);
  return msrp;
}
