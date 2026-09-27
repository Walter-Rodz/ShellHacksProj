// Talks to the backend. Its address comes from NEXT_PUBLIC_API_URL (set in .env.local), e.g. http://localhost:4000
import { consoleImage } from "./consoleImages";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:4000";

/** The console shape the collection page renders (one row per spec in the details panel) */
export type ConsoleItem = {
  id: string;
  name: string;
  image?: string;
  a?: string;
  b?: string;
  screenSize: string;
  cpu: string;
  gpu: string;
  ram: string;
  storage: string;
  system: string;
  games: string;
  speaker: string;
  tfCard: string;
  battery: string;
  charger: string;
  /** null = no price known */
  price: number | null;
};

// Only the backend fields this page uses (the full shapes are in the backend's src/types.ts)
type DeviceCard = { id: string; slug: string; name: string; startingPriceUsd: number | null };
type DeviceDetail = DeviceCard & {
  specTable: { label: string; value: string }[];
  specs: {
    cpu?: string;
    chip?: string;
    gpu?: string;
    storage?: { expandable?: boolean; note?: string };
    screen?: { sizeIn: number; secondary?: unknown };
    batteryMah?: number;
    speakers?: string;
    charging?: string;
  };
  os: { name: string }[];
  emulation: { systemId: string; rating: string }[];
};

export type AiBuilderAnswers = { price: string; screen: string; os: string; battery: string };
export type AiBuilderResult = {
  picks: { device: DeviceCard; rank: number; reason: string }[];
  summary: string | null;
  matchCount: number;
  /** Every matching console, best first (the picks come first) */
  matches: DeviceCard[];
  relaxed: string[];
  rankedBy: "gemini" | "rules";
};

async function getJson<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, init);
  if (!res.ok) throw new Error(`Backend returned ${res.status} for ${path}`);
  return res.json() as Promise<T>;
}

/** Systems shown in the "Games" filter, easiest to hardest, with the names people know */
const GAME_SYSTEMS: [string, string][] = [
  ["gb", "GB"],
  ["gba", "GBA"],
  ["snes", "SNES"],
  ["psx", "PS1"],
  ["n64", "N64"],
  ["nds", "NDS"],
  ["psp", "PSP"],
  ["dc", "Dreamcast"],
  ["gc", "GameCube"],
  ["ps2", "PS2"],
  ["3ds", "3DS"],
  ["vita", "Vita"],
  ["switch", "Switch"],
];

function toConsoleItem(d: DeviceDetail): ConsoleItem {
  const row = (label: string) => d.specTable.find((r) => r.label === label)?.value;
  const playsWell = new Set(
    d.emulation.filter((e) => e.rating === "great" || e.rating === "good").map((e) => e.systemId),
  );
  const screen = d.specs.screen;
  return {
    id: d.slug,
    name: d.name,
    image: consoleImage(d.slug),
    screenSize: screen ? `${screen.sizeIn}"${screen.secondary ? " Dual Screen" : ""}` : "Unknown",
    cpu: d.specs.cpu ?? d.specs.chip ?? "Unknown",
    gpu: d.specs.gpu ?? "Unknown",
    ram: row("RAM") ?? "Unknown",
    storage: d.specs.storage?.note ?? row("Storage") ?? "Unknown",
    system: d.os.map((o) => o.name).join(" / ") || "Unknown",
    games: GAME_SYSTEMS.filter(([id]) => playsWell.has(id)).map(([, label]) => label).join(", ") || "Unknown",
    speaker: d.specs.speakers ?? "Unknown",
    tfCard: d.specs.storage?.expandable ? "MicroSD slot" : "No card slot",
    battery: d.specs.batteryMah ? `${d.specs.batteryMah}mAh` : "Unknown",
    charger: d.specs.charging ?? "Unknown",
    price: d.startingPriceUsd,
  };
}

/** Every console in the catalog, with full specs, cheapest first */
export async function fetchConsoles(): Promise<ConsoleItem[]> {
  const list = await getJson<{ items: DeviceCard[] }>("/api/devices?pageSize=60&sort=price_asc");
  const details = await Promise.all(
    list.items.map((card) => getJson<DeviceDetail>(`/api/devices/${encodeURIComponent(card.slug)}`)),
  );
  return details.map(toConsoleItem);
}

/** Sends the AI Builder's answers; returns the top picks with a reason for each */
export function fetchAiBuilderPicks(answers: AiBuilderAnswers): Promise<AiBuilderResult> {
  return getJson<AiBuilderResult>("/api/ai-builder", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(answers),
  });
}

export type ChatMessage = { role: "user" | "assistant"; content: string };
export type ChatReply = {
  reply: string;
  /** Consoles recommended in this reply (0–3) */
  consoles: DeviceCard[];
  answeredBy: "gemini" | "unavailable";
};

/** Sends the whole conversation (oldest first, ending with the user's new message) and returns the AI's reply */
export function sendChat(messages: ChatMessage[]): Promise<ChatReply> {
  return getJson<ChatReply>("/api/ai/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages }),
  });
}

export type CollectionSummary = {
  items: { slug: string; device: DeviceCard; paidUsd: number | null; valueUsd: number | null; gainUsd: number | null }[];
  totals: { count: number; valueUsd: number; paidUsd: number; gainUsd: number };
  watchlist: {
    slug: string;
    device: DeviceCard;
    targetPriceUsd: number | null;
    currentPriceUsd: number | null;
    belowTarget: boolean;
    trend: "up" | "down" | "flat" | "unknown";
    trendPct: number | null;
    isGoodDeal: boolean;
  }[];
  alertCount: number;
  unknownSlugs: string[];
};

/** Today's values, totals and price alerts for the user's saved collection and watchlist */
export function fetchCollectionSummary(
  items: { slug: string; paidUsd: number | null }[],
  watchlist: { slug: string; targetPriceUsd: number | null }[],
): Promise<CollectionSummary> {
  return getJson<CollectionSummary>("/api/collection/summary", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items, watchlist }),
  });
}
