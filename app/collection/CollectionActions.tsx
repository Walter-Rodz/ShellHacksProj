"use client";

import Link from "next/link";
import { useMyCollection } from "../lib/myCollection";
import styles from "./CollectionActions.module.css";

/** "Add to my collection" and "Track price" buttons for the console shown in the details panel */
export default function CollectionActions({ slug, name }: { slug: string; name: string }) {
  const collection = useMyCollection();
  const owned = collection.ownedCount(slug);
  const tracked = collection.isTracked(slug);

  return (
    <div className={styles.actions}>
      <div className={styles.buttons}>
        <button type="button" className={styles.primary} onClick={() => collection.addToCollection(slug)}>
          {owned > 0 ? "Add another" : "Add to my collection"}
        </button>
        <button
          type="button"
          className={tracked ? styles.secondaryActive : styles.secondary}
          onClick={() => (tracked ? collection.untrack(slug) : collection.track(slug))}
          aria-pressed={tracked}
        >
          {tracked ? "✓ Tracking price" : "Track price"}
        </button>
      </div>

      {(owned > 0 || tracked) && (
        <p className={styles.status}>
          {owned > 0 && `You own ${owned === 1 ? "this" : `${owned} of these`}. `}
          {tracked && `You're tracking ${name}'s price. `}
          <Link href="/my-collection" className={styles.link}>
            {owned > 0 ? "Add what you paid" : "Set a target price"} in My collection
          </Link>
        </p>
      )}
    </div>
  );
}
