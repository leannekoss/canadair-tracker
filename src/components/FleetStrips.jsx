// Panneau flotte façon « flight progress strips » du contrôle aérien.
// Un strip par appareil, groupés par famille, statut temps réel ou à l'instant du replay.

import { positionAt } from "../lib/replay";
import { CATEGORY_HEX } from "../theme";

const GROUPS = [
  { category: "canadair", title: "Pélican · CL-415" },
  { category: "dash", title: "Milan · Dash 8 MR" },
  { category: "airtractor", title: "Air Tractor" },
  { category: "dragon", title: "Dragon · EC145" },
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
      className={`group flex w-full items-baseline gap-2 border-l-[3px] px-2.5 py-1.5 text-left transition-colors ${
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
  hiddenCats, onToggleCategory,
}) {
  const ctx = { mode, replayTime, liveMap, trails };
  return (
    <div className="pointer-events-auto flex max-h-[62vh] w-64 flex-col overflow-y-auto rounded-md border border-line bg-panel backdrop-blur-md">
      {GROUPS.map((g) => {
        const members = fleet.filter((a) => a.category === g.category);
        if (!members.length) return null;
        const hidden = hiddenCats?.has(g.category);
        const statuses = members.map((a) => [a, stripStatus(a, ctx)]);
        const airborne = statuses.filter(([, s]) => s.flying).length;
        return (
          <section key={g.category}>
            {/* cliquer l'en-tête replie le groupe ET masque la famille sur la carte */}
            <button
              onClick={() => onToggleCategory?.(g.category)}
              title={hidden ? "Afficher sur la carte" : "Masquer sur la carte"}
              className={`sticky top-0 flex w-full items-baseline justify-between border-b border-line bg-panel-solid px-2.5 pb-1 pt-2 text-left ${hidden ? "opacity-50" : ""}`}
            >
              <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.14em] text-ink-dim">
                <span className="mr-1 inline-block w-2 text-ink-faint">{hidden ? "▸" : "▾"}</span>
                {g.title}
              </h2>
              <span className="tnum font-display text-[11px] font-semibold text-ink-faint">
                {hidden ? "masqué" : airborne > 0 ? `${airborne} en vol` : members.length}
              </span>
            </button>
            {!hidden &&
              statuses.map(([a, s]) => (
                <Strip key={a.hex} a={a} status={s} selected={a.hex === selectedHex} onSelect={onSelect} />
              ))}
          </section>
        );
      })}
    </div>
  );
}
