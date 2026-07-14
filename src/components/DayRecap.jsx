// « Bilan de la journée » : poster exportable en PNG (partage social).
// La carte est un SVG projeté (pas une capture WebGL) → net et fiable à l'export.

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { toPng } from "html-to-image";
import franceOutline from "../data/france-outline.json";
import { FRANCE_BOUNDS, makeProjector } from "../lib/project";
import { CATEGORY_HEX, FIRE_COLOR } from "../theme";

const POSTER_W = 720;
const POSTER_H = 940;
const MAP_W = 656;
const MAP_H = 384;

function Stat({ value, label, sub }) {
  return (
    <div className="text-center">
      <div className="tnum font-display text-[46px] font-bold leading-none text-ink">{value}</div>
      <div className="mt-1 font-display text-[13px] font-semibold uppercase tracking-[0.12em] text-ink-dim">
        {label}
      </div>
      {sub && <div className="text-[11px] text-ink-faint">{sub}</div>}
    </div>
  );
}

function TrailMap({ trails, fleetByHex, foyers }) {
  const project = useMemo(() => makeProjector(FRANCE_BOUNDS, MAP_W, MAP_H, 10), []);
  const outlinePaths = useMemo(
    () =>
      franceOutline.map((ring) =>
        ring.map(([lon, lat], i) => `${i ? "L" : "M"}${project(lon, lat).map((n) => n.toFixed(1)).join(" ")}`).join(" ") + "Z"
    ),
    [project]
  );
  const trailPaths = useMemo(
    () =>
      Object.values(trails)
        .filter((tr) => tr.points.length > 1 && fleetByHex[tr.hex])
        .map((tr) => ({
          hex: tr.hex,
          color: CATEGORY_HEX[fleetByHex[tr.hex].category] ?? "#94a1b5",
          d: tr.points
            .map((p, i) => `${i ? "L" : "M"}${project(p.lon, p.lat).map((n) => n.toFixed(1)).join(" ")}`)
            .join(" "),
        })),
    [trails, fleetByHex, project]
  );

  return (
    <svg width={MAP_W} height={MAP_H} className="rounded-lg" style={{ background: "#0a1018" }}>
      {outlinePaths.map((d, i) => (
        <path key={i} d={d} fill="#18243a" stroke="#3d5a7e" strokeWidth="1.2" strokeLinejoin="round" />
      ))}
      {foyers.map((f, i) => {
        const [x, y] = project(f.lon, f.lat);
        const r = 3 + Math.min(f.frp ?? 0, 4000) / 900;
        return <circle key={i} cx={x} cy={y} r={r} fill={`rgb(${FIRE_COLOR.join(",")})`} opacity="0.75" />;
      })}
      {trailPaths.map((t) => (
        <path key={t.hex} d={t.d} fill="none" stroke={t.color} strokeWidth="1.6" strokeOpacity="0.85" strokeLinejoin="round" strokeLinecap="round" />
      ))}
    </svg>
  );
}

export default function DayRecap({ recap, trails, fleetByHex, foyers, dateLabel, isToday, onClose }) {
  const posterRef = useRef(null);
  const [exporting, setExporting] = useState(false);
  const [scale, setScale] = useState(1);

  useLayoutEffect(() => {
    const fit = () =>
      setScale(Math.min(1, (window.innerWidth - 24) / POSTER_W, (window.innerHeight - 96) / POSTER_H));
    fit();
    window.addEventListener("resize", fit);
    return () => window.removeEventListener("resize", fit);
  }, []);

  const exportPng = useCallback(async () => {
    if (!posterRef.current) return;
    setExporting(true);
    try {
      const url = await toPng(posterRef.current, {
        pixelRatio: 2.5,
        cacheBust: true,
        backgroundColor: "#0b1017",
        width: POSTER_W,
        height: POSTER_H,
      });
      const a = document.createElement("a");
      a.download = `canadair-tracker-bilan-${(dateLabel || "").replace(/\s+/g, "-").toLowerCase()}.png`;
      a.href = url;
      a.click();
    } catch (e) {
      console.error("export bilan:", e);
    } finally {
      setExporting(false);
    }
  }, [dateLabel]);

  const hasData = recap && recap.aircraftCount > 0;
  const hh = Math.floor(recap?.flightHours ?? 0);
  const mm = Math.round(((recap?.flightHours ?? 0) - hh) * 60);

  return (
    <div className="absolute inset-0 z-40 flex flex-col items-center overflow-auto bg-surface/85 backdrop-blur-sm">
      {/* Barre d'actions */}
      <div className="pointer-events-auto sticky top-0 z-10 flex w-full items-center justify-between px-4 py-3">
        <button
          onClick={exportPng}
          disabled={!hasData || exporting}
          className="rounded-md border border-live/50 bg-live/15 px-4 py-2 font-display text-sm font-bold tracking-wide text-ink transition-colors hover:bg-live/25 disabled:opacity-40"
        >
          {exporting ? "Export…" : "⬇ Télécharger le PNG"}
        </button>
        <button
          onClick={onClose}
          className="rounded-md border border-line bg-panel px-3 py-2 font-display text-sm font-semibold text-ink-dim hover:text-ink"
        >
          Fermer
        </button>
      </div>

      {/* Wrapper scalé pour tenir à l'écran ; le poster garde sa taille intrinsèque */}
      <div style={{ height: POSTER_H * scale }} className="shrink-0">
        <div style={{ transform: `scale(${scale})`, transformOrigin: "top center" }}>
          <article
            ref={posterRef}
            style={{ width: POSTER_W, height: POSTER_H }}
            className="flex flex-col bg-surface px-9 pb-8 pt-9"
          >
            <header className="flex items-baseline justify-between">
              <div>
                <div className="font-display text-sm font-bold uppercase tracking-[0.22em] text-pelican">
                  Canadair Tracker
                </div>
                <h1 className="font-display text-[38px] font-bold leading-none tracking-wide text-ink">
                  Bilan {isToday ? "en cours" : "du jour"}
                </h1>
              </div>
              <div className="text-right font-display text-lg font-semibold text-ink-dim">{dateLabel}</div>
            </header>

            {!hasData ? (
              <div className="flex flex-1 items-center justify-center text-center font-display text-lg text-ink-dim">
                Aucun vol de bombardier enregistré {isToday ? "pour l'instant" : "ce jour-là"}.
              </div>
            ) : (
              <>
                <div className="mt-6 grid grid-cols-4 gap-2">
                  <Stat value={recap.aircraftCount} label="Appareils" />
                  <Stat value={recap.totalKm.toLocaleString("fr-FR")} label="km cumulés" />
                  <Stat value={`${hh}h${String(mm).padStart(2, "0")}`} label="de vol" />
                  <Stat value={recap.foyersHit.length} label="Foyers" />
                </div>

                <div className="mt-6">
                  <TrailMap trails={trails} fleetByHex={fleetByHex} foyers={foyers} />
                  <p className="mt-1 text-right text-[10px] text-ink-faint">
                    Trajets ADS-B de la journée · foyers VIIRS
                  </p>
                </div>

                <div className="mt-5 grid grid-cols-2 gap-6">
                  <section>
                    <h2 className="mb-2 border-b border-line pb-1 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
                      Appareils les plus actifs
                    </h2>
                    <ul className="space-y-1.5">
                      {recap.top.slice(0, 5).map((a) => (
                        <li key={a.hex} className="flex items-baseline gap-2 text-[13px]">
                          <span style={{ color: CATEGORY_HEX[a.category] }}>■</span>
                          <span className="font-display font-bold text-ink">{a.reg}</span>
                          <span className="tnum ml-auto text-ink-dim">
                            {a.distKm.toLocaleString("fr-FR")} km
                            {a.rotations > 0 && <span className="text-ink-faint"> · {a.rotations} rot.</span>}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </section>
                  <section>
                    <h2 className="mb-2 border-b border-line pb-1 font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
                      Foyers combattus
                    </h2>
                    <ul className="space-y-1.5">
                      {foyers
                        .filter((f) => recap.foyersHit.includes(f.name))
                        .slice(0, 5)
                        .map((f, i) => (
                          <li key={i} className="flex items-baseline gap-2 text-[13px]">
                            <span className="text-fire">●</span>
                            <span className="text-ink">{f.name}</span>
                            <span className="tnum ml-auto text-ink-dim">{f.frp.toLocaleString("fr-FR")} MW</span>
                          </li>
                        ))}
                      {recap.foyersHit.length === 0 && (
                        <li className="text-[13px] text-ink-faint">Aucun passage sur foyer détecté</li>
                      )}
                    </ul>
                  </section>
                </div>

                <div className="mt-4 flex gap-4">
                  {recap.byFamily.map((f) => (
                    <div key={f.family} className="flex items-center gap-1.5 text-[12px]">
                      <span style={{ color: CATEGORY_HEX[f.category] }}>■</span>
                      <span className="text-ink-dim">
                        {f.count} {f.family}
                        {f.count > 1 ? "s" : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </>
            )}

            <footer className="mt-auto flex items-baseline justify-between border-t border-line pt-3">
              <span className="font-display text-sm font-semibold text-ink-dim">canadair-tracker.vercel.app</span>
              <span className="text-[11px] text-ink-faint">
                Estimations ADS-B / VIIRS · par Henri Casalis
              </span>
            </footer>
          </article>
        </div>
      </div>
    </div>
  );
}
