// Fiche appareil : photo planespotters, identité, données de vol, activité du jour.

import { useEffect, useState } from "react";
import { flightSegments, positionAt, trailDistanceKm } from "../lib/replay";
import { CATEGORY_HEX } from "../theme";

const photoCache = new Map();

function usePhoto(hex) {
  const [photo, setPhoto] = useState(photoCache.get(hex) ?? null);
  useEffect(() => {
    if (photoCache.has(hex)) {
      setPhoto(photoCache.get(hex));
      return;
    }
    let alive = true;
    fetch(`/api/photos?hex=${hex}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const p = d?.photos?.[0] ?? null;
        photoCache.set(hex, p);
        if (alive) setPhoto(p);
      })
      .catch(() => photoCache.set(hex, null));
    return () => {
      alive = false;
    };
  }, [hex]);
  return photo;
}

function fmtTime(t) {
  return new Date(t * 1000).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" });
}

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

export default function AircraftCard({ meta, live, trail, mode, replayTime, onClose }) {
  const photo = usePhoto(meta.hex);
  const color = CATEGORY_HEX[meta.category] ?? "#94a1b5";

  // Données affichées : replay = position interpolée, live = dernier message
  const pos = mode === "replay" && trail ? positionAt(trail, replayTime) : live;
  const flying = pos && pos.lat != null && !pos.onGround;
  const segments = trail ? flightSegments(trail) : [];
  const distKm = trail ? trailDistanceKm(trail) : null;

  return (
    <article className="pointer-events-auto w-72 overflow-hidden rounded-md border border-line bg-panel backdrop-blur-md">
      {photo?.thumbnail_large?.src && (
        <div className="relative">
          <img
            src={photo.thumbnail_large.src}
            alt={`${meta.model} ${meta.reg}`}
            className="h-36 w-full object-cover"
          />
          <span className="absolute bottom-1 right-1.5 text-[9px] text-ink-dim/80">
            © {photo.photographer} · planespotters.net
          </span>
        </div>
      )}
      <div className="p-3">
        <header className="flex items-start justify-between">
          <div>
            <h3 className="font-display text-2xl font-bold leading-none tracking-wide text-ink">
              {(mode === "live" && live?.callsign) || meta.reg}
            </h3>
            <p className="mt-1 text-xs text-ink-dim">
              <span style={{ color }} className="font-semibold">■</span> {meta.model} · {meta.reg}
              {meta.discovered && " · détecté auto"}
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Fermer"
            className="-mr-1 -mt-1 px-1.5 text-lg leading-none text-ink-faint transition-colors hover:text-ink"
          >
            ×
          </button>
        </header>

        <div className="mt-3 grid grid-cols-3 gap-x-3 gap-y-2.5">
          <Datum label="Altitude" value={flying && pos.alt != null ? Math.round(pos.alt).toLocaleString("fr-FR") : pos?.onGround ? "sol" : null} unit={flying ? "ft" : null} />
          <Datum label="Vitesse" value={flying && pos.gs != null ? Math.round(pos.gs) : null} unit="kt" />
          <Datum label="Cap" value={flying && pos.track != null ? `${Math.round(pos.track)}°` : null} />
          <Datum label="Distance jour" value={distKm != null && distKm > 1 ? Math.round(distKm).toLocaleString("fr-FR") : null} unit="km" />
          <Datum label="Rotations" value={segments.length || null} />
          <Datum
            label="Activité"
            value={trail ? `${fmtTime(trail.start)}–${fmtTime(trail.end)}` : null}
          />
        </div>
      </div>
    </article>
  );
}
