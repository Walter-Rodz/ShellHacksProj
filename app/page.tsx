"use client";
 
import Link from "next/link";
import styles from "./page.module.css";
 
type CollectionItem = {
  name: string;
  image: string;
};
 
const exampleItems: CollectionItem[] = [
  { name: "ANBERNIC RG-Ds", image: "/images/consoles/anbernic-rg-ds.png" },
  { name: "Odin 3 Pro", image: "/images/consoles/odin-3-pro.png" },
  { name: "Miyoo Flip", image: "/images/consoles/Miyoo flip.png" },
  { name: "Retroid Pocket 5", image: "/images/consoles/retroid-pocket-5.png" },
];
 
export default function Home() {
  return (
    <div className={styles.page}>
      <div className={styles.backdrop} aria-hidden="true" />
 
      <div className={styles.layout}>
        <main className={styles.main}>
          <h1 className={styles.title}>
            <span className={styles.titleAccent}>GET RETRO WITH US</span>
          </h1>
 
          <p className={styles.lede}>
            Find the perfect emulator console for your collection, see what it&rsquo;s actually worth, find out its specs, what games it can play, and track the collection you&rsquo;ve built.
          </p>
 
          <Link href="/collection" className={styles.cta}>
            Start your collection
          </Link>
        </main>
 
        <aside className={styles.preview} aria-label="Example collection preview">
          <p className={styles.previewLabel}>YOUR COLLECTION, AT A GLANCE</p>
          <div className={styles.previewPanel}>
            <div className={styles.previewGrid}>
              {exampleItems.map((item) => (
                <div className={styles.card} key={item.name}>
                  {item.image ? (
                    // eslint-disable-next-line @next/next/no-img-element
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
