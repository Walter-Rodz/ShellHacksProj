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
  },
  {
    id: "rg35xx-plus", // Not in the excel sheet
    name: "Anbernic RG35XX Plus",
    image: "/images/consoles/rg35xx-plus.png",
    screenSize: '3.5"',
    cpu: "H700 Quad-core ARM",
    gpu: "Mali-G31",
    ram: "1GB",
    storage: "64GB",
    system: "Linux",
    games: "GBA, PS1, SNES",
    speaker: "Mono", // Not listed
    tfCard: "Dual TF Slots",
    battery: "3500mAh",
    charger: "USB-C",
  },
  {
    id: "rgb30", // Not in the excel sheet
    name: "Powkiddy RGB30",
    image: "/images/consoles/rgb30.png",
    screenSize: '4.0"',
    cpu: "RK3566",
    gpu: "Mali-G52", // None listed
    ram: "4GB",
    storage: "18GB",
    system: "Linux / Android",
    games: "PS1, N64, Dreamcast",
    speaker: "Dual Stereo",
    tfCard: "Dual TF Slots",
    battery: "4100mAh",
    charger: "USB-C",
  },
  {
    id: "odin-2", // Not in the excel sheet, the original Odin 2 is actually discontinued, stats found for Odin 2 Portal
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
  },
  {
    id: "gkd-pixel-2", // Not in the excel sheet
    name: "GKD Pixel 2",
    image: "/images/consoles/gkd-pixel-2.png",
    screenSize: '2.4" Mini',
    cpu: "RK3326S",
    gpu: "Mali-400", // Not listed
    ram: "1GB",
    storage: "16GB",
    system: "Linux",
    games: "GB, GBC",
    speaker: "Mono",
    tfCard: "Up to 128GB",
    battery: "1800mAh",
    charger: "USB-C",
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

const ALL = "All";

export default function CollectionPage() {
  const [filters, setFilters] = useState<Record<FilterKey, string>>({
    screenSize: ALL,
    cpu: ALL,
    gpu: ALL,
    ram: ALL,
    storage: ALL,
    system: ALL,
    games: ALL,
    speaker: ALL,
    tfCard: ALL,
    battery: ALL,
    charger: ALL,
  });

  const [selectedId, setSelectedId] = useState<string | null>(null);

  const options = useMemo(() => {
    const result = {} as Record<FilterKey, string[]>;
    for (const { key } of FILTER_FIELDS) {
      if (key === "games") {
        const set = new Set<string>();
        consoles.forEach((c) =>
          c.games.split(",").forEach((g) => set.add(g.trim()))
        );
        result[key] = [ALL, ...Array.from(set).sort()];
      } else {
        const set = new Set(consoles.map((c) => c[key]));
        result[key] = [ALL, ...Array.from(set).sort()];
      }
    }
    return result;
  }, []);

  const filtered = useMemo(() => {
    return consoles.filter((c) =>
      FILTER_FIELDS.every(({ key }) => {
        const value = filters[key];
        if (value === ALL) return true;
        if (key === "games") {
          return c.games.toLowerCase().includes(value.toLowerCase());
        }
        return c[key] === value;
      })
    );
  }, [filters]);

  const resetFilters = () =>
    setFilters({
      screenSize: ALL,
      cpu: ALL,
      gpu: ALL,
      ram: ALL,
      storage: ALL,
      system: ALL,
      games: ALL,
      speaker: ALL,
      tfCard: ALL,
      battery: ALL,
      charger: ALL,
    });

  const activeCount = Object.values(filters).filter((v) => v !== ALL).length;
  const selected = consoles.find((c) => c.id === selectedId) ?? null;

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

        <div className={styles.filterBar}>
          <div className={styles.filterGrid}>
            {FILTER_FIELDS.map(({ key, label }) => (
              <label className={styles.filterField} key={key}>
                <span className={styles.filterLabel}>{label}</span>
                <select
                  className={styles.filterSelect}
                  value={filters[key]}
                  onChange={(e) =>
                    setFilters((prev) => ({ ...prev, [key]: e.target.value }))
                  }
                >
                  {options[key].map((opt) => (
                    <option value={opt} key={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </label>
            ))}
          </div>

          <div className={styles.filterFooter}>
            <span className={styles.resultCount}>
              {filtered.length} of {consoles.length} consoles
              {activeCount > 0 ? ` · ${activeCount} filter${activeCount > 1 ? "s" : ""} active` : ""}
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

        <div className={styles.browseRow}>
          <div className={styles.gridPanel}>
            <div className={styles.grid}>
              {filtered.map((c) => (
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

              {filtered.length === 0 && (
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
    </div>
  );
}
