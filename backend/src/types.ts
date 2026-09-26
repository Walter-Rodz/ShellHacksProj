// Every shape the API returns. The frontend can copy this file as-is: it has no imports.

export type DeviceCategory = 'handheld' | 'home';
export type FormFactor = 'vertical' | 'horizontal' | 'clamshell' | 'home';
export type DeviceStatus = 'available' | 'discontinued' | 'upcoming';
export type PanelType = 'ips' | 'oled' | 'amoled' | 'lcd' | 'tn';
export type StickType = 'hall' | 'potentiometer' | 'tmr';
export type CommunityActivity = 'very_active' | 'active' | 'moderate' | 'low';
export type SystemId = string;

export interface Resolution {
  w: number;
  h: number;
}

export interface EmulatedSystem {
  id: SystemId;
  name: string;
  generation: number;
  native: Resolution;
  aspectRatio: string;
  dualScreen: boolean;
  sortOrder: number;
}

export interface ScreenSpec {
  sizeIn: number;
  resolution: Resolution;
  panel: PanelType;
  aspectRatio: string;
  touch: boolean;
  secondary?: Omit<ScreenSpec, 'secondary'>;
}

/** Control/connectivity fields are optional: undefined means "unknown", not "no". */
export interface ControlsSpec {
  dpad?: boolean;
  analogSticks?: 0 | 1 | 2;
  stickType?: StickType;
  faceButtons?: number;
  shoulders?: 'none' | 'l1r1' | 'l1r1l2r2' | 'l1r1_analog_triggers';
  rumble?: boolean;
}

export interface ConnectivitySpec {
  wifi?: boolean;
  bluetooth?: boolean;
  videoOut?: 'none' | 'usb_c' | 'mini_hdmi' | 'hdmi';
  headphoneJack?: boolean;
}

export interface DeviceSpecs {
  chip: string;
  cpu?: string;
  gpu?: string;
  ramGb: number;
  /** note = the original text, e.g. "64GB MicroSD" */
  storage: { internalGb: number; expandable: boolean; note?: string };
  /** Absent for home consoles without a built-in screen */
  screen?: ScreenSpec;
  batteryMah?: number;
  batteryLifeHrs?: { min: number; max: number };
  weightG?: number;
  dimensionsMm?: { w: number; h: number; d: number };
  controls: ControlsSpec;
  connectivity: ConnectivitySpec;
  colors?: string[];
  speakers?: string;
  charging?: string;
  /** Free-text extras, e.g. "Active cooling fan, Hall sticks" */
  features?: string[];
}

export interface OsOption {
  id: string;
  name: string;
  kind: 'stock' | 'custom';
  description?: string;
  url?: string;
}

export type EmulationRatingLevel = 'great' | 'good' | 'playable' | 'poor' | 'unplayable';
export const RATING_ORDER: EmulationRatingLevel[] = ['unplayable', 'poor', 'playable', 'good', 'great'];

export interface EmulationRating {
  systemId: SystemId;
  rating: EmulationRatingLevel;
  notes?: string;
}

export type ScreenFitBucket = 'perfect' | 'great' | 'good' | 'borders';
export const FIT_ORDER: ScreenFitBucket[] = ['borders', 'good', 'great', 'perfect'];

export interface ScreenFit {
  systemId: SystemId;
  integerScale: number;
  integerCoverage: number;
  aspectCoverage: number;
  score: number;
  bucket: ScreenFitBucket;
}

/** One card in the grid */
export interface DeviceCard {
  id: string;
  slug: string;
  name: string;
  brand: string;
  /** Path of the brand's logo, e.g. /uploads/brands/anbernic.png; null = no logo uploaded */
  brandLogoUrl: string | null;
  category: DeviceCategory;
  formFactor: FormFactor;
  /** Path of the cover photo on the backend, e.g. /uploads/devices/rg35xxsp/<id>.png; null = no photo yet */
  imageUrl: string | null;
  releaseDate: string | null;
  status: DeviceStatus;
  /**
   * "From $X" price for the card: the lowest price seen in the last 30 days, or the MSRP when there's no recent
   * price. null = no price known. Price filters and sorting use this number.
   */
  startingPriceUsd: number | null;
  msrpUsd: number | null;
  screenSizeIn: number | null;
  aspectRatio: string | null;
  popularity: number;
}

/** One row of the drawer's two-column specs table */
export interface SpecRow {
  label: string;
  value: string;
}

/** A device suggested to own alongside the one in the drawer */
export interface Companion {
  device: DeviceCard;
  /** What this device is for in the pair, e.g. "Pocket device for GBA on the go" */
  role: string;
}

/** The drawer's companion recommendations: 1–2 devices that complement the one being viewed */
export interface Companions {
  items: Companion[];
  /** The "Why these pair well" text */
  whyTheyPairWell: string;
  /** Price of the viewed device plus every companion; null if any of their prices is unknown */
  totalCostUsd: number | null;
}

export type ItemCondition = 'new' | 'used' | 'refurb';
export type PriceRange = '90d' | '1y' | 'all';

export interface PricePoint {
  observedAt: string;
  priceUsd: number;
  condition: ItemCondition;
  source: string;
  url?: string;
}

export interface PriceSummary {
  avgUsd: number | null;
  medianUsd: number | null;
  lowUsd: number | null;
  highUsd: number | null;
  sampleSize: number;
  /** 30-day median vs the previous 30 days; 'flat' within ±3% */
  trend: 'up' | 'down' | 'flat' | 'unknown';
  trendPct: number | null;
  lastUpdated: string | null;
}

export interface DealFlag {
  /** Lowest listing in the last 7 days is <= 85% of the 90-day median */
  isGoodDeal: boolean;
  lowestCurrentUsd: number | null;
  median90dUsd: number | null;
  percentBelowMedian: number | null;
}

export interface PriceEvent {
  date: string;
  kind: 'drop' | 'spike' | 'release';
  /** Change in the 14-day rolling median; 0 for 'release' */
  changePct: number;
}

export interface PriceHistory {
  deviceId: string;
  range: PriceRange;
  condition: ItemCondition | 'all';
  points: PricePoint[];
  /** Weekly medians, for a smooth line over the raw points */
  weekly: { weekStart: string; medianUsd: number; count: number }[];
  summary: PriceSummary;
  deal: DealFlag;
  events: PriceEvent[];
}

/** Everything the side drawer shows for one device */
export interface DeviceDetail extends DeviceCard {
  summary: string;
  /** All uploaded photos, cover first. `id` is used to delete or re-cover a photo. */
  images: { id: string; url: string }[];
  aliases: string[];
  /** Ready-to-render specs table: only rows with a known value, in display order */
  specTable: SpecRow[];
  /** The raw specs, for anything the table doesn't cover */
  specs: DeviceSpecs;
  os: OsOption[];
  communityActivity: CommunityActivity | null;
  buildQuality: 1 | 2 | 3 | 4 | 5 | null;
  emulation: EmulationRating[];
  screenFit: ScreenFit[];
  /** price.avgUsd is the "Average Current Market Price" */
  price: PriceSummary;
  deal: DealFlag;
  /** Weekly median prices over the last year, for the mini price chart (empty = no price data) */
  priceChart: { weekStart: string; medianUsd: number }[];
  companions: Companions;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
}
/** label = display name when it differs from value (e.g. os 'onion' -> 'Onion OS') */
export interface FacetCount {
  value: string;
  count: number;
  label?: string;
}
export interface DeviceFacets {
  /** Emulation tier pills: PS1, N64, PS2/GC, Switch. `count` = devices that play that tier well */
  tier: FacetCount[];
  category: FacetCount[];
  formFactor: FacetCount[];
  panel: FacetCount[];
  aspect: FacetCount[];
  os: FacetCount[];
  brand: FacetCount[];
  status: FacetCount[];
  /** Bounds for the sliders; null when no device has a price (or screen) */
  priceRange: { min: number; max: number } | null;
  screenRange: { min: number; max: number } | null;
}
export interface DeviceSearchResponse extends Paginated<DeviceCard> {
  facets: DeviceFacets;
}
