import { describe, expect, it } from 'vitest';
import { openDb } from '../src/db';
import { importData } from '../src/db/importer';

const device = (id: string) => ({
  id,
  slug: id,
  name: id.toUpperCase(),
  brand: 'Test',
  category: 'handheld' as const,
  formFactor: 'vertical' as const,
  specs: { chip: 'X', ramGb: 1, storage: { internalGb: 0, expandable: true } },
});

const deviceIds = (db: ReturnType<typeof openDb>) =>
  (db.prepare('SELECT id FROM devices ORDER BY id').all() as { id: string }[]).map((row) => row.id);

describe('importData', () => {
  it('keeps devices missing from the file by default', () => {
    const db = openDb(':memory:');
    importData(db, { devices: [device('a'), device('b')] });
    importData(db, { devices: [device('a')] });
    expect(deviceIds(db)).toEqual(['a', 'b']);
  });

  it('removes devices missing from the file when it is the whole catalog', () => {
    const db = openDb(':memory:');
    importData(db, {
      devices: [device('a'), device('b')],
      pricePoints: [{ deviceId: 'b', observedAt: '2026-01-01', priceUsd: 50, condition: 'new' }],
    });

    const result = importData(db, { removeDevicesNotListed: true, devices: [device('a')] });

    expect(result.removedDevices).toEqual(['B']);
    expect(deviceIds(db)).toEqual(['a']);
    // Its prices went with it
    expect(db.prepare('SELECT COUNT(*) AS n FROM price_points').get()).toEqual({ n: 0 });
  });

  it('writes nothing when any record is invalid', () => {
    const db = openDb(':memory:');
    expect(() =>
      importData(db, { devices: [device('a'), { ...device('b'), formFactor: 'round' }] }),
    ).toThrow();
    expect(deviceIds(db)).toEqual([]);
  });
});
