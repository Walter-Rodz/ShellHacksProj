import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { importData } from '../src/db/importer';
import { daysAgo } from '../src/lib/pricing';
import { invalidateCatalog } from '../src/services/catalog';

// Tests use the rule-based ranking so they never call Gemini (the .env file may hold a real key)
delete process.env.GEMINI_API_KEY;

const console = (
  id: string,
  opts: { price: number; screen: number; os: 'linux' | 'android'; mah: number; ps2: boolean },
) => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  brand: 'Test',
  category: 'handheld' as const,
  formFactor: 'horizontal' as const,
  specs: {
    chip: 'X',
    ramGb: 1,
    storage: { internalGb: 0, expandable: true },
    batteryMah: opts.mah,
    screen: {
      sizeIn: opts.screen,
      resolution: { w: 640, h: 480 },
      panel: 'ips' as const,
      aspectRatio: '4:3',
      touch: false,
    },
  },
  os: [{ id: opts.os, name: opts.os === 'linux' ? 'Linux' : 'Android 13', kind: 'stock' as const }],
  emulation: opts.ps2
    ? { psx: 'great' as const, ps2: 'good' as const, gc: 'good' as const }
    : { psx: 'good' as const },
});

let server: Server;
let base: string;

beforeAll(async () => {
  invalidateCatalog();
  const db = openDb(':memory:');
  importData(db, {
    systems: ['psx', 'ps2', 'gc'].map((id, i) => ({
      id,
      name: id,
      generation: 5,
      native: { w: 320, h: 240 },
      aspectRatio: '4:3',
      sortOrder: i,
    })),
    devices: [
      console('small-linux', { price: 50, screen: 3.5, os: 'linux', mah: 3000, ps2: false }),
      console('small-linux-big-battery', { price: 80, screen: 3.5, os: 'linux', mah: 5000, ps2: false }),
      console('mid-android', { price: 150, screen: 4.7, os: 'android', mah: 5000, ps2: true }),
      console('big-android', { price: 300, screen: 6, os: 'android', mah: 6000, ps2: true }),
    ],
    pricePoints: [
      ['small-linux', 50],
      ['small-linux-big-battery', 80],
      ['mid-android', 150],
      ['big-android', 300],
    ].map(([deviceId, priceUsd]) => ({
      deviceId: deviceId as string,
      observedAt: daysAgo(new Date(), 1),
      priceUsd: priceUsd as number,
      condition: 'new' as const,
    })),
  });
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => {
  server.close();
});

const build = async (body: unknown) => {
  const res = await fetch(`${base}/ai-builder`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
};
const pickIds = (body: any) => body.picks.map((p: any) => p.device.id);

describe('POST /api/ai-builder', () => {
  it('accepts the frontend format and turns every answer into a filter', async () => {
    const { status, body } = await build({ price: '310', screen: 'compact', os: 'linux', battery: 'long' });
    expect(status).toBe(200);
    expect(body.filters).toMatchObject({ priceMax: 310, screenMax: 3.99, batteryMahMin: 5000 });
    expect(body.filters.os).toContain('linux');
    expect(pickIds(body)).toEqual(['small-linux-big-battery']);
    expect(body).toMatchObject({ matchCount: 1, relaxed: [], rankedBy: 'rules' });
    expect(body.picks[0]).toMatchObject({ rank: 1, reason: expect.stringContaining('$80') });
  });

  it('returns every match, picks first, not just the top 3', async () => {
    const { body } = await build({ price: '620' });
    expect(body.matchCount).toBe(4);
    expect(body.matches).toHaveLength(4);
    expect(body.matches.slice(0, 3).map((d: any) => d.id)).toEqual(pickIds(body));
    expect(body.matches[3].id).toBe('small-linux-big-battery');
  });

  it('ranks the most capable first, then cheapest, and returns at most 3', async () => {
    const { body } = await build({ price: '620', screen: '', os: 'any', battery: 'standard' });
    expect(body.matchCount).toBe(4);
    expect(pickIds(body)).toEqual(['mid-android', 'big-android', 'small-linux']);
    expect(body.picks[0].reason).toContain('Plays up to PS2/GC');
  });

  it('respects the price limit and screen size ranges', async () => {
    expect(pickIds((await build({ price: '100' })).body).sort()).toEqual([
      'small-linux',
      'small-linux-big-battery',
    ]);
    expect(pickIds((await build({ screen: 'medium' })).body)).toEqual(['mid-android']);
    expect(pickIds((await build({ screen: 'large' })).body)).toEqual(['big-android']);
    expect(pickIds((await build({ os: 'android', price: '200' })).body)).toEqual(['mid-android']);
  });

  it('loosens the least important answers when nothing matches all of them', async () => {
    // No Linux device is large; battery is dropped first, then screen
    const { body } = await build({ price: '310', screen: 'large', os: 'linux', battery: 'long' });
    expect(body.relaxed).toEqual(['battery', 'screen']);
    expect(pickIds(body)).toEqual(['small-linux', 'small-linux-big-battery']); // equally capable -> cheapest first
    expect(body.summary).toContain('loosened');
  });

  it('accepts any letter case and rejects unknown answers', async () => {
    expect((await build({ screen: 'COMPACT', os: 'Linux' })).status).toBe(200);
    expect((await build({ screen: 'huge' })).status).toBe(400);
    expect((await build({ price: 'cheap' })).status).toBe(400);
  });
});

describe('POST /api/ai/chat', () => {
  const chat = async (body: unknown) => {
    const res = await fetch(`${base}/ai/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  it('answers with a friendly "busy" reply when Gemini is unavailable', async () => {
    const { status, body } = await chat({ messages: [{ role: 'user', content: 'Something for GBA?' }] });
    expect(status).toBe(200);
    expect(body).toMatchObject({ answeredBy: 'unavailable', consoles: [] });
    expect(body.reply).toContain('busy');
  });

  it('rejects empty or badly formed conversations', async () => {
    expect((await chat({ messages: [] })).status).toBe(400);
    expect((await chat({ messages: [{ role: 'user', content: '   ' }] })).status).toBe(400);
    expect((await chat({ messages: [{ role: 'assistant', content: 'Hi!' }] })).status).toBe(400);
    expect((await chat({ messages: [{ role: 'user', content: 'x'.repeat(1001) }] })).status).toBe(400);
  });
});

describe('POST /api/collection/summary', () => {
  const summary = async (body: unknown) => {
    const res = await fetch(`${base}/collection/summary`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    return { status: res.status, body: await res.json() };
  };

  it('values the collection and totals it', async () => {
    const { status, body } = await summary({
      items: [
        { slug: 'mid-android', paidUsd: 120 }, // worth 150 -> +30
        { slug: 'small-linux', paidUsd: 70 }, // worth 50 -> -20
        { slug: 'big-android' }, // worth 300, price paid not given
      ],
    });
    expect(status).toBe(200);
    expect(body.items.map((i: any) => [i.slug, i.valueUsd, i.gainUsd])).toEqual([
      ['mid-android', 150, 30],
      ['small-linux', 50, -20],
      ['big-android', 300, null],
    ]);
    expect(body.totals).toEqual({ count: 3, valueUsd: 500, paidUsd: 190, gainUsd: 10 });
  });

  it('flags tracked consoles at or below their target price', async () => {
    const { body } = await summary({
      watchlist: [
        { slug: 'mid-android', targetPriceUsd: 150 }, // exactly at target
        { slug: 'big-android', targetPriceUsd: 250 }, // still above
        { slug: 'small-linux' }, // no target
      ],
    });
    expect(body.watchlist.map((w: any) => [w.slug, w.currentPriceUsd, w.belowTarget])).toEqual([
      ['mid-android', 150, true],
      ['big-android', 300, false],
      ['small-linux', 50, false],
    ]);
    expect(body.alertCount).toBe(1);
  });

  it('skips consoles that no longer exist and rejects bad input', async () => {
    const { body } = await summary({ items: [{ slug: 'gone' }], watchlist: [{ slug: 'gone-too' }] });
    expect(body).toMatchObject({ items: [], watchlist: [], unknownSlugs: ['gone', 'gone-too'] });
    expect((await summary({ items: [{ slug: 'mid-android', paidUsd: -5 }] })).status).toBe(400);
    expect((await summary({})).body.totals.count).toBe(0);
  });
});
