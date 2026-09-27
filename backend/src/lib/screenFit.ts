import type { EmulatedSystem, ScreenFit, ScreenFitBucket, ScreenSpec } from '../types';

const round3 = (n: number) => Math.round(n * 1000) / 1000;

/**
 * How well a w×h native image fills a W×H screen.
 * - integer scaling: pixel-perfect, may leave borders
 * - aspect fit: fills more of the screen but scales by a non-integer factor (penalised by 0.85)
 */
export function fitOnScreen(W: number, H: number, w: number, h: number) {
  const integerScale = Math.min(Math.floor(W / w), Math.floor(H / h));
  const integerCoverage = (integerScale * w * integerScale * h) / (W * H);
  const aspectFit = Math.min(W / w, H / h);
  const aspectCoverage = (aspectFit * w * aspectFit * h) / (W * H);
  const score = Math.round(100 * Math.max(integerCoverage, aspectCoverage * 0.85));
  let bucket: ScreenFitBucket;
  if (score >= 95 && integerCoverage >= 0.95) bucket = 'perfect';
  else if (score >= 85) bucket = 'great';
  else if (score >= 70) bucket = 'good';
  else bucket = 'borders';
  return {
    integerScale,
    integerCoverage: round3(integerCoverage),
    aspectCoverage: round3(aspectCoverage),
    score,
    bucket,
  };
}

/**
 * Screen fit for one system. Dual-screen systems (DS/3DS) use the device's second screen when it has one
 * (scored on the worse of the two), otherwise the main screen split in half top/bottom.
 */
export function screenFitFor(screen: ScreenSpec, system: EmulatedSystem): ScreenFit {
  const { w, h } = system.native;
  let fit;
  if (system.dualScreen && screen.secondary) {
    const a = fitOnScreen(screen.resolution.w, screen.resolution.h, w, h);
    const b = fitOnScreen(screen.secondary.resolution.w, screen.secondary.resolution.h, w, h);
    fit = a.score <= b.score ? a : b;
  } else if (system.dualScreen) {
    fit = fitOnScreen(screen.resolution.w, Math.floor(screen.resolution.h / 2), w, h);
  } else {
    fit = fitOnScreen(screen.resolution.w, screen.resolution.h, w, h);
  }
  return { systemId: system.id, ...fit };
}

export function screenFitAll(screen: ScreenSpec | undefined, systems: EmulatedSystem[]): ScreenFit[] {
  if (!screen) return [];
  return systems.map((s) => screenFitFor(screen, s));
}
