"use client";
 
import { useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
 
type ConsoleItem = {
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
  price: number;
};
 
const consoles: ConsoleItem[] = [
  {
    id: "anbernic-rg-ds",
    name: "ANBERNIC RG-DS",
    image: "/images/consoles/anbernic-rg-ds.png",
    screenSize: '4" Dual Screen',
    cpu: "RK3568 Quad-core 64-bit Cortex-A55",
    gpu: "ARM G52 2EE",
    ram: "3GB",
    storage: "32GB",
    system: "Linux / Android",
    games: "GBA, NDS, PS1",
    speaker: "Dual Stereo",
    tfCard: "Dual TF Slots",
    battery: "4000mAh",
    charger: "5V/2A",
    price: 199,
  },
  {
    id: "odin-3-pro",
    name: "Odin 3 Pro",
    image: "/images/consoles/odin-3-pro.png",
    screenSize: '6.0"',
    cpu: "Snapdragon 8 Gen 3",
    gpu: "Adreno 750",
    ram: "16GB",
    storage: "512GB",
    system: "Android 14",
    games: "PS2, GameCube, Switch",
    speaker: "Stereo",
    tfCard: "MicroSD",
    battery: "8000mAh",
    charger: "65W Quick Charge",
    price: 499,
  },
  {
    id: "miyoo-flip",
    name: "Miyoo Flip",
    image: "/images/consoles/miyoo-flip.png",
    screenSize: '3.5" 640x480',
    cpu: "RK3566 Quad-Core 1.8GHz",
    gpu: "Mali-G52",
    ram: "1GB",
    storage: "64GB",
    system: "Linux",
    games: "GB, GBC, GBA, SNES, PS1, N64, Dreamcast, PSP",
    speaker: "Stereo",
    tfCard: "Dual MicroSD Slots",
    battery: "3000mAh",
    charger: "USB-C",
    price: 149,
  },
  {
    id: "retroid-pocket-5",
    name: "Retroid Pocket 5",
    image: "/images/consoles/retroid-pocket-5.png",
    screenSize: '5.5"',
    cpu: "Snapdragon 865",
    gpu: "Adreno 650",
    ram: "8GB",
    storage: "128GB",
    system: "Android 13",
    games: "PS2, GameCube, N64, Wii, Switch, 3DS",
    speaker: "Stereo",
    tfCard: "MicroSD",
    battery: "6000mAh",
    charger: "USB-C",
    price: 299,
  },
  {
    id: "rg35xx-plus",
    name: "Anbernic RG35XX Plus",
    image: "/images/consoles/rg35xx-plus.png",
    screenSize: '3.5"',
    cpu: "H700 Quad-core ARM",
    gpu: "Mali-G31",
    ram: "1GB",
    storage: "64GB",
    system: "Linux",
    games: "GBA, PS1, SNES",
    speaker: "Mono",
    tfCard: "Dual TF Slots",
    battery: "3500mAh",
    charger: "USB-C",
    price: 129,
  },
  {
    id: "rgb30",
    name: "Powkiddy RGB30",
    image: "/images/consoles/rgb30.png",
    screenSize: '4.0"',
    cpu: "RK3566",
    gpu: "Mali-G52",
    ram: "4GB",
    storage: "18GB",
    system: "Linux / Android",
    games: "PS1, N64, Dreamcast",
    speaker: "Dual Stereo",
    tfCard: "Dual TF Slots",
    battery: "4100mAh",
    charger: "USB-C",
    price: 179,
  },
  {
    id: "odin-2",
    name: "AYN Odin 2",
    image: "/images/consoles/odin-2.png",
    screenSize: '7.0"',
    cpu: "Snapdragon 8 Gen 2",
    gpu: "Adreno 740",
    ram: "8GB",
    storage: "128GB",
    system: "Android 13",
    games: "Switch, PS2, GameCube",
    speaker: "Stereo",
    tfCard: "TF Slot",
    battery: "8000mAh",
    charger: "USB-C",
    price: 399,
  },
  {
    id: "rg556",
    name: "Anbernic RG556",
    image: "/images/consoles/rg556.webp",
    screenSize: '5.48" AMOLED',
    cpu: "Unisoc T820 Octo-Core",
    gpu: "Mali-G57 MP4",
    ram: "8GB",
    storage: "128GB",
    system: "Android 13",
    games: "PS2, GameCube, Wii, 3DS, Android",
    speaker: "Dual Stereo",
    tfCard: "TF Slot",
    battery: "5500mAh",
    charger: "USB-C",
    price: 613,
  },
  {
    id: "trimui-smart-pro",
    name: "Trimui Smart Pro",
    image: "/images/consoles/trimui-smart-pro.webp",
    screenSize: '4.96"',
    cpu: "Allwinner A133P",
    gpu: "PowerVR GE8300",
    ram: "1GB",
    storage: "8GB",
    system: "Linux",
    games: "PSP, PS1, N64",
    speaker: "Stereo",
    tfCard: "TF Slot",
    battery: "5000mAh",
    charger: "USB-C",
    price: 159,
  },
  {
    id: "gkd-pixel-2",
    name: "GKD Pixel 2",
    image: "/images/consoles/gkd-pixel-2.png",
    screenSize: '2.4" Mini',
    cpu: "RK3326S",
    gpu: "Mali-400",
    ram: "1GB",
    storage: "16GB",
    system: "Linux",
    games: "GB, GBC",
    speaker: "Mono",
    tfCard: "Up to 128GB",
    battery: "1800mAh",
    charger: "USB-C",
    price: 89,
  },
];
 
type FilterKey =
  | "screenSize"
  | "cpu"
  | "gpu"
  | "ram"
  | "storage"
  | "system"
  | "games"
  | "speaker"
  | "tfCard"
  | "battery"
  | "charger";
 
const FILTER_FIELDS: { key: FilterKey; label: string }[] = [
  { key: "screenSize", label: "Screen size" },
  { key: "cpu", label: "CPU" },
  { key: "gpu", label: "GPU" },
  { key: "ram", label: "RAM" },
  { key: "storage", label: "Storage" },
  { key: "system", label: "System" },
  { key: "games", label: "Games" },
  { key: "speaker", label: "Speaker" },
  { key: "tfCard", label: "TF card" },
  { key: "battery", label: "Battery" },
  { key: "charger", label: "Charger" },
];
 
const SPEC_ROWS: { key: FilterKey; label: string }[] = [
  { key: "screenSize", label: "Screen" },
  { key: "cpu", label: "CPU" },
  { key: "gpu", label: "GPU" },
  { key: "ram", label: "RAM" },
  { key: "storage", label: "Storage" },
  { key: "system", label: "System" },
  { key: "games", label: "Games" },
  { key: "speaker", label: "Speaker" },
  { key: "tfCard", label: "TF card" },
  { key: "battery", label: "Battery" },
  { key: "charger", label: "Charger" },
];
 
const EMPTY_FILTERS: Record<FilterKey, string[]> = {
  screenSize: [],
  cpu: [],
  gpu: [],
  ram: [],
  storage: [],
  system: [],
  games: [],
  speaker: [],
  tfCard: [],
  battery: [],
  charger: [],
};
 
/* ---------- AI Builder ---------- */
/*
 * The AI Builder only collects the user's answers below — it never filters,
 * scores, or reorders anything in the collection grid. On the last question,
 * the finished answers are stored in `aiSubmittedAnswers` (see component
 * state) so a backend call can pick them up and do the actual matching.
 */
 
type AiKey = "price" | "screen" | "os" | "battery";
 
type AiAnswers = Record<AiKey, string>;
 
const PRICE_MIN = 0;
const PRICE_MAX = 620;
const PRICE_DEFAULT = "310";
 
const EMPTY_AI_ANSWERS: AiAnswers = {
  price: PRICE_DEFAULT,
  screen: "",
  os: "",
  battery: "",
};
 
type AiQuestion =
  | {
      key: AiKey;
      type: "choice";
      label: string;
      options: { value: string; label: string }[];
    }
  | {
      key: AiKey;
      type: "range";
      label: string;
      min: number;
      max: number;
      step: number;
      format: (value: number) => string;
    };
 
const AI_QUESTIONS: AiQuestion[] = [
  {
    key: "price",
    type: "range",
    label: "What's your preferred price range?",
    min: PRICE_MIN,
    max: PRICE_MAX,
    step: 10,
    format: (value) => `$${value}`,
  },
  {
    key: "screen",
    type: "choice",
    label: "Preferred screen size?",
    options: [
      { value: "compact", label: 'Compact (under 4")' },
      { value: "medium", label: 'Medium (4" – 5.5")' },
      { value: "large", label: 'Large (6"+)' },
    ],
  },
  {
    key: "os",
    type: "choice",
    label: "OS preference?",
    options: [
      { value: "linux", label: "Linux (lightweight, open)" },
      { value: "android", label: "Android (more apps & emulators)" },
      { value: "any", label: "No preference" },
    ],
  },
  {
    key: "battery",
    type: "choice",
    label: "Battery priority?",
    options: [
      { value: "long", label: "Long-lasting (5000mAh+)" },
      { value: "standard", label: "Standard is fine" },
    ],
  },
];
 
export default function CollectionPage() {
  const [filters, setFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
 
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeFilterTab, setActiveFilterTab] = useState<FilterKey>(FILTER_FIELDS[0].key);
 
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [aiStep, setAiStep] = useState(0);
  const [aiAnswers, setAiAnswers] = useState<AiAnswers>(EMPTY_AI_ANSWERS);
 
  // Holds the finished answers once the user completes the wizard, ready to
  // be handed to a backend. These variables are read-only from the
  // collection's point of view — nothing below ever uses them to filter or
  // reorder consoles. `aiSubmittedAnswersString` is the same data serialized
  // to a plain string, which is what you'd actually send as the request body.
  const [aiSubmittedAnswers, setAiSubmittedAnswers] = useState<AiAnswers | null>(null);
  const [aiSubmittedAnswersString, setAiSubmittedAnswersString] = useState<string | null>(null);
  const [showAiBanner, setShowAiBanner] = useState(false);
 
  const options = useMemo(() => {
    const result = {} as Record<FilterKey, string[]>;
    for (const { key } of FILTER_FIELDS) {
      if (key === "games") {
        const set = new Set<string>();
        consoles.forEach((c) =>
          c.games.split(",").forEach((g) => set.add(g.trim()))
        );
        result[key] = Array.from(set).sort();
      } else {
        const set = new Set(consoles.map((c) => c[key]));
        result[key] = Array.from(set).sort();
      }
    }
    return result;
  }, []);
 
  const toggleFilterOption = (key: FilterKey, value: string) =>
    setFilters((prev) => {
      const current = prev[key];
      const next = current.includes(value)
        ? current.filter((v) => v !== value)
        : [...current, value];
      return { ...prev, [key]: next };
    });
 
  const filtered = useMemo(() => {
    return consoles.filter((c) =>
      FILTER_FIELDS.every(({ key }) => {
        const selected = filters[key];
        if (selected.length === 0) return true;
        if (key === "games") {
          const consoleGames = c.games.split(",").map((g) => g.trim().toLowerCase());
          return selected.some((v) => consoleGames.includes(v.toLowerCase()));
        }
        return selected.includes(c[key]);
      })
    );
  }, [filters]);
 
  const resetFilters = () => setFilters(EMPTY_FILTERS);
 
  const activeCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);
  const selected = consoles.find((c) => c.id === selectedId) ?? null;
 
  // The grid always reflects the dropdown/checklist filters only. The AI
  // Builder never touches this.
  const displayList = filtered;
 
  // ---------- AI Builder: step-by-step flow ----------
  const currentQuestion = AI_QUESTIONS[aiStep];
  const isLastQuestion = aiStep === AI_QUESTIONS.length - 1;
  const currentAnswered =
    currentQuestion.type === "range" || aiAnswers[currentQuestion.key] !== "";
 
  const openAiBuilder = () => {
    setAiStep(0);
    setAiModalOpen(true);
  };
 
  const handleAiAnswer = (key: AiKey, value: string) => {
    setAiAnswers((prev) => ({ ...prev, [key]: value }));
  };
 
  const goBack = () => setAiStep((prev) => Math.max(prev - 1, 0));
 
  const goNext = () => {
    if (isLastQuestion) {
      handleAiSubmit();
    } else {
      setAiStep((prev) => Math.min(prev + 1, AI_QUESTIONS.length - 1));
    }
  };
 
  const handleAiSubmit = () => {
    // Just store the answers — no scoring, filtering, or grid changes here.
    const answersString = JSON.stringify(aiAnswers);
 
    setAiSubmittedAnswers(aiAnswers);
    setAiSubmittedAnswersString(answersString);
    setShowAiBanner(true);
    setAiModalOpen(false);
 
    // TODO: hand this string off to the backend, e.g.:
    // fetch("/api/ai-builder", {
    //   method: "POST",
    //   headers: { "Content-Type": "application/json" },
    //   body: answersString,
    // });
    console.log("AI Builder answers ready for backend:", answersString);
  };
 
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
 
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.backLink}>
            &larr; Back
          </Link>
          <h1 className={styles.title}>Browse consoles</h1>
          <p className={styles.subtitle}>
            Filter by spec to find the handhelds that fit your setup.
          </p>
        </header>
 
        <div className={styles.topRow}>
          <div className={styles.filterBar}>
            <div className={styles.filterTabs}>
              {FILTER_FIELDS.map(({ key, label }) => (
                <button
                  type="button"
                  key={key}
                  className={`${styles.filterTab} ${
                    activeFilterTab === key ? styles.filterTabActive : ""
                  }`}
                  onClick={() => setActiveFilterTab(key)}
                  aria-pressed={activeFilterTab === key}
                >
                  {label}
                  {filters[key].length > 0 && (
                    <span className={styles.filterTabCount}>{filters[key].length}</span>
                  )}
                </button>
              ))}
            </div>
 
            <div className={styles.checklist}>
              {options[activeFilterTab].map((opt) => (
                <label className={styles.checkItem} key={opt}>
                  <input
                    type="checkbox"
                    checked={filters[activeFilterTab].includes(opt)}
                    onChange={() => toggleFilterOption(activeFilterTab, opt)}
                  />
                  <span>{opt}</span>
                </label>
              ))}
            </div>
 
            <div className={styles.filterFooter}>
              <span className={styles.resultCount}>
                {filtered.length} of {consoles.length} consoles
                {activeCount > 0 ? ` · ${activeCount} selection${activeCount > 1 ? "s" : ""} active` : ""}
              </span>
              <button
                type="button"
                className={styles.resetButton}
                onClick={resetFilters}
                disabled={activeCount === 0}
              >
                Reset filters
              </button>
            </div>
          </div>
 
          <div className={styles.aiBuilderCard}>
            <p className={styles.aiBuilderTitle}>
              <span className={styles.aiBuilderSpark} aria-hidden="true">✦</span> AI Builder
            </p>
            <p className={styles.aiBuilderDesc}>
              Answer a few quick questions — we&rsquo;ll pass them along to find your matches.
            </p>
            <button
              type="button"
              className={styles.aiBuilderButton}
              onClick={openAiBuilder}
            >
              Launch AI Builder
            </button>
          </div>
        </div>
 
        <div className={styles.browseRow}>
          <div className={styles.gridPanel}>
            <div className={styles.grid}>
              {displayList.map((c) => (
                <button
                  type="button"
                  className={`${styles.card} ${c.id === selectedId ? styles.cardSelected : ""}`}
                  key={c.id}
                  onClick={() => setSelectedId(c.id)}
                  aria-pressed={c.id === selectedId}
                  style={{
                    ["--art-a" as string]: c.a ?? "#b915cc",
                    ["--art-b" as string]: c.b ?? "#210456",
                  }}
                >
                  {c.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img className={styles.cardImage} src={c.image} alt={c.name} />
                  ) : (
                    <div className={styles.cardArt} aria-hidden="true" />
                  )}
                  <p className={styles.cardName}>{c.name}</p>
                </button>
              ))}
 
              {displayList.length === 0 && (
                <p className={styles.empty}>
                  No consoles match these filters. Try resetting one or two.
                </p>
              )}
            </div>
          </div>
 
          <aside className={styles.detailPanel} aria-label="Console details">
            {selected ? (
              <>
                {selected.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    className={styles.detailImage}
                    src={selected.image}
                    alt={selected.name}
                  />
                ) : (
                  <div
                    className={styles.detailArt}
                    aria-hidden="true"
                    style={{
                      ["--art-a" as string]: selected.a ?? "#b915cc",
                      ["--art-b" as string]: selected.b ?? "#210456",
                    }}
                  />
                )}
                <h2 className={styles.detailName}>{selected.name}</h2>
                <p className={styles.detailPrice}>${selected.price}</p>
                <dl className={styles.specList}>
                  {SPEC_ROWS.map(({ key, label }) => (
                    <div className={styles.specRow} key={key}>
                      <dt>{label}</dt>
                      <dd>{selected[key]}</dd>
                    </div>
                  ))}
                </dl>
              </>
            ) : (
              <p className={styles.detailEmpty}>
                Select a console from the grid to see its full specs.
              </p>
            )}
          </aside>
        </div>
      </div>
 
      {aiModalOpen && (
        <div
          className={styles.modalOverlay}
          onClick={() => setAiModalOpen(false)}
        >
          <div
            className={styles.modalCard}
            role="dialog"
            aria-modal="true"
            aria-labelledby="ai-builder-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className={styles.modalHeader}>
              <div>
                <h2 id="ai-builder-title" className={styles.modalTitle}>
                  AI Builder
                </h2>
              </div>
              <button
                type="button"
                className={styles.modalClose}
                onClick={() => setAiModalOpen(false)}
                aria-label="Close"
              >
                &times;
              </button>
            </div>
 
            <div className={styles.progressWrap}>
              <div className={styles.progressTrack}>
                <div
                  className={styles.progressFill}
                  style={{ width: `${((aiStep + 1) / AI_QUESTIONS.length) * 100}%` }}
                />
              </div>
              <span className={styles.progressLabel}>
                {aiStep + 1} / {AI_QUESTIONS.length}
              </span>
            </div>
 
            <div className={styles.questionBlock}>
              <span className={styles.questionLabel}>{currentQuestion.label}</span>
 
              {currentQuestion.type === "choice" ? (
                currentQuestion.options.map((opt) => (
                  <label className={styles.optionRow} key={opt.value}>
                    <input
                      type="radio"
                      name={currentQuestion.key}
                      value={opt.value}
                      checked={aiAnswers[currentQuestion.key] === opt.value}
                      onChange={() => handleAiAnswer(currentQuestion.key, opt.value)}
                    />
                    {opt.label}
                  </label>
                ))
              ) : (
                <div className={styles.priceSlider}>
                  <input
                    type="range"
                    min={currentQuestion.min}
                    max={currentQuestion.max}
                    step={currentQuestion.step}
                    value={aiAnswers[currentQuestion.key]}
                    onChange={(e) => handleAiAnswer(currentQuestion.key, e.target.value)}
                    aria-label={currentQuestion.label}
                  />
                  <div className={styles.priceScale}>
                    <span>{currentQuestion.format(currentQuestion.min)}</span>
                    <span className={styles.priceValue}>
                      {currentQuestion.format(Number(aiAnswers[currentQuestion.key]))}
                    </span>
                    <span>{currentQuestion.format(currentQuestion.max)}</span>
                  </div>
                </div>
              )}
            </div>
 
            <div className={styles.modalFooter}>
              <button
                type="button"
                className={styles.modalSecondary}
                onClick={aiStep === 0 ? () => setAiModalOpen(false) : goBack}
              >
                {aiStep === 0 ? "Cancel" : "Back"}
              </button>
 
              <button
                type="button"
                className={styles.modalPrimary}
                onClick={goNext}
                disabled={!currentAnswered}
              >
                {isLastQuestion ? "Save my answers" : "Submit"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}