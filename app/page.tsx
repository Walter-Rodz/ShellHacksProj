"use client";

import styles from "./page.module.css";
import Image from "public/console-placeholder.svg";

type CollectionItem = {
  name: string;
  image: string;

};

const exampleItems: CollectionItem[] = [
  { name: "PS!",  image: "/consoles/PlayStation-SCPH-1000-with-Controller.png" },
  { name: "Game Boy Color", image: "/consolesGame-Boy-Color-with-Controller.png" },
  { name: "PS1 (SCPH-1001)", image: "/consoles/PlayStation-SCPH-1001-with-Controller.png" },
  { name: "Neo Geo AES", image: "/consoles/Neo-Geo-AES-with-Controller.png" },
];

export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />

      <div className={styles.layout}>
        <main className={styles.main}>

          <h1 className={styles.title}>
            <span className={styles.titleAccent}>PROJECT</span>
          </h1>

          <p className={styles.lede}>
            Look up any console, see what it&rsquo;s actually worth, and track
            the collection you&rsquo;ve built &mdash; from launch-day classics
            to the ones still on your list.
          </p>

          <button
            className={styles.cta}
            type="button"
            onClick={() => {
              console.log("Start collection clicked");
            }}
          >
            Start your collection
          </button>

        </main>

        <aside className={styles.preview} aria-label="Example collection preview">
          <p className={styles.previewLabel}>YOUR COLLECTION, AT A GLANCE</p>
          <div className={styles.previewPanel}>
            <div className={styles.previewGrid}>
              {exampleItems.map((item) => (
                <div
                  className={styles.card}
                  key={item.name}
                >
                  {item.image ? (
                    <img
                      className={styles.cardImage}
                      src={item.image}
                      alt={item.name}
                    />
                  ) : (
                    <div className={styles.cardArt} aria-hidden="true" />
                  )}
                  <p className={styles.cardName}>{item.name}</p>
                </div>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

