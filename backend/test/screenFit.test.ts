import { describe, expect, it } from 'vitest';
import { fitOnScreen, screenFitFor } from '../src/lib/screenFit';
import type { EmulatedSystem, ScreenSpec } from '../src/types';

// Reference table from docs/PLAN.md §3
describe('fitOnScreen', () => {
  it.each([
    [640, 480, 240, 160, 2, 0.5, 0.889],
    [640, 480, 160, 144, 3, 0.675, 0.833],
    [720, 720, 240, 160, 3, 0.667, 0.667],
    [960, 544, 480, 272, 2, 1, 1],
  ])('%ix%i screen, %ix%i system', (W, H, w, h, scale, intCov, aspCov) => {
    const f = fitOnScreen(W, H, w, h);
    expect(f.integerScale).toBe(scale);
    expect(f.integerCoverage).toBeCloseTo(intCov, 3);
    expect(f.aspectCoverage).toBeCloseTo(aspCov, 3);
  });

  it('buckets', () => {
    expect(fitOnScreen(960, 544, 480, 272).bucket).toBe('perfect');
    expect(fitOnScreen(640, 480, 240, 160)).toMatchObject({ score: 76, bucket: 'good' });
    expect(fitOnScreen(720, 720, 240, 160).bucket).toBe('borders');
    // 720x480 is exactly 3x GBA
    expect(fitOnScreen(720, 480, 240, 160).bucket).toBe('perfect');
  });

  it('returns scale 0 when the screen is smaller than the native image', () => {
    expect(fitOnScreen(320, 240, 640, 480).integerScale).toBe(0);
  });
});

describe('screenFitFor dual-screen systems', () => {
  const nds: EmulatedSystem = {
    id: 'nds',
    name: 'DS',
    generation: 7,
    native: { w: 256, h: 192 },
    aspectRatio: '4:3',
    dualScreen: true,
    sortOrder: 1,
  };
  const base: ScreenSpec = {
    sizeIn: 3.5,
    resolution: { w: 640, h: 480 },
    panel: 'ips',
    aspectRatio: '4:3',
    touch: false,
  };

  it('splits a single screen in half', () => {
    // 640x240 half-screen: integer 1x (256x192) covers 32%
    expect(screenFitFor(base, nds).integerScale).toBe(1);
  });

  it('uses the worse of two screens when the device has a second one', () => {
    const dual: ScreenSpec = {
      ...base,
      resolution: { w: 768, h: 576 },
      secondary: { ...base, resolution: { w: 256, h: 192 } },
    };
    const fit = screenFitFor(dual, nds);
    expect(fit.integerScale).toBe(3); // min(768/256, 576/192) = 3 on the top screen
    expect(fit.bucket).toBe('perfect');
  });
});
