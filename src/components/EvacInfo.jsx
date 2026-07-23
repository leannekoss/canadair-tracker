// Couche « évacuation maritime » : bandeau (fil d'Ariane in-map vers le plan
// complet) et fiche d'un point cliqué. Les données viennent du plan officiel
// (public/evacuation-points.json) ; le PDF Préfecture maritime fait foi.

const ROLE = {
  embarquement: { label: "Embarquement", hex: "#d63426" },
  accueil: { label: "Accueil", hex: "#35c065" },
};

function dirUrl(p) {
  return `https://www.google.com/maps/dir/?api=1&destination=${p.lat},${p.lon}`;
}

// Bandeau en haut : signale la couche active et donne accès au plan complet.
export function EvacBanner({ onClose }) {
  return (
    <div className="pointer-events-auto flex items-center gap-2 rounded-md border border-fire/50 bg-panel px-3 py-1.5 backdrop-blur-md">
      <span className="h-2.5 w-2.5 shrink-0 rounded-full bg-fire" />
      <span className="font-display text-sm font-semibold tracking-wide text-ink">
        Évacuation maritime
      </span>
      <span className="hidden text-xs text-ink-dim sm:inline">· Lège-Cap-Ferret</span>
      <a
        href="/evacuation.html"
        className="ml-1 whitespace-nowrap text-xs font-semibold text-fire underline-offset-2 hover:underline"
      >
        Plan complet & numéros →
      </a>
      <button
        onClick={onClose}
        aria-label="Masquer la couche évacuation"
        className="ml-1 rounded px-1 text-base leading-none text-ink-dim hover:text-ink"
      >
        ✕
      </button>
    </div>
  );
}

// Fiche d'un point d'évacuation cliqué.
export function EvacCard({ point, onClose, className = "" }) {
  if (!point) return null;
  const role = ROLE[point.role] ?? { label: point.role, hex: "#94a1b5" };
  return (
    <article
      className={`pointer-events-auto overflow-hidden rounded-md border border-line bg-panel backdrop-blur-md ${className}`}
    >
      <div className="flex items-start justify-between gap-2 border-b border-line px-4 py-3">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: role.hex }} />
            <h2 className="font-display text-lg font-bold leading-none text-ink">{point.nom}</h2>
          </div>
          <p className="mt-1 text-[11px] text-ink-dim">
            {role.label} · {point.commune}
            {point.note ? ` · ${point.note}` : ""}
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
      <div className="flex flex-col gap-2 px-4 py-3">
        <a
          href={dirUrl(point)}
          target="_blank"
          rel="noopener noreferrer"
          className="rounded-md border border-line bg-raise/40 px-3 py-2 text-center font-display text-sm font-semibold text-ink transition-colors hover:bg-raise"
        >
          Itinéraire vers ce point ↗
        </a>
        <a
          href="/evacuation.html"
          className="text-center text-[12px] text-ink-dim transition-colors hover:text-ink"
        >
          Plan complet, numéros utiles & partage →
        </a>
      </div>
    </article>
  );
}
