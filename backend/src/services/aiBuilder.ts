import { z } from 'zod';
import { askGeminiForJson } from '../lib/gemini';
import type { DeviceCard } from '../types';
import { playsAtLeast, type Catalog, type CatalogDevice } from './catalog';
import { EMULATION_TIERS, searchDevices, type DeviceQuery } from './search';

/*
 * The AI Builder: the frontend asks 4 questions and sends the answers as
 *   { "price": "310", "screen": "compact", "os": "linux", "battery": "long" }
 * The answers become normal search filters (no AI needed for that). Gemini then ranks the matching consoles and
 * explains each pick in plain language. Without Gemini (no key, overloaded, bad reply) a rule-based ranking and
 * written-from-specs explanations are used instead, so the feature always works.
 */

const MAX_PICKS = 3;
/** How many matches Gemini gets to choose from (best by the rules first) */
const MAX_CANDIDATES_FOR_AI = 20;

/* ------------------------------------------------------------------ answers -> filters */

export const aiBuilderAnswersSchema = z.object({
  /** Highest price the user wants to pay, in USD (the frontend's slider value) */
  price: z.coerce.number().min(0).optional(),
  screen: z.enum(['compact', 'medium', 'large', '']).optional(),
  os: z.enum(['linux', 'android', 'any', '']).optional(),
  battery: z.enum(['long', 'standard', '']).optional(),
});

export type AiBuilderAnswers = z.infer<typeof aiBuilderAnswersSchema>;

/** Linux-based systems, so "Linux" also finds devices that ship with a custom Linux like ArkOS or Onion */
const LINUX_FAMILY = ['linux', 'arkos', 'onion', 'batocera', 'knulli', 'muos', 'rocknix', 'minui', 'spruce'];

/** Each answer as the filters it stands for. Answers left blank (or "any"/"standard") add no filter. */
function filtersFor(answers: AiBuilderAnswers) {
  return {
    price: answers.price !== undefined ? { priceMax: answers.price } : {},
    screen: {
      compact: { screenMax: 3.99 }, // under 4"
      medium: { screenMin: 4, screenMax: 5.5 },
      large: { screenMin: 5.51 }, // the frontend says 6"+; nothing sits between 5.5" and 6" today
      '': {},
    }[answers.screen ?? ''],
    os: { linux: { os: LINUX_FAMILY }, android: { os: ['android'] }, any: {}, '': {} }[answers.os ?? ''],
    battery: answers.battery === 'long' ? { batteryMahMin: 5000 } : {},
  };
}

type Preference = keyof ReturnType<typeof filtersFor>;

/** When nothing matches, preferences are dropped in this order (least important first) */
const RELAX_ORDER: Preference[] = ['battery', 'screen', 'os', 'price'];

/* ------------------------------------------------------------------ main entry */

export interface AiBuilderPick {
  device: DeviceCard;
  rank: number;
  /** Why this console fits the answers, in plain language */
  reason: string;
}

export interface AiBuilderResult {
  /** The filters the answers turned into (after any relaxing) */
  filters: Partial<DeviceQuery>;
  /** Preferences that had to be dropped because nothing matched all of them, e.g. ["battery"] */
  relaxed: Preference[];
  /** How many consoles matched the (relaxed) filters */
  matchCount: number;
  /** The top picks, each with a reason */
  picks: AiBuilderPick[];
  /** Every matching console, best first: the picks, then the rest (most capable, then cheapest) */
  matches: DeviceCard[];
  /** One or two sentences about the picks as a group; null when there are no picks */
  summary: string | null;
  /** Who ranked and explained the picks */
  rankedBy: 'gemini' | 'rules';
}

export async function runAiBuilder(catalog: Catalog, answers: AiBuilderAnswers): Promise<AiBuilderResult> {
  const found = findMatches(catalog, answers);
  const ranked = [...found.matches].sort(byRules);
  const base = { filters: found.filters, relaxed: found.relaxed, matchCount: ranked.length };

  if (ranked.length > 0) {
    const fromGemini = await rankWithGemini(ranked.slice(0, MAX_CANDIDATES_FOR_AI), answers, found.relaxed);
    if (fromGemini) {
      return { ...base, ...fromGemini, matches: picksFirst(fromGemini.picks, ranked), rankedBy: 'gemini' };
    }
  }

  const picks = ranked.slice(0, MAX_PICKS).map((device, i) => ({
    device: device.card,
    rank: i + 1,
    reason: reasonFromSpecs(device),
  }));
  return {
    ...base,
    picks,
    matches: picksFirst(picks, ranked),
    summary: picks.length > 0 ? summaryFromRules(picks.length, found.relaxed) : null,
    rankedBy: 'rules',
  };
}

/** All matches as cards: the picks in their order, then everything else in rule order */
function picksFirst(picks: AiBuilderPick[], ranked: CatalogDevice[]): DeviceCard[] {
  const pickedIds = new Set(picks.map((pick) => pick.device.id));
  return [
    ...picks.map((pick) => pick.device),
    ...ranked.filter((d) => !pickedIds.has(d.card.id)).map((d) => d.card),
  ];
}

/** Searches with every preference, dropping the least important ones until something matches */
function findMatches(catalog: Catalog, answers: AiBuilderAnswers) {
  const byPreference = filtersFor(answers);
  const relaxed: Preference[] = [];

  for (let dropped = 0; dropped <= RELAX_ORDER.length; dropped++) {
    const active = RELAX_ORDER.filter((pref) => !relaxed.includes(pref));
    const filters: Partial<DeviceQuery> = Object.assign({}, ...active.map((pref) => byPreference[pref]));
    const { total } = searchDevices(catalog, { ...filters, page: 1, pageSize: 1 } as DeviceQuery);
    if (total > 0 || dropped === RELAX_ORDER.length) {
      const all = searchDevices(catalog, { ...filters, page: 1, pageSize: 60 } as DeviceQuery).items;
      const matches = all.map((card) => catalog.byId.get(card.id)!);
      return { matches, filters, relaxed };
    }
    // Drop the next preference the user actually set
    const next = RELAX_ORDER.find(
      (pref) => !relaxed.includes(pref) && Object.keys(byPreference[pref]).length > 0,
    );
    if (!next) break;
    relaxed.push(next);
  }
  return { matches: [], filters: {}, relaxed };
}

/* ------------------------------------------------------------------ rule-based ranking */

/** Index of the hardest emulation tier a device handles (-1 = none of them) */
function tierLevel(device: CatalogDevice) {
  let level = -1;
  EMULATION_TIERS.forEach((tier, i) => {
    if (tier.systems.every((id) => playsAtLeast(device.ratingBySystem.get(id), 'good'))) level = i;
  });
  return level;
}

/** Most capable first; among equals, cheapest first */
function byRules(a: CatalogDevice, b: CatalogDevice) {
  const price = (d: CatalogDevice) => d.card.startingPriceUsd ?? Infinity;
  return tierLevel(b) - tierLevel(a) || price(a) - price(b) || a.card.name.localeCompare(b.card.name);
}

/** e.g. "$189, 5.5" screen, Android 13, 5000 mAh battery. Plays up to PS2/GC." */
function reasonFromSpecs(device: CatalogDevice) {
  const { card, specs, os } = device;
  const parts = [
    card.startingPriceUsd !== null && `$${card.startingPriceUsd}`,
    card.screenSizeIn !== null && `${card.screenSizeIn}" screen`,
    os[0]?.name,
    specs.batteryMah && `${specs.batteryMah} mAh battery`,
  ].filter(Boolean);
  const level = tierLevel(device);
  const plays = level >= 0 ? ` Plays up to ${EMULATION_TIERS[level].label}.` : '';
  return `${parts.join(', ')}.${plays}`;
}

function summaryFromRules(count: number, relaxed: Preference[]) {
  const note =
    relaxed.length > 0
      ? ` Nothing matched every answer, so your ${relaxed.join(' and ')} preference was loosened.`
      : '';
  return `The ${count === 1 ? 'best match' : `top ${count} matches`}, most capable first, then cheapest.${note}`;
}

/* ------------------------------------------------------------------ Gemini ranking */

const geminiReplySchema = z.object({
  picks: z.array(z.object({ id: z.string(), reason: z.string().min(1) })).min(1),
  summary: z.string().optional(),
});

/** Asks Gemini to pick and explain the best matches. Returns null if Gemini isn't available or replies badly. */
async function rankWithGemini(
  candidates: CatalogDevice[],
  answers: AiBuilderAnswers,
  relaxed: Preference[],
): Promise<Pick<AiBuilderResult, 'picks' | 'summary'> | null> {
  const byId = new Map(candidates.map((d) => [d.card.id, d]));

  const prompt = JSON.stringify({
    userAnswers: {
      maxPriceUsd: answers.price ?? 'no limit',
      screenSize: answers.screen || 'no preference',
      operatingSystem: answers.os || 'no preference',
      battery: answers.battery === 'long' ? 'wants a long-lasting battery' : 'standard is fine',
      loosenedBecauseNothingMatched: relaxed,
    },
    candidates: candidates.map(describeForAi),
  });

  const systemInstruction = `You help retro gaming fans choose a handheld console.
You get the user's answers and a list of candidate consoles that already match them.
Pick the ${MAX_PICKS} best candidates for this user (fewer if there are fewer candidates), best first.
Use ONLY ids from the candidate list. Use ONLY facts given in the candidate data; never invent specs or prices.
For each pick write one friendly sentence (max 25 words) saying why it suits this user.
Also write a one-sentence "summary" of the picks as a group. If some answers were loosened, mention it kindly.
Reply with JSON only: {"picks":[{"id":"...","reason":"..."}],"summary":"..."}`;

  const reply = await askGeminiForJson({
    label: 'AI Builder',
    systemInstruction,
    contents: prompt,
    schema: geminiReplySchema,
  });
  if (!reply) return null;

  // Keep only picks that are real candidates, once each
  const seen = new Set<string>();
  const picks = reply.picks
    .filter((pick) => byId.has(pick.id) && !seen.has(pick.id) && seen.add(pick.id))
    .slice(0, MAX_PICKS)
    .map((pick, i) => ({ device: byId.get(pick.id)!.card, rank: i + 1, reason: pick.reason.trim() }));
  if (picks.length === 0) return null;

  return { picks, summary: reply.summary?.trim() || null };
}

/** The facts Gemini sees for one candidate */
function describeForAi(device: CatalogDevice) {
  const { card, specs, os } = device;
  const level = tierLevel(device);
  return {
    id: card.id,
    name: card.name,
    brand: card.brand,
    priceUsd: card.startingPriceUsd,
    formFactor: card.formFactor,
    screenInches: card.screenSizeIn,
    screenPanel: specs.screen?.panel,
    os: os.map((option) => option.name),
    batteryMah: specs.batteryMah,
    batteryHours: specs.batteryLifeHrs,
    ramGb: specs.ramGb,
    playsUpTo: level >= 0 ? EMULATION_TIERS[level].label : 'retro systems only',
    features: specs.features,
  };
}
