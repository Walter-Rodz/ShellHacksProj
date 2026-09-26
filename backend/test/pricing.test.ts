import { describe, expect, it } from 'vitest';
import {
  daysAgo,
  dealFlag,
  detectEvents,
  median,
  startingPrice,
  summarize,
  weeklyMedians,
} from '../src/lib/pricing';
import type { PricePoint } from '../src/types';

const now = new Date('2026-06-30T12:00:00Z');
const pt = (ago: number, priceUsd: number, condition: PricePoint['condition'] = 'new'): PricePoint => ({
  observedAt: daysAgo(now, ago),
  priceUsd,
  condition,
  source: 'test',
});

describe('median', () => {
  it('handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 2, 3])).toBe(2.5);
    expect(median([])).toBeNull();
  });
});

describe('summarize', () => {
  it('returns nulls below the minimum sample size', () => {
    const pts = [pt(1, 100), pt(2, 110)];
    expect(summarize(pts, pts, now)).toMatchObject({
      avgUsd: null,
      medianUsd: null,
      sampleSize: 2,
      trend: 'unknown',
    });
  });

  it('computes stats and a downward trend', () => {
    const pts = [pt(40, 120), pt(45, 118), pt(50, 122), pt(5, 100), pt(10, 98), pt(15, 102)];
    const s = summarize(pts, pts, now);
    expect(s.avgUsd).toBe(110);
    expect(s.lowUsd).toBe(98);
    expect(s.highUsd).toBe(122);
    expect(s.trend).toBe('down');
    expect(s.trendPct).toBeCloseTo(-16.67, 1);
    expect(s.lastUpdated).toBe(daysAgo(now, 5));
  });
});

describe('dealFlag', () => {
  it('flags a listing at least 15% under the 90-day median', () => {
    const pts = [pt(30, 100), pt(40, 100), pt(60, 100), pt(2, 80)];
    expect(dealFlag(pts, now)).toMatchObject({
      isGoodDeal: true,
      lowestCurrentUsd: 80,
      median90dUsd: 100,
      percentBelowMedian: 20,
    });
  });

  it('does not flag small discounts or missing recent data', () => {
    expect(dealFlag([pt(30, 100), pt(40, 100), pt(60, 100), pt(2, 90)], now).isGoodDeal).toBe(false);
    expect(dealFlag([pt(30, 100), pt(40, 100), pt(60, 100)], now)).toMatchObject({
      isGoodDeal: false,
      lowestCurrentUsd: null,
    });
  });
});

describe('weeklyMedians', () => {
  it('groups by Monday-start week', () => {
    const pts: PricePoint[] = ['2026-06-01', '2026-06-03', '2026-06-08'].map((d, i) => ({
      observedAt: d,
      priceUsd: 100 + i * 10,
      condition: 'new',
      source: 't',
    }));
    expect(weeklyMedians(pts)).toEqual([
      { weekStart: '2026-06-01', medianUsd: 105, count: 2 },
      { weekStart: '2026-06-08', medianUsd: 120, count: 1 },
    ]);
  });
});

describe('detectEvents', () => {
  it('finds a price drop and the release date', () => {
    const pts: PricePoint[] = [];
    for (let d = 120; d >= 0; d -= 3) pts.push(pt(d, d > 50 ? 100 : 70));
    const events = detectEvents(pts, daysAgo(now, 120), daysAgo(now, 365));
    expect(events[0]).toMatchObject({ kind: 'release' });
    const drops = events.filter((e) => e.kind === 'drop');
    expect(drops).toHaveLength(1);
    expect(drops[0].changePct).toBeCloseTo(-30, 0);
  });

  it('reports nothing for a flat series', () => {
    const pts: PricePoint[] = [];
    for (let d = 120; d >= 0; d -= 3) pts.push(pt(d, 100));
    expect(detectEvents(pts, null, daysAgo(now, 365))).toEqual([]);
  });
});

describe('startingPrice', () => {
  it('is the cheapest price from the last 30 days', () => {
    expect(startingPrice([pt(5, 120), pt(10, 99), pt(40, 50)], 150, now)).toBe(99);
  });

  it('falls back to MSRP, then null', () => {
    expect(startingPrice([pt(40, 50)], 150, now)).toBe(150);
    expect(startingPrice([], null, now)).toBeNull();
  });
});
