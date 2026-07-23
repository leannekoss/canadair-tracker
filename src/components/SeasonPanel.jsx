// Vue saison : cumul sur toutes les journées archivées. Charge les traces
// archivées (statiques, notre domaine — parallélisables) à l'ouverture, calcule
// un bilan par jour (sans foyers : les feux du jour ne s'appliquent pas au passé)
// puis agrège. Valeurs = estimations ADS-B.
import { useEffect, useState } from "react";
import { fetchArchiveIndex, fetchArchivedTrace } from "../lib/api.js";
import { buildRecap } from "../lib/recap.js";
import { buildSeason } from "../lib/season.js";
import { CATEGORY_HEX } from "../theme.js";

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso + "T12:00:00Z").toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

async function loadDayRecap(day, fleetByHex) {
  const traces = await Promise.all(
    day.hexes.map((hex) =>
      fetchArchivedTrace(day.date, hex).catch(() => null)
    )
  );
  const trails = {};
  for (const t of traces) {
    if (t && t.points?.length > 1) trails[t.hex] = t;
  }
  return { date: day.date, recap: buildRecap(trails, fleetByHex, []) };
}

export default function SeasonPanel({ fleetByHex, onClose }) {
  const [season, setSeason] = useState(null);
  const [state, setState] = useState("loading"); // loading | ready | empty | error

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const index = await fetchArchiveIndex();
        if (!index.length) {
          if (alive) setState("empty");
          return;
        }
        const daily = await Promise.all(index.map((d) => loadDayRecap(d, fleetByHex)));
        const s = buildSeason(daily);
        if (!alive) return;
        setSeason(s);
        setState(s ? "ready" : "empty");
      } catch {
        if (alive) setState("error");
      }
    })();
    return () => {
      alive = false;
    };
  }, [fleetByHex]);

  return (
    <div
      className="pointer-events-auto fixed inset-0 z-40 flex items-center justify-center bg-surface/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="max-h-[85dvh] w-full max-w-md overflow-y-auto rounded-lg border border-line bg-panel-solid p-5 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between">
          <div>
            <h2 className="font-display text-2xl font-bold text-ink">La saison</h2>
            <p className="mt-0.5 text-xs text-ink-dim">
              {season
                ? `${season.days} journées suivies depuis le ${fmtDate(season.since)}`
                : "Cumul des journées archivées"}
            </p>
          </div>
          <button
            onClick={onClose}
            className="rounded px-2 py-1 text-lg leading-none text-ink-dim hover:text-ink"
          >
            ✕
          </button>
        </div>

        {state === "loading" && (
          <p className="py-8 text-center text-sm text-ink-dim">Agrégation des journées…</p>
        )}
        {state === "empty" && (
          <p className="py-8 text-center text-sm text-ink-dim">
            Pas encore assez de journées archivées.
          </p>
        )}
        {state === "error" && (
          <p className="py-8 text-center text-sm text-ink-dim">
            Archive momentanément indisponible.
          </p>
        )}

        {state === "ready" && season && (
          <div className="mt-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Stat label="Kilomètres cumulés" value={`${season.totalKm.toLocaleString("fr-FR")} km`} />
              <Stat label="Écopages estimés" value={season.totalScoops.toLocaleString("fr-FR")} />
            </div>
            <Stat
              label="Journée la plus intense"
              value={`${fmtDate(season.busiestDay.date)} · ${season.busiestDay.km.toLocaleString("fr-FR")} km`}
            />

            {season.topAircraft.length > 0 && (
              <div>
                <div className="mb-2 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Appareils les plus sollicités
                </div>
                <ul className="flex flex-col gap-1.5">
                  {season.topAircraft.map((a) => (
                    <li key={a.reg} className="flex items-center gap-2 text-[13px] text-ink">
                      <span
                        className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: CATEGORY_HEX[a.category] }}
                      />
                      <span className="font-semibold">{a.reg}</span>
                      <span className="tnum ml-auto text-ink-dim">
                        {a.km.toLocaleString("fr-FR")} km
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {season.topFoyers.length > 0 && (
              <div>
                <div className="mb-2 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
                  Foyers les plus traités
                </div>
                <ul className="flex flex-col gap-1.5">
                  {season.topFoyers.map((f) => (
                    <li key={f.name} className="flex items-center gap-2 text-[13px] text-ink">
                      <span>🔥</span>
                      <span>{f.name}</span>
                      <span className="tnum ml-auto text-ink-dim">
                        {f.days} jour{f.days > 1 ? "s" : ""}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <p className="text-[11px] leading-snug text-ink-faint">
              Estimations dérivées des seules traces ADS-B archivées chaque soir.
              Les feux étant relevés au jour le jour, ils ne sont pas rejoués sur les
              journées passées.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="rounded-md border border-line bg-raise/40 px-3 py-2">
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </div>
      <div className="tnum mt-0.5 font-display text-lg font-bold leading-tight text-ink">
        {value}
      </div>
    </div>
  );
}
