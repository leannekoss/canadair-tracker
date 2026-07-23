// Bandeau d'effort de la journée. Chiffres issus de buildRecap : ce sont des
// estimations dérivées des seules traces ADS-B (cf. /methodo.html).
export default function EffortBar({ recap, compact }) {
  if (!recap || recap.aircraftCount === 0) return null;

  // En français, 0 et 1 prennent le singulier.
  const plural = (n, sing, plur) => (n < 2 ? sing : plur);

  const items = [
    { v: recap.aircraftCount, l: plural(recap.aircraftCount, "appareil", "appareils") },
    { v: `${recap.totalKm.toLocaleString("fr-FR")} km`, l: "parcourus" },
    { v: `${Math.round(recap.flightHours)} h`, l: "de vol" },
    { v: recap.totalScoops, l: `${plural(recap.totalScoops, "écopage", "écopages")} est.`, hideCompact: true },
  ];

  return (
    <div
      className="mt-1 flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5 text-[11px] text-ink-dim md:text-xs"
      title="Estimations à partir des traces ADS-B"
    >
      {items
        .filter((it) => !(compact && it.hideCompact))
        .map((it, i) => (
          <span key={it.l} className="tnum whitespace-nowrap">
            {i > 0 && <span className="mr-2.5 text-ink-faint">·</span>}
            <strong className="font-semibold text-ink">{it.v}</strong> {it.l}
          </span>
        ))}
    </div>
  );
}
