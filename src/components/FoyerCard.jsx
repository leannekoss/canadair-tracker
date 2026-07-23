// Fiche foyer : commune, intensité (FRP), ancienneté, et surtout les appareils
// passés dessus dans la journée (foyerPasses, estimation ADS-B). Termine par un
// encart « en amont » vers la détection des départs de feu (kanari.io).
import { CATEGORY_HEX } from "../theme";

const FAMILY_LABEL = {
  canadair: "Pélican",
  dash: "Milan",
  airtractor: "Air Tractor",
  dragon: "Dragon",
};

function Datum({ label, value, unit }) {
  return (
    <div>
      <div className="font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
        {label}
      </div>
      <div className="tnum font-display text-lg font-bold leading-tight text-ink">
        {value ?? "—"}
        {value != null && unit && (
          <span className="ml-0.5 text-xs font-semibold text-ink-dim">{unit}</span>
        )}
      </div>
    </div>
  );
}

export default function FoyerCard({ foyer, passes, onClose, className = "" }) {
  if (!foyer) return null;
  const ageLabel =
    foyer.minAge == null || foyer.minAge >= 99
      ? null
      : foyer.minAge < 1
        ? "< 1 h"
        : `${Math.round(foyer.minAge)} h`;

  return (
    <article
      className={`pointer-events-auto overflow-hidden rounded-md border border-line bg-panel backdrop-blur-md ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="text-base">{foyer.active ? "🔥" : "🌫"}</span>
            <h2 className="font-display text-xl font-bold leading-none text-ink">
              {foyer.name}
            </h2>
          </div>
          <p className="mt-1 text-[11px] text-ink-dim">
            {foyer.active ? "Foyer actif" : "En extinction / sous surveillance"}
          </p>
        </div>
        <button
          onClick={onClose}
          aria-keyshortcuts="Escape"
          className="shrink-0 rounded px-2 py-1 text-lg leading-none text-ink-dim hover:text-ink"
        >
          ✕
        </button>
      </div>

      <div className="grid grid-cols-3 gap-3 px-4 py-3">
        <Datum label="Intensité" value={foyer.frp?.toLocaleString("fr-FR")} unit="MW" />
        <Datum label="Détections" value={foyer.count} />
        <Datum label="Vue il y a" value={ageLabel} />
      </div>

      <div className="border-t border-line px-4 py-3">
        <div className="mb-2 font-display text-[10px] font-semibold uppercase tracking-[0.14em] text-ink-faint">
          Appareils passés sur ce foyer (estimation ADS-B)
        </div>
        {passes && passes.length > 0 ? (
          <ul className="flex flex-col gap-1.5">
            {passes.map((p) => (
              <li key={p.reg} className="flex items-center gap-2 text-[13px] text-ink">
                <span
                  className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ background: CATEGORY_HEX[p.category] }}
                />
                <span className="font-semibold">{p.reg}</span>
                <span className="text-ink-dim">{FAMILY_LABEL[p.category] ?? p.family}</span>
                <span className="tnum ml-auto text-ink-dim">
                  {p.passes} passage{p.passes > 1 ? "s" : ""} est.
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[12px] leading-snug text-ink-dim">
            Aucun passage détecté. Les appareils volant bas (largage, écopage)
            échappent souvent au suivi ADS-B : l'absence de détection ne signifie
            pas l'absence d'intervention.
          </p>
        )}
      </div>

      <a
        href="https://kanari.io/"
        target="_blank"
        rel="noopener noreferrer"
        className="block border-t border-line px-4 py-2.5 text-[12px] text-ink-dim transition-colors hover:text-ink"
      >
        Détecter les départs de feu en temps réel : <strong className="text-ink">kanari</strong> →
      </a>
    </article>
  );
}
