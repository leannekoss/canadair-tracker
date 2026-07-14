// Fil d'actualité incendies (RSS) — colonne droite repliable, refresh 10 min.

import { useEffect, useState } from "react";
import { fetchNews } from "../lib/news";

const REFRESH_MS = 10 * 60_000;

function relTime(date) {
  if (!date) return "";
  const min = Math.round((Date.now() - date.getTime()) / 60_000);
  if (min < 60) return `il y a ${Math.max(min, 1)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `il y a ${h} h`;
  return date.toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

export default function NewsFeed({ className = "w-72", listClassName = "max-h-[38vh]" }) {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(true);

  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchNews()
        .then((n) => alive && setItems(n))
        .catch((e) => console.warn("news:", e.message));
    load();
    const id = setInterval(load, REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  return (
    <aside className={`pointer-events-auto flex flex-col overflow-hidden rounded-md border border-line bg-panel backdrop-blur-md ${className}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-baseline justify-between px-3 pb-1.5 pt-2 text-left"
      >
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
          <span className="pulse-dot mr-1.5 inline-block h-1.5 w-1.5 rounded-full bg-fire align-middle" />
          Actus incendies
        </h2>
        <span className="font-display text-xs font-bold text-ink-faint">{open ? "‹" : "›"}</span>
      </button>
      {open && items.length === 0 && (
        <p className="border-t border-line px-3 py-3 text-[12px] text-ink-faint">
          Chargement des actualités…
        </p>
      )}
      {open && items.length > 0 && (
        <ol className={`overflow-y-auto border-t border-line ${listClassName}`}>
          {items.map((n, i) => (
            <li key={i} className={i > 0 ? "border-t border-line/50" : ""}>
              <a
                href={n.link}
                target="_blank"
                rel="noopener noreferrer"
                className="block px-3 py-2 transition-colors hover:bg-raise/60"
              >
                <p className="text-[13px] leading-snug text-ink">{n.title}</p>
                <p className="mt-0.5 text-[11px] text-ink-faint">
                  {n.source}
                  {n.date && <span className="tnum"> · {relTime(n.date)}</span>}
                </p>
              </a>
            </li>
          ))}
        </ol>
      )}
    </aside>
  );
}
