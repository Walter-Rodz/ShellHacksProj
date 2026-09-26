import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { openDb } from '../src/db';
import { importData, type ImportData } from '../src/db/importer';
import { daysAgo } from '../src/lib/pricing';
import { invalidateCatalog } from '../src/services/catalog';

const now = new Date();

const baseSpecs = {
  chip: 'Test SoC',
  ramGb: 1,
  storage: { internalGb: 0, expandable: true },
  weightG: 200,
  dimensionsMm: { w: 100, h: 100, d: 20 },
  controls: {
    dpad: true,
    analogSticks: 0 as const,
    faceButtons: 4,
    shoulders: 'l1r1l2r2' as const,
    rumble: false,
  },
  connectivity: { wifi: true, bluetooth: false, videoOut: 'none' as const, headphoneJack: true },
};

const fixture: ImportData = {
  systems: [
    {
      id: 'gba',
      name: 'Game Boy Advance',
      generation: 6,
      native: { w: 240, h: 160 },
      aspectRatio: '3:2',
      sortOrder: 1,
    },
    { id: 'psp', name: 'PSP', generation: 7, native: { w: 480, h: 272 }, aspectRatio: '16:9', sortOrder: 2 },
    {
      id: 'ps2',
      name: 'PlayStation 2',
      generation: 6,
      native: { w: 640, h: 448 },
      aspectRatio: '4:3',
      sortOrder: 3,
    },
    {
      id: 'psx',
      name: 'PlayStation',
      generation: 5,
      native: { w: 320, h: 240 },
      aspectRatio: '4:3',
      sortOrder: 4,
    },
    {
      id: 'gc',
      name: 'GameCube',
      generation: 6,
      native: { w: 640, h: 480 },
      aspectRatio: '4:3',
      sortOrder: 5,
    },
  ],
  devices: [
    {
      id: 'pocket-43',
      slug: 'pocket-43',
      name: 'Pocket 43',
      brand: 'Alpha',
      category: 'handheld',
      formFactor: 'vertical',
      releaseDate: '2024-01-01',
      msrpUsd: 60,
      popularity: 90,
      aliases: ['p43'],
      specs: {
        ...baseSpecs,
        screen: {
          sizeIn: 3.5,
          resolution: { w: 640, h: 480 },
          panel: 'ips',
          aspectRatio: '4:3',
          touch: false,
        },
      },
      os: [
        { id: 'linux_stock', name: 'Stock Linux', kind: 'stock' },
        { id: 'knulli', name: 'Knulli', kind: 'custom' },
      ],
      emulation: { gba: 'great', psp: 'playable', ps2: 'unplayable', psx: 'good' },
    },
    {
      id: 'clam-32',
      slug: 'clam-32',
      name: 'Clam 32',
      brand: 'Alpha',
      category: 'handheld',
      formFactor: 'clamshell',
      releaseDate: '2025-03-01',
      msrpUsd: 70,
      popularity: 70,
      specs: {
        ...baseSpecs,
        screen: {
          sizeIn: 3.4,
          resolution: { w: 720, h: 480 },
          panel: 'ips',
          aspectRatio: '3:2',
          touch: false,
        },
      },
      os: [{ id: 'knulli', name: 'Knulli', kind: 'custom' }],
      emulation: { gba: 'great', psp: 'playable', ps2: 'unplayable', psx: 'good' },
    },
    {
      id: 'beast-169',
      slug: 'beast-169',
      name: 'Beast 16:9',
      brand: 'Beta',
      category: 'handheld',
      formFactor: 'horizontal',
      releaseDate: '2025-06-01',
      msrpUsd: 300,
      popularity: 80,
      specs: {
        ...baseSpecs,
        chip: 'Big SoC',
        controls: { ...baseSpecs.controls, analogSticks: 2, stickType: 'hall' },
        connectivity: { ...baseSpecs.connectivity, bluetooth: true, videoOut: 'usb_c' },
        batteryLifeHrs: { min: 5, max: 10 },
        screen: {
          sizeIn: 6,
          resolution: { w: 1920, h: 1080 },
          panel: 'amoled',
          aspectRatio: '16:9',
          touch: true,
        },
      },
      os: [{ id: 'android', name: 'Android', kind: 'stock' }],
      emulation: { gba: 'great', psp: 'great', ps2: 'great', psx: 'great', gc: 'great' },
    },
    {
      id: 'box',
      slug: 'box',
      name: 'Retro Box',
      brand: 'Gamma',
      category: 'home',
      formFactor: 'home',
      msrpUsd: 150,
      specs: {
        ...baseSpecs,
        controls: { ...baseSpecs.controls, dpad: false, faceButtons: 0, shoulders: 'none' },
      },
      emulation: { gba: 'great', psp: 'good', ps2: 'good', psx: 'great', gc: 'good' },
    },
  ],
  pricePoints: [
    // pocket-43: steady ~$55, with a $45 listing this week (deal)
    ...[80, 70, 60, 50, 40, 30, 20, 10].map((ago) => ({
      deviceId: 'pocket-43',
      observedAt: daysAgo(now, ago),
      priceUsd: 55,
      condition: 'new' as const,
    })),
    {
      deviceId: 'pocket-43',
      observedAt: daysAgo(now, 2),
      priceUsd: 45,
      condition: 'used' as const,
      source: 'ebay_sold',
    },
    // beast: ~$280
    ...[60, 40, 20, 5].map((ago) => ({
      deviceId: 'beast-169',
      observedAt: daysAgo(now, ago),
      priceUsd: 280,
      condition: 'new' as const,
    })),
    // an old point outside every window except 'all'
    { deviceId: 'beast-169', observedAt: daysAgo(now, 500), priceUsd: 400, condition: 'new' as const },
  ],
  pairs: [{ deviceId: 'pocket-43', pairDeviceId: 'clam-32', reason: 'Pixel-perfect GBA in a clamshell' }],
};

let server: Server;
let base: string;

beforeAll(async () => {
  invalidateCatalog();
  const db = openDb(':memory:');
  importData(db, fixture);
  server = createApp(db).listen(0);
  await new Promise((r) => server.once('listening', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});
afterAll(() => {
  server.close();
});

const get = async (path: string) => {
  const res = await fetch(base + path);
  return { status: res.status, body: await res.json() };
};
const slugs = (items: { slug: string }[]) => items.map((i) => i.slug);

describe('catalog', () => {
  it('lists systems in sort order', async () => {
    const { body } = await get('/systems');
    expect(body.map((s: any) => s.id)).toEqual(['gba', 'psp', 'ps2', 'psx', 'gc']);
  });

  it('lists devices by popularity with facets', async () => {
    const { status, body } = await get('/devices');
    expect(status).toBe(200);
    expect(body.total).toBe(4);
    expect(slugs(body.items)).toEqual(['pocket-43', 'beast-169', 'clam-32', 'box']);
    expect(body.facets.brand).toEqual([
      { value: 'Alpha', count: 2 },
      { value: 'Beta', count: 1 },
      { value: 'Gamma', count: 1 },
    ]);
  });

  it('searches by name and alias', async () => {
    expect(slugs((await get('/devices?q=beast')).body.items)).toEqual(['beast-169']);
    expect(slugs((await get('/devices?q=p43')).body.items)).toEqual(['pocket-43']);
  });

  it('filters and keeps facet counts disjunctive', async () => {
    const { body } = await get('/devices?formFactor=vertical,clamshell&os=knulli');
    expect(slugs(body.items).sort()).toEqual(['clam-32', 'pocket-43']);
    // formFactor facet ignores the formFactor filter but still applies os=knulli
    expect(body.facets.formFactor).toEqual([
      { value: 'clamshell', count: 1 },
      { value: 'vertical', count: 1 },
    ]);
  });

  it('filters by controls, connectivity, battery and emulation', async () => {
    expect(slugs((await get('/devices?sticks=2&hallSticks=true')).body.items)).toEqual(['beast-169']);
    expect(slugs((await get('/devices?videoOut=true')).body.items)).toEqual(['beast-169']);
    expect(slugs((await get('/devices?batteryMin=8')).body.items)).toEqual(['beast-169']);
    expect(slugs((await get('/devices?playsWell=psp,ps2&sort=name')).body.items)).toEqual([
      'beast-169',
      'box',
    ]);
  });

  it('filters by emulation tier, and always lists all four tiers', async () => {
    const { body } = await get('/devices?tier=ps2_gc');
    expect(slugs(body.items).sort()).toEqual(['beast-169', 'box']);
    // Counts ignore the tier filter itself; tiers with no devices still appear
    expect(body.facets.tier).toEqual([
      { value: 'ps1', label: 'PS1', count: 4 },
      { value: 'n64', label: 'N64', count: 0 },
      { value: 'ps2_gc', label: 'PS2/GC', count: 2 },
      { value: 'switch', label: 'Switch', count: 0 },
    ]);
    // Several tiers = devices in ANY of them
    expect(slugs((await get('/devices?tier=ps2_gc,switch')).body.items)).toHaveLength(2);
  });

  it('filters by screen fit', async () => {
    // Only the 720x480 clamshell integer-scales GBA perfectly
    expect(slugs((await get('/devices?fitFor=gba&fitMin=perfect')).body.items)).toEqual(['clam-32']);
  });

  it('filters and sorts by starting price (lowest in 30 days, falling back to MSRP)', async () => {
    const { body } = await get('/devices?sort=price_asc');
    expect(slugs(body.items)).toEqual(['pocket-43', 'clam-32', 'box', 'beast-169']);
    expect(body.items[0].startingPriceUsd).toBe(45);
    expect(body.items[1].startingPriceUsd).toBe(70); // no price data -> MSRP
    expect(slugs((await get('/devices?priceMax=100')).body.items).sort()).toEqual(['clam-32', 'pocket-43']);
  });

  it('paginates', async () => {
    const { body } = await get('/devices?pageSize=3&page=2');
    expect(body).toMatchObject({ page: 2, pageSize: 3, total: 4 });
    expect(body.items).toHaveLength(1);
  });

  it('rejects bad query params', async () => {
    const { status, body } = await get('/devices?sort=cheapest');
    expect(status).toBe(400);
    expect(body.error.code).toBe('bad_request');
  });

  it('returns device detail with screen fit, deal and average price', async () => {
    const { status, body } = await get('/devices/pocket-43');
    expect(status).toBe(200);
    expect(body.os.map((o: any) => o.id)).toEqual(['linux_stock', 'knulli']);
    expect(body.screenFit.find((f: any) => f.systemId === 'gba')).toMatchObject({
      integerScale: 2,
      bucket: 'good',
    });
    expect(body.deal).toMatchObject({ isGoodDeal: true, lowestCurrentUsd: 45 });
    expect(body.price.avgUsd).toBeCloseTo(53.89, 2);
    expect(body.priceChart.length).toBeGreaterThan(0);
  });

  it('builds a readable specs table, skipping unknown values', async () => {
    const { body } = await get('/devices/beast-169');
    const table = Object.fromEntries(body.specTable.map((row: any) => [row.label, row.value]));
    expect(table).toMatchObject({
      Chip: 'Big SoC',
      RAM: '1 GB',
      Screen: '6" AMOLED, 1920×1080 (16:9), touchscreen',
      Controls: '2 analog sticks, hall-effect sticks, L1/R1 + L2/R2',
      Connectivity: 'Wi-Fi, Bluetooth, USB-C video out, 3.5mm headphone jack',
      'Launch price': '$300',
    });
    expect(table.Battery).toBeUndefined(); // no battery info in the fixture
  });

  it('suggests pocket companions for a big device, with a reason and total cost', async () => {
    const { companions } = (await get('/devices/beast-169')).body;
    expect(companions.items.map((c: any) => c.device.slug)).toEqual(['clam-32', 'pocket-43']); // clamshell first
    expect(companions.whyTheyPairWell).toBe(
      'Use the Beast 16:9 for PS2/GameCube at home, and keep the Clam 32 or the Pocket 43 in your pocket for quick GBA sessions on the go.',
    );
    expect(companions.totalCostUsd).toBe(280 + 70 + 45);
  });

  it('suggests a powerful companion for a pocket device, hand-picked pairs first', async () => {
    const { companions } = (await get('/devices/pocket-43')).body;
    expect(companions.items).toHaveLength(2);
    expect(companions.items[0]).toMatchObject({
      device: { slug: 'clam-32' },
      role: 'Pixel-perfect GBA in a clamshell', // hand-picked in the import
    });
    // box and beast cover the same systems; box is cheaper
    expect(companions.items[1].device.slug).toBe('box');
    expect(companions.totalCostUsd).toBe(45 + 70 + 150);
  });

  it('home consoles have no screen fit', async () => {
    expect((await get('/devices/box')).body.screenFit).toEqual([]);
  });

  it('404s unknown devices', async () => {
    const { status, body } = await get('/devices/nope');
    expect(status).toBe(404);
    expect(body.error.code).toBe('not_found');
  });

  it('returns price history by range', async () => {
    const all = (await get('/devices/beast-169/prices?range=all')).body;
    const year = (await get('/devices/beast-169/prices?range=1y')).body;
    expect(all.points).toHaveLength(5);
    expect(year.points).toHaveLength(4);
    expect(year.summary).toMatchObject({ medianUsd: 280, sampleSize: 4 });
    expect(year.weekly.length).toBeGreaterThan(0);
    const used = (await get('/devices/pocket-43/prices?range=90d&condition=used')).body;
    expect(used.points).toHaveLength(1);
    expect(used.summary.avgUsd).toBeNull();
  });

  it('compares devices', async () => {
    const { body } = await get('/compare?ids=pocket-43,beast-169');
    expect(body.map((d: any) => d.slug)).toEqual(['pocket-43', 'beast-169']);
    expect((await get('/compare?ids=pocket-43')).status).toBe(400);
  });
});
