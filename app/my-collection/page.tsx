"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import layout from "../collection/page.module.css";
import styles from "./page.module.css";
import { fetchCollectionSummary, type CollectionSummary } from "../lib/api";
import { consoleImage } from "../lib/consoleImages";
import { useMyCollection } from "../lib/myCollection";

const money = (usd: number | null) => (usd === null ? "—" : `$${usd.toLocaleString("en-US")}`);
const signedMoney = (usd: number) => `${usd >= 0 ? "+" : "−"}$${Math.abs(usd).toLocaleString("en-US")}`;

/** "My collection": the consoles you own (with value and gain) and the prices you're tracking. Saved in this browser. */
export default function MyCollectionPage() {
  const collection = useMyCollection();
  const { items, watchlist, forget } = collection;
  const [summary, setSummary] = useState<CollectionSummary | null>(null);
  const [error, setError] = useState(false);

  // Ask the backend for today's prices whenever the saved lists change
  useEffect(() => {
    if (items.length === 0 && watchlist.length === 0) return; // the page shows "empty" instead
    fetchCollectionSummary(
      items.map(({ slug, paidUsd }) => ({ slug, paidUsd })),
      watchlist.map(({ slug, targetPriceUsd }) => ({ slug, targetPriceUsd })),
    )
      .then((result) => {
        setSummary(result);
        setError(false);
        if (result.unknownSlugs.length > 0) forget(result.unknownSlugs);
      })
      .catch((err) => {
        console.error("Couldn't load collection prices:", err);
        setError(true);
      });
    // forget is recreated each render; the lists are what matter here
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, watchlist]);

  // Prices per console, from the backend
  const deviceBySlug = useMemo(() => new Map(summary?.items.map((item) => [item.slug, item]) ?? []), [summary]);
  const trackedBySlug = useMemo(() => new Map(summary?.watchlist.map((entry) => [entry.slug, entry]) ?? []), [summary]);

  const nothingSaved = items.length === 0 && watchlist.length === 0;

  return (
    <div className={layout.page}>
      <div className={layout.backdrop} aria-hidden="true" />

      <div className={layout.shell}>
        <header className={layout.header}>
          <Link href="/collection" className={layout.backLink}>
            &larr; Browse consoles
          </Link>
          <h1 className={layout.title}>My collection</h1>
          <p className={layout.subtitle}>
            Track what you own and what it&rsquo;s worth, and watch prices on the consoles you want. Saved in this
            browser.
          </p>
        </header>

        {error && <p className={styles.notice}>Couldn&rsquo;t load today&rsquo;s prices. Is the backend running?</p>}

        {nothingSaved ? (
          <div className={styles.emptyState}>
            <p>Your collection is empty.</p>
            <p>
              Open any console in{" "}
              <Link href="/collection" className={styles.link}>
                Browse consoles
              </Link>{" "}
              and choose <strong>Add to my collection</strong> or <strong>Track price</strong>.
            </p>
          </div>
        ) : (
          <>
            {items.length > 0 && (
              <section className={styles.stats} aria-label="Collection totals">
                <Stat label="Consoles owned" value={String(items.length)} />
                <Stat label="Collection value" value={summary ? money(summary.totals.valueUsd) : "…"} />
                <Stat label="You paid" value={summary ? money(summary.totals.paidUsd) : "…"} />
                <Stat
                  label="Gain / loss"
                  value={summary ? signedMoney(summary.totals.gainUsd) : "…"}
                  tone={summary ? (summary.totals.gainUsd >= 0 ? "up" : "down") : undefined}
                  note="On consoles with a price paid"
                />
              </section>
            )}

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>Owned consoles</h2>
              {items.length === 0 ? (
                <p className={styles.muted}>Nothing here yet. Use &ldquo;Add to my collection&rdquo; on any console.</p>
              ) : (
                <ul className={styles.list}>
                  {items.map((item) => {
                    const info = deviceBySlug.get(item.slug);
                    const gain = info?.valueUsd != null && item.paidUsd !== null ? info.valueUsd - item.paidUsd : null;
                    return (
                      <li key={item.id} className={styles.row}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className={styles.thumb} src={consoleImage(item.slug)} alt="" />
                        <div className={styles.name}>
                          <strong>{info?.device.name ?? item.slug}</strong>
                          <span className={styles.muted}>Worth {money(info?.valueUsd ?? null)} today</span>
                        </div>
                        <PriceInput
                          key={`${item.id}:${item.paidUsd}`}
                          label="Paid"
                          value={item.paidUsd}
                          onSave={(usd) => collection.setPaid(item.id, usd)}
                        />
                        <span className={gain === null ? styles.muted : gain >= 0 ? styles.up : styles.down}>
                          {gain === null ? "—" : signedMoney(Math.round(gain * 100) / 100)}
                        </span>
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => collection.removeFromCollection(item.id)}
                          aria-label={`Remove ${info?.device.name ?? item.slug} from your collection`}
                        >
                          Remove
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>

            <section className={styles.section}>
              <h2 className={styles.sectionTitle}>
                Price tracking
                {summary && summary.alertCount > 0 && (
                  <span className={styles.alertBadge}>
                    {summary.alertCount} at your target price
                  </span>
                )}
              </h2>
              {watchlist.length === 0 ? (
                <p className={styles.muted}>Not tracking anything. Use &ldquo;Track price&rdquo; on any console.</p>
              ) : (
                <ul className={styles.list}>
                  {watchlist.map((entry) => {
                    const info = trackedBySlug.get(entry.slug);
                    return (
                      <li key={entry.slug} className={`${styles.row} ${info?.belowTarget ? styles.rowAlert : ""}`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img className={styles.thumb} src={consoleImage(entry.slug)} alt="" />
                        <div className={styles.name}>
                          <strong>{info?.device.name ?? entry.slug}</strong>
                          <span className={styles.muted}>
                            Now {money(info?.currentPriceUsd ?? null)}
                            {info && trendText(info.trend, info.trendPct)}
                          </span>
                          {info?.belowTarget && <span className={styles.alertText}>At or below your target!</span>}
                          {info?.isGoodDeal && <span className={styles.alertText}>Good deal right now</span>}
                        </div>
                        <PriceInput
                          key={`${entry.slug}:${entry.targetPriceUsd}`}
                          label="Target"
                          value={entry.targetPriceUsd}
                          onSave={(usd) => collection.setTarget(entry.slug, usd)}
                        />
                        <span />
                        <button
                          type="button"
                          className={styles.remove}
                          onClick={() => collection.untrack(entry.slug)}
                          aria-label={`Stop tracking ${info?.device.name ?? entry.slug}`}
                        >
                          Stop
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value, tone, note }: { label: string; value: string; tone?: "up" | "down"; note?: string }) {
  return (
    <div className={styles.stat}>
      <span className={styles.statLabel}>{label}</span>
      <span className={`${styles.statValue} ${tone ? styles[tone] : ""}`}>{value}</span>
      {note && <span className={styles.statNote}>{note}</span>}
    </div>
  );
}

function trendText(trend: string, pct: number | null) {
  if (trend === "up" && pct !== null) return ` · ▲ ${pct}% this month`;
  if (trend === "down" && pct !== null) return ` · ▼ ${Math.abs(pct)}% this month`;
  if (trend === "flat") return " · steady";
  return "";
}

/**
 * A dollar amount the user can type; saved when they leave the box or press Enter. Empty = not set.
 * Rendered with a key that includes the saved value, so it starts fresh whenever that value changes.
 */
function PriceInput({ label, value, onSave }: { label: string; value: number | null; onSave: (usd: number | null) => void }) {
  const [draft, setDraft] = useState(value === null ? "" : String(value));

  const commit = () => {
    const cleaned = draft.replace(/[$,\s]/g, "");
    const usd = cleaned === "" ? null : Number(cleaned);
    if (usd !== null && (!Number.isFinite(usd) || usd < 0)) {
      setDraft(value === null ? "" : String(value)); // not a valid amount: put the old value back
      return;
    }
    if (usd !== value) onSave(usd);
  };

  return (
    <label className={styles.priceInput}>
      <span>{label} $</span>
      <input
        inputMode="decimal"
        value={draft}
        placeholder="—"
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && (e.target as HTMLInputElement).blur()}
      />
    </label>
  );
}
