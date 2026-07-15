// Panneau flotte façon « flight progress strips » du contrôle aérien.
// Un strip par appareil, groupés par famille, statut temps réel ou à l'instant du replay.

import { useState } from "react";
import { positionAt } from "../lib/replay";
import { aircraftKindLabel, CATEGORY_HEX } from "../theme";

const GROUPS = [
  { category: "canadair", title: "Pélican · CL-415", kind: "AVIONS" },
  { category: "dash", title: "Milan · Dash 8 MR", kind: "AVIONS" },
  { category: "airtractor", title: "Air Tractor", kind: "AVIONS" },
  { category: "dragon", title: "Dragon · EC145", kind: "HÉLICOPTÈRES" },
];

function fmtTime(t) {
  return new Date(t * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

function stripStatus(a, { mode, replayTime, liveMap, trails }) {
  const trail = trails[a.hex];
  if (mode === "replay") {
    const p = trail && positionAt(trail, replayTime);
    if (p) return { flying: true, alt: p.alt, gs: p.gs, onGround: p.onGround };
    if (trail) {
      return replayTime < trail.start
        ? { flying: false, note: `décolle ${fmtTime(trail.start)}` }
        : { flying: false, note: `vol terminé ${fmtTime(trail.end)}` };
    }
    return { flying: false, note: null };
  }
  const live = liveMap[a.hex];
  if (live && live.lat != null && (live.seen ?? 99) < 120) {
    return { flying: !live.onGround, alt: live.alt, gs: live.gs, onGround: live.onGround, callsign: live.callsign };
  }
  if (trail) return { flying: false, note: `dernier vol ${fmtTime(trail.end)}` };
  return { flying: false, note: null };
}

function Strip({ a, status, selected, onSelect }) {
  const color = CATEGORY_HEX[a.category] ?? "#94a1b5";
  const active = status.flying || status.onGround;
  return (
    <button
      onClick={() => onSelect(a.hex)}
      style={{ borderLeftColor: color }}
      aria-label={`Ouvrir ${aircraftKindLabel(a).toLowerCase()} ${status.callsign || a.reg}`}
      className={`group flex min-h-11 w-full items-center gap-2 border-l-[3px] px-3 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink ${
        selected ? "bg-raise" : "hover:bg-raise/60"
      } ${active ? "" : "opacity-55"}`}
    >
      <span className="font-display text-[15px] font-bold tracking-wide text-ink">
        {status.callsign || a.reg}
      </span>
      {status.callsign && (
        <span className="font-display text-xs font-medium text-ink-faint">{a.reg}</span>
      )}
      <span className="ml-auto text-right">
        {status.flying ? (
          <span className="tnum font-display text-xs font-semibold text-ink-dim">
            <span className="pulse-dot mr-1 inline-block h-1.5 w-1.5 rounded-full bg-live align-middle" />
            {status.alt != null ? `${Math.round(status.alt).toLocaleString("fr-FR")} ft` : ""}
            {status.gs != null ? ` · ${Math.round(status.gs)} kt` : ""}
          </span>
        ) : status.onGround ? (
          <span className="font-display text-xs font-semibold text-ink-dim">au sol · moteur on</span>
        ) : (
          <span className="font-display text-xs font-medium text-ink-faint">
            {status.note ?? "—"}
          </span>
        )}
      </span>
    </button>
  );
}

export default function FleetStrips({
  fleet, liveMap, trails, mode, replayTime, selectedHex, onSelect,
  className = "max-h-[62vh] w-64",
}) {
  const [kindFilter, setKindFilter] = useState("all");
  // Les longues listes restent fermées au chargement. Ce repli est purement
  // visuel : il ne masque jamais les appareils sur la carte.
  const [expandedCats, setExpandedCats] = useState(() => new Set());
  const toggleExpanded = (category) => {
    setExpandedCats((previous) => {
      const next = new Set(previous);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };
  const ctx = { mode, replayTime, liveMap, trails };
  const planeCount = fleet.filter((a) => a.category !== "dragon").length;
  const helicopterCount = fleet.filter((a) => a.category === "dragon").length;
  let previousKind = null;
  return (
    <div className={`pointer-events-auto flex flex-col overflow-y-auto overscroll-contain rounded-md border border-line bg-panel backdrop-blur-md ${className}`}>
      <nav className="sticky top-0 z-20 grid grid-cols-3 border-b border-line bg-surface/95 p-1" aria-label="Type d’appareil">
        {[
          ["all", "Tous", fleet.length],
          ["planes", "Avions", planeCount],
          ["helicopters", "Hélicos", helicopterCount],
        ].map(([value, label, count]) => (
          <button
            key={value}
            type="button"
            onClick={() => setKindFilter(value)}
            aria-pressed={kindFilter === value}
            className={`min-h-10 rounded px-2 font-display text-xs font-bold tracking-wide transition-colors focus-visible:outline-2 focus-visible:outline-ink ${
              kindFilter === value ? "bg-raise text-ink" : "text-ink-faint hover:text-ink"
            }`}
          >
            {label} <span className="tnum text-[10px] opacity-70">{count}</span>
          </button>
        ))}
      </nav>
      {GROUPS.map((g) => {
        if (kindFilter === "planes" && g.kind !== "AVIONS") return null;
        if (kindFilter === "helicopters" && g.kind !== "HÉLICOPTÈRES") return null;
        const members = fleet.filter((a) => a.category === g.category);
        if (!members.length) return null;
        const expanded = expandedCats.has(g.category);
        const statuses = members.map((a) => [a, stripStatus(a, ctx)]);
        const airborne = statuses.filter(([, s]) => s.flying).length;
        const showKind = previousKind !== g.kind;
        previousKind = g.kind;
        return (
          <section key={g.category}>
            {showKind && (
              <div className="sticky top-0 z-10 flex items-center gap-2 border-b border-line bg-surface/95 px-3 py-2 font-display text-[10px] font-bold tracking-[0.18em] text-ink">
                <span aria-hidden="true">{g.kind === "HÉLICOPTÈRES" ? "✣" : "✈"}</span>
                {g.kind}
              </div>
            )}
            {/* Le repli de liste est indépendant de la visibilité sur la carte. */}
            <button
              onClick={() => toggleExpanded(g.category)}
              aria-expanded={expanded}
              title={expanded ? "Replier la liste" : "Déplier la liste"}
              className="flex min-h-11 w-full items-center justify-between border-b border-line bg-panel-solid px-3 py-2 text-left focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-ink"
            >
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
                <span className="mr-1 inline-block w-2 text-ink-faint">{expanded ? "▾" : "▸"}</span>
                {g.title}
              </h2>
              <span className="tnum font-display text-[11px] font-semibold text-ink-faint">
                {airborne > 0 ? `${airborne} en vol` : members.length}
              </span>
            </button>
            {expanded &&
              statuses.map(([a, s]) => (
                <Strip key={a.hex} a={a} status={s} selected={a.hex === selectedHex} onSelect={onSelect} />
              ))}
          </section>
        );
      })}
    </div>
  );
}
