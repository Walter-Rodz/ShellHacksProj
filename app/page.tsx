"use client";
 
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
