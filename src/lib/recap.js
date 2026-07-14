// Synthèse « Bilan de la journée » : agrège les traces d'une journée en chiffres
// clés + classement des appareils. Toutes les valeurs dérivent des traces ADS-B
// (mêmes heuristiques que la fiche appareil) → estimations, à présenter comme telles.

import { flightSegments, trailDistanceKm, timeWindow } from "./replay";
import { detectScoops, foyerPasses } from "./mission";

const MIN_FLIGHT_KM = 5; // en dessous : bruit ADS-B, pas un vol réel

export function buildRecap(trails, fleetByHex, foyers) {
  const flown = Object.values(trails)
    .map((tr) => {
      const meta = fleetByHex[tr.hex];
      if (!meta) return null;
      const distKm = trailDistanceKm(tr);
      if (distKm < MIN_FLIGHT_KM) return null;
      const segments = flightSegments(tr);
      const scoops = detectScoops(tr).reduce((s, c) => s + c.count, 0);
      const passes = foyerPasses(tr, foyers ?? []);
      const rotations = passes.reduce((s, f) => s + f.passes, 0);
      const flightSeconds = segments.reduce(
        (s, seg) => s + (seg[seg.length - 1].t - seg[0].t),
        0
      );
      return {
        hex: tr.hex,
        reg: meta.reg,
        family: meta.family,
        category: meta.category,
        distKm: Math.round(distKm),
        flights: segments.length,
        scoops,
        rotations,
        flightSeconds,
        foyers: passes.map((f) => f.name),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.distKm - a.distKm);

  const win = timeWindow(trails);
  const foyersHit = [...new Set(flown.flatMap((a) => a.foyers))];

  return {
    aircraftCount: flown.length,
    totalKm: flown.reduce((s, a) => s + a.distKm, 0),
    totalFlights: flown.reduce((s, a) => s + a.flights, 0),
    totalScoops: flown.reduce((s, a) => s + a.scoops, 0),
    totalRotations: flown.reduce((s, a) => s + a.rotations, 0),
    flightHours: flown.reduce((s, a) => s + a.flightSeconds, 0) / 3600,
    byFamily: aggregateByFamily(flown),
    top: flown.slice(0, 6),
    foyersHit,
    window: win,
  };
}

function aggregateByFamily(flown) {
  const m = new Map();
  for (const a of flown) {
    const e = m.get(a.family) ?? { family: a.family, category: a.category, count: 0, km: 0 };
    e.count += 1;
    e.km += a.distKm;
    m.set(a.family, e);
  }
  return [...m.values()].sort((a, b) => b.km - a.km);
}
