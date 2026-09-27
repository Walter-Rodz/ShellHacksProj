"use client";

// The user's collection and price watchlist, saved in this browser (no accounts).
// Every component using useMyCollection() sees the same data and updates together, including across tabs.
import { useCallback, useEffect, useState } from "react";

export type OwnedConsole = {
  /** Random id, so the same console can be owned twice (e.g. two colors) */
  id: string;
  slug: string;
  paidUsd: number | null;
  addedAt: string;
};

export type TrackedConsole = {
  slug: string;
  /** "Tell me when it's at or below this price"; null = just keep an eye on it */
  targetPriceUsd: number | null;
  addedAt: string;
};

type Saved = { items: OwnedConsole[]; watchlist: TrackedConsole[] };

const STORAGE_KEY = "goretro.myCollection.v1";
const CHANGE_EVENT = "goretro:myCollection";
const EMPTY: Saved = { items: [], watchlist: [] };

function load(): Saved {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return EMPTY;
    const saved = JSON.parse(raw) as Partial<Saved>;
    return { items: saved.items ?? [], watchlist: saved.watchlist ?? [] };
  } catch {
    return EMPTY; // storage blocked (private mode) or unreadable: start empty
  }
}

function save(data: Saved) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {
    // storage blocked: changes still work until the page is closed
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function useMyCollection() {
  const [data, setData] = useState<Saved>(EMPTY);

  // Read after the page loads (localStorage doesn't exist during server rendering), then stay in sync
  useEffect(() => {
    const refresh = () => setData(load());
    refresh();
    window.addEventListener(CHANGE_EVENT, refresh);
    window.addEventListener("storage", refresh); // other tabs
    return () => {
      window.removeEventListener(CHANGE_EVENT, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const update = useCallback((change: (current: Saved) => Saved) => save(change(load())), []);

  return {
    items: data.items,
    watchlist: data.watchlist,

    addToCollection: (slug: string, paidUsd: number | null = null) =>
      update((d) => ({
        ...d,
        items: [...d.items, { id: crypto.randomUUID(), slug, paidUsd, addedAt: new Date().toISOString() }],
      })),
    setPaid: (id: string, paidUsd: number | null) =>
      update((d) => ({ ...d, items: d.items.map((item) => (item.id === id ? { ...item, paidUsd } : item)) })),
    removeFromCollection: (id: string) => update((d) => ({ ...d, items: d.items.filter((item) => item.id !== id) })),
    ownedCount: (slug: string) => data.items.filter((item) => item.slug === slug).length,

    track: (slug: string, targetPriceUsd: number | null = null) =>
      update((d) => ({
        ...d,
        watchlist: [
          ...d.watchlist.filter((entry) => entry.slug !== slug),
          { slug, targetPriceUsd, addedAt: new Date().toISOString() },
        ],
      })),
    setTarget: (slug: string, targetPriceUsd: number | null) =>
      update((d) => ({
        ...d,
        watchlist: d.watchlist.map((entry) => (entry.slug === slug ? { ...entry, targetPriceUsd } : entry)),
      })),
    untrack: (slug: string) => update((d) => ({ ...d, watchlist: d.watchlist.filter((entry) => entry.slug !== slug) })),
    isTracked: (slug: string) => data.watchlist.some((entry) => entry.slug === slug),

    /** Drops saved consoles that aren't in the catalog anymore */
    forget: (slugs: string[]) =>
      update((d) => ({
        items: d.items.filter((item) => !slugs.includes(item.slug)),
        watchlist: d.watchlist.filter((entry) => !slugs.includes(entry.slug)),
      })),
  };
}
