import { daysAgo, inWindow, isoDay, round2, weeklyMedians } from '../lib/pricing';
import type { Companion, Companions, DeviceDetail, SpecRow } from '../types';
import { playsAtLeast, type Catalog, type CatalogDevice } from './catalog';

const MAX_COMPANIONS = 2;

/** Short system names for the "why these pair well" text */
const SHORT_NAMES: Record<string, string> = {
  gba: 'GBA',
  psx: 'PS1',
  n64: 'N64',
  saturn: 'Saturn',
  nds: 'DS',
  dc: 'Dreamcast',
  psp: 'PSP',
  gc: 'GameCube',
  ps2: 'PS2',
  wii: 'Wii',
  '3ds': '3DS',
  vita: 'Vita',
  switch: 'Switch',
};

/** Everything the side drawer shows for one device */
export function deviceDetail(catalog: Catalog, device: CatalogDevice): DeviceDetail {
  const lastYear = inWindow(device.prices, daysAgo(new Date(), 365), isoDay(new Date()));
  return {
    ...device.card,
    summary: device.summary,
    aliases: device.aliases,
    specTable: specTable(device),
    specs: device.specs,
    os: device.os,
    communityActivity: device.communityActivity,
    buildQuality: device.buildQuality,
    emulation: device.emulation,
    screenFit: device.screenFit,
    price: device.price,
    deal: device.deal,
    priceChart: weeklyMedians(lastYear).map(({ weekStart, medianUsd }) => ({ weekStart, medianUsd })),
    companions: companionsFor(catalog, device),
  };
}

/* ------------------------------------------------------------------ specs table */

/** The drawer's two-column specs table. Rows whose value is unknown are left out. */
function specTable(device: CatalogDevice): SpecRow[] {
  const { specs } = device;
  const screen = specs.screen;
  const controls = specs.controls ?? {};
  const connectivity = specs.connectivity ?? {};

  const describeScreen = (s: NonNullable<typeof screen>) =>
    `${s.sizeIn}" ${s.panel.toUpperCase()}, ${s.resolution.w}×${s.resolution.h} (${s.aspectRatio})` +
    (s.touch ? ', touchscreen' : '');

  const controlParts = [
    controls.analogSticks !== undefined &&
      `${controls.analogSticks} analog stick${controls.analogSticks === 1 ? '' : 's'}`,
    controls.stickType === 'hall' && 'hall-effect sticks',
    controls.shoulders === 'l1r1l2r2' && 'L1/R1 + L2/R2',
    controls.shoulders === 'l1r1_analog_triggers' && 'L1/R1 + analog triggers',
    controls.shoulders === 'l1r1' && 'L1/R1',
    controls.rumble && 'rumble',
  ];
  const connectivityParts = [
    connectivity.wifi && 'Wi-Fi',
    connectivity.bluetooth && 'Bluetooth',
    connectivity.videoOut === 'mini_hdmi' && 'Mini-HDMI out',
    connectivity.videoOut === 'hdmi' && 'HDMI out',
    connectivity.videoOut === 'usb_c' && 'USB-C video out',
    connectivity.headphoneJack && '3.5mm headphone jack',
  ];

  const rows: [string, string | null | undefined][] = [
    ['Chip', specs.cpu ?? specs.chip],
    ['GPU', specs.gpu],
    ['RAM', specs.ramGb ? formatMemory(specs.ramGb) : null],
    ['Storage', specs.storage?.note ?? (specs.storage ? formatStorage(specs.storage) : null)],
    ['Screen', screen && describeScreen(screen)],
    ['Second screen', screen?.secondary && describeScreen(screen.secondary)],
    ['Battery', formatBattery(specs.batteryMah, specs.batteryLifeHrs)],
    ['Weight', specs.weightG ? `${specs.weightG} g` : null],
    [
      'Size',
      specs.dimensionsMm && `${specs.dimensionsMm.w} × ${specs.dimensionsMm.h} × ${specs.dimensionsMm.d} mm`,
    ],
    ['Controls', joinKnown(controlParts)],
    ['Connectivity', joinKnown(connectivityParts)],
    ['Operating system', joinKnown(device.os.map((os) => os.name))],
    ['Speakers', specs.speakers],
    ['Charging', specs.charging],
    ['Colors', joinKnown(specs.colors ?? [])],
    ['Released', device.card.releaseDate],
    ['Launch price', device.card.msrpUsd !== null ? `$${device.card.msrpUsd}` : null],
  ];
  return rows
    .filter((row): row is [string, string] => Boolean(row[1]))
    .map(([label, value]) => ({ label, value }));
}

function formatMemory(gb: number) {
  return gb < 1 ? `${Math.round(gb * 1024)} MB` : `${gb} GB`;
}

function formatStorage(storage: { internalGb: number; expandable: boolean }) {
  if (storage.internalGb === 0) return storage.expandable ? 'microSD card' : null;
  return `${formatMemory(storage.internalGb)}${storage.expandable ? ' + microSD' : ''}`;
}

function formatBattery(mah?: number, hours?: { min: number; max: number }) {
  if (!mah) return null;
  if (!hours) return `${mah} mAh`;
  const range = hours.min === hours.max ? `${hours.max}` : `${hours.min}–${hours.max}`;
  return `${mah} mAh (about ${range} hours)`;
}

/** Joins the parts that are known (skips false/undefined), or null if none are */
function joinKnown(parts: (string | false | undefined | null)[]) {
  const known = parts.filter((part): part is string => Boolean(part));
  return known.length > 0 ? known.join(', ') : null;
}

/* ------------------------------------------------------------------ companions */

/**
 * The common collector setup is two devices: a big, powerful one for demanding systems at home, and a small one
 * that fits in a pocket for older games on the go. So:
 *   - viewing a pocket device -> suggest powerful devices that play what it can't
 *   - viewing anything else   -> suggest pocket devices (clamshells first)
 * Hand-picked pairs from the database always come first.
 */
function companionsFor(catalog: Catalog, device: CatalogDevice): Companions {
  const curated = (catalog.curatedPairs.get(device.card.id) ?? [])
    .map((pair) => ({ other: catalog.byId.get(pair.pairId), reason: pair.reason }))
    .filter((pair): pair is { other: CatalogDevice; reason: string } => pair.other !== undefined);

  const viewingPocketDevice = isPocketSized(device);
  const suggested = viewingPocketDevice ? powerfulPartners(catalog, device) : pocketPartners(catalog, device);

  const picked = [...curated.map((pair) => pair.other), ...suggested]
    .filter((other, i, all) => other.card.id !== device.card.id && all.indexOf(other) === i)
    .slice(0, MAX_COMPANIONS);

  const items: Companion[] = picked.map((other) => {
    const curatedReason = curated.find((pair) => pair.other === other)?.reason;
    return { device: other.card, role: curatedReason ?? roleOf(other, device) };
  });

  const setup = [device, ...picked];
  const prices = setup.map((d) => d.card.startingPriceUsd);

  return {
    items,
    whyTheyPairWell: items.length > 0 ? whyTheyPairWell(setup) : '',
    totalCostUsd: prices.every((price) => price !== null)
      ? round2(prices.reduce((sum, price) => sum + price!, 0))
      : null,
  };
}

/** Clamshells and verticals with a screen of 3.6" or less */
function isPocketSized(device: CatalogDevice) {
  const pocketShape = device.card.formFactor === 'clamshell' || device.card.formFactor === 'vertical';
  return pocketShape && (device.card.screenSizeIn ?? Infinity) <= 3.6;
}

/** Systems a device plays at least "good", newest (most demanding) first */
function strongSystems(catalog: Catalog, device: CatalogDevice) {
  return catalog.systems
    .filter((system) => playsAtLeast(device.ratingBySystem.get(system.id), 'good'))
    .map((system) => system.id)
    .reverse();
}

/** Pocket devices that play GBA well: clamshells first, then cheapest, then most popular */
function pocketPartners(catalog: Catalog, device: CatalogDevice) {
  return catalog.devices
    .filter(
      (other) =>
        other.card.id !== device.card.id &&
        other.card.status !== 'upcoming' &&
        isPocketSized(other) &&
        playsAtLeast(other.ratingBySystem.get('gba'), 'good'),
    )
    .sort(
      (a, b) =>
        Number(b.card.formFactor === 'clamshell') - Number(a.card.formFactor === 'clamshell') ||
        comparePrice(a, b) ||
        b.card.popularity - a.card.popularity,
    );
}

/** Bigger devices that play the systems this one can't: most extra systems first, then cheapest */
function powerfulPartners(catalog: Catalog, device: CatalogDevice) {
  const alreadyPlays = new Set(strongSystems(catalog, device));
  const extraSystems = (other: CatalogDevice) =>
    strongSystems(catalog, other).filter((id) => !alreadyPlays.has(id)).length;

  return catalog.devices
    .filter(
      (other) =>
        other.card.id !== device.card.id &&
        other.card.status !== 'upcoming' &&
        !isPocketSized(other) &&
        extraSystems(other) > 0,
    )
    .sort(
      (a, b) =>
        extraSystems(b) - extraSystems(a) || comparePrice(a, b) || b.card.popularity - a.card.popularity,
    );
}

/** Cheapest first; unknown prices last */
function comparePrice(a: CatalogDevice, b: CatalogDevice) {
  const priceA = a.card.startingPriceUsd ?? Infinity;
  const priceB = b.card.startingPriceUsd ?? Infinity;
  return priceA === priceB ? 0 : priceA - priceB;
}

function roleOf(companion: CatalogDevice, viewed: CatalogDevice) {
  if (isPocketSized(companion)) {
    return `Pocket-sized ${companion.card.formFactor} for GBA and retro games on the go`;
  }
  return `Plays ${systemList(newSystems(companion, viewed))} for home sessions`;
}

/** Up to two of the most demanding systems `big` plays well that `small` doesn't */
function newSystems(big: CatalogDevice, small: CatalogDevice) {
  const order = [...Object.keys(SHORT_NAMES)].reverse();
  return order
    .filter(
      (id) =>
        playsAtLeast(big.ratingBySystem.get(id), 'good') &&
        !playsAtLeast(small.ratingBySystem.get(id), 'good'),
    )
    .slice(0, 2);
}

/**
 * e.g. "Use the Retroid Pocket 5 for PS2/GameCube at home, and keep the Miyoo Mini Flip or the RG35XXSP in your
 * pocket for quick GBA sessions on the go."
 */
function whyTheyPairWell(setup: CatalogDevice[]) {
  const names = (devices: CatalogDevice[]) => devices.map((d) => `the ${d.card.name}`).join(' or ');
  const home = setup.filter((d) => !isPocketSized(d));
  const pocket = setup.filter(isPocketSized);

  if (home.length === 0) {
    return `Keep ${names(pocket)} in your pocket for quick GBA and retro sessions on the go.`;
  }
  const demanding = pocket.length > 0 ? newSystems(home[0], pocket[0]) : [];
  const homeUse =
    demanding.length > 0 ? `for ${systemList(demanding)} at home` : 'at home on a bigger screen';
  if (pocket.length === 0) return `Use ${names(home)} ${homeUse}.`;
  return `Use ${names(home)} ${homeUse}, and keep ${names(pocket)} in your pocket for quick GBA sessions on the go.`;
}

function systemList(ids: string[]) {
  return ids.map((id) => SHORT_NAMES[id] ?? id).join('/') || 'more demanding systems';
}
