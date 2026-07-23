import { useState } from "react";
import { CATEGORY_HEX } from "../theme.js";

// Clé de lecture de la carte. Les couleurs viennent de CATEGORY_HEX (parité
// stricte avec les appareils dessinés par deck.gl) — jamais réécrites en dur.
const FAMILIES = [
  { category: "canadair", label: "Pélican", sub: "CL-415" },
  { category: "dash", label: "Milan", sub: "Dash 8" },
  { category: "airtractor", label: "Air Tractor", sub: "loués" },
  { category: "dragon", label: "Dragon", sub: "EC145" },
];

export default function Legend({ fleet, defaultOpen, showEvac }) {
  const [open, setOpen] = useState(defaultOpen ?? true);
  const present = new Set((fleet ?? []).map((a) => a.category));
  const rows = FAMILIES.filter((f) => present.has(f.category));

  return (
    <div className="pointer-events-auto w-max rounded-md border border-line bg-panel backdrop-blur-md">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-1.5 px-3 py-1.5 font-display text-xs font-semibold uppercase tracking-wide text-ink-dim"
      >
        Légende <span className="text-ink-faint">{open ? "▾" : "▸"}</span>
      </button>
      {open && (
        <div className="flex flex-col gap-1.5 px-3 pb-2.5 text-[12px] text-ink">
          {rows.map((f) => (
            <div className="flex items-center gap-2" key={f.category}>
              <span
                className="inline-block h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ background: CATEGORY_HEX[f.category] }}
              />
              <span>
                {f.label} <em className="not-italic text-ink-dim">{f.sub}</em>
              </span>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full bg-fire" />
            <span>Feu détecté par satellite</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-block h-0.5 w-3.5 shrink-0 rounded-sm bg-ink-dim" />
            <span>Trajectoire des dernières heures</span>
          </div>
          {showEvac && (
            <>
              <div className="mt-1 border-t border-line pt-1.5 font-display text-[10px] font-semibold uppercase tracking-wide text-ink-faint">
                Évacuation maritime
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "#d63426" }} />
                <span>Point d'embarquement</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: "#35c065" }} />
                <span>Point d'accueil</span>
              </div>
              <a
                href="/evacuation.html"
                className="text-[12px] font-semibold text-fire underline-offset-2 hover:underline"
              >
                Plan complet & numéros →
              </a>
            </>
          )}
        </div>
      )}
    </div>
  );
}
