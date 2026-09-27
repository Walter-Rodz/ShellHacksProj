"use client";
 
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import styles from "./page.module.css";
import ChatPanel from "./ChatPanel";
import CollectionActions from "./CollectionActions";
import { useMyCollection } from "../lib/myCollection";
import {
  fetchAiBuilderPicks,
  fetchConsoles,
  type AiBuilderResult,
  type ConsoleItem,
} from "../lib/api";
 
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
 * The AI Builder collects the user's answers below and sends them to the
 * backend (POST /api/ai-builder), which finds matching consoles and has Gemini
 * rank them and explain each pick. The picks show in a panel under the
 * AI Builder card; the grid and its filters are left as they are.
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
  const [consoles, setConsoles] = useState<ConsoleItem[]>([]);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    fetchConsoles()
      .then((items) => {
        setConsoles(items);
        setLoadState("ready");
      })
      .catch((err) => {
        console.error("Couldn't load consoles from the backend:", err);
        setLoadState("error");
      });
  }, []);

  const [filters, setFilters] = useState<Record<FilterKey, string[]>>(EMPTY_FILTERS);
 
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const myCollection = useMyCollection();
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
  const [aiResult, setAiResult] = useState<AiBuilderResult | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  // When set, the grid shows only the AI Builder's matches, in its ranked order
  const [aiMatchIds, setAiMatchIds] = useState<string[] | null>(null);
 
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
  }, [consoles]);
 
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
  }, [filters, consoles]);
 
  const resetFilters = () => setFilters(EMPTY_FILTERS);
 
  const activeCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);
  const selected = consoles.find((c) => c.id === selectedId) ?? null;
 
  // The grid shows the checklist filters' results. After "Show all matches" in the AI Builder panel, it shows
  // only the AI Builder's matches (still narrowed by any ticked filters), best first.
  const displayList = useMemo(() => {
    if (!aiMatchIds) return filtered;
    const order = new Map(aiMatchIds.map((id, i) => [id, i]));
    return filtered.filter((c) => order.has(c.id)).sort((a, b) => order.get(a.id)! - order.get(b.id)!);
  }, [filtered, aiMatchIds]);
 
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
 
  const handleAiSubmit = async () => {
    const answersString = JSON.stringify(aiAnswers);

    setAiSubmittedAnswers(aiAnswers);
    setAiSubmittedAnswersString(answersString);
    setShowAiBanner(true);
    setAiModalOpen(false);

    setAiLoading(true);
    setAiError(null);
    setAiResult(null);
    setAiMatchIds(null);
    try {
      setAiResult(await fetchAiBuilderPicks(aiAnswers));
    } catch (err) {
      console.error("AI Builder request failed:", err);
      setAiError("Couldn't reach the AI Builder. Is the backend running?");
    } finally {
      setAiLoading(false);
    }
  };
 
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
 
      <div className={styles.shell}>
        <header className={styles.header}>
          <Link href="/" className={styles.backLink}>
            &larr; Back
          </Link>
          <Link href="/my-collection" className={styles.myCollectionLink}>
            My collection ({myCollection.items.length})
            {myCollection.watchlist.length > 0 && ` · tracking ${myCollection.watchlist.length}`}
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
 
        {showAiBanner && (
          <section className={styles.aiResults} aria-live="polite">
            <div className={styles.aiResultsHeader}>
              <p className={styles.aiBuilderTitle}>
                <span className={styles.aiBuilderSpark} aria-hidden="true">✦</span> Your AI Builder picks
              </p>
              <button type="button" className={styles.resetButton} onClick={() => setShowAiBanner(false)}>
                Hide
              </button>
            </div>

            {aiLoading && <p className={styles.aiResultsNote}>Finding your matches…</p>}
            {aiError && <p className={styles.aiResultsNote}>{aiError}</p>}

            {aiResult && (
              <>
                {aiResult.summary && <p className={styles.aiResultsSummary}>{aiResult.summary}</p>}
                {aiResult.picks.length === 0 ? (
                  <p className={styles.aiResultsNote}>No consoles match those answers.</p>
                ) : (
                  <ol className={styles.aiPickList}>
                    {aiResult.picks.map((pick) => (
                      <li key={pick.device.id}>
                        <button
                          type="button"
                          className={styles.aiPick}
                          onClick={() => setSelectedId(pick.device.slug)}
                        >
                          <span className={styles.aiPickName}>
                            {pick.rank}. {pick.device.name}
                            {pick.device.startingPriceUsd !== null && (
                              <span className={styles.aiPickPrice}> · ${pick.device.startingPriceUsd}</span>
                            )}
                          </span>
                          <span className={styles.aiPickReason}>{pick.reason}</span>
                        </button>
                      </li>
                    ))}
                  </ol>
                )}
                <div className={styles.aiResultsFooter}>
                  <p className={styles.aiResultsNote}>
                    {aiResult.matchCount} console{aiResult.matchCount === 1 ? "" : "s"} matched
                    {aiResult.rankedBy === "gemini" ? " · ranked by Gemini" : " · ranked by specs (Gemini unavailable)"}
                  </p>
                  {aiResult.matchCount > 0 &&
                    (aiMatchIds ? (
                      <button type="button" className={styles.resetButton} onClick={() => setAiMatchIds(null)}>
                        Show all consoles
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={styles.aiShowAllButton}
                        onClick={() => setAiMatchIds(aiResult.matches.map((d) => d.slug))}
                      >
                        Show all {aiResult.matchCount} matches in the grid
                      </button>
                    ))}
                </div>
              </>
            )}
          </section>
        )}

        <div className={styles.browseRow}>
          <div className={styles.gridPanel}>
            {aiMatchIds && (
              <p className={styles.aiGridNotice}>
                Showing {displayList.length} AI Builder match{displayList.length === 1 ? "" : "es"}, best first.{" "}
                <button type="button" className={styles.aiLinkButton} onClick={() => setAiMatchIds(null)}>
                  Show all consoles
                </button>
              </p>
            )}
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
 
              {loadState === "loading" && <p className={styles.empty}>Loading consoles…</p>}
              {loadState === "error" && (
                <p className={styles.empty}>
                  Couldn&rsquo;t load consoles. Make sure the backend is running.
                </p>
              )}

              {loadState === "ready" && displayList.length === 0 && (
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
                <p className={styles.detailPrice}>
                  {selected.price !== null ? `$${selected.price}` : "No price yet"}
                </p>
                <CollectionActions slug={selected.id} name={selected.name} />
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

      <ChatPanel onSelectConsole={setSelectedId} />
    </div>
  );
}
