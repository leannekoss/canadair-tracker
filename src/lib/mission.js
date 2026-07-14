// Analyse de mission d'un appareil à partir de sa trace : passages par foyer,
// écopages (amphibies) et posés intermédiaires (recharges retardant).
// Heuristiques sur données ADS-B → ESTIMATIONS, à présenter comme telles.

import { haversine } from "./replay";
import { NIMES_GARONS } from "../theme";

const FOYER_RADIUS_KM = 6;
const DROP_ALT_FT = 1500;      // passage bas sur foyer = largage probable
const SCOOP_MAX_ALT_FT = 200;  // écopage : au ras de l'eau…
const SCOOP_MIN_KT = 55;       // …à vitesse d'écopage
const SCOOP_MAX_KT = 130;
const SCOOP_MAX_S = 90;        // un écopage dure < 1 min 30
const CLIMB_ALT_FT = 400;      // remontée après écopage (sinon = atterrissage)
const GROUND_STOP_S = 180;     // posé > 3 min = escale (recharge/avitaillement)

function isLow(p) {
  return p.onGround || (p.alt != null && p.alt <= SCOOP_MAX_ALT_FT);
}

// Passages dans le rayon de chaque foyer (1 passage ≈ 1 rotation sur le feu)
export function foyerPasses(trail, foyers) {
  return foyers
    .map((f) => {
      let passes = 0;
      let lowPasses = 0;
      let inside = false;
      let lowThisPass = false;
      for (const p of trail.points) {
        const near = haversine(p.lat, p.lon, f.lat, f.lon) < FOYER_RADIUS_KM;
        if (near && !inside) {
          passes++;
          lowThisPass = false;
        }
        if (near && p.alt != null && p.alt < DROP_ALT_FT && !lowThisPass) {
          lowPasses++;
          lowThisPass = true;
        }
        inside = near;
      }
      return { name: f.name, lat: f.lat, lon: f.lon, passes, lowPasses };
    })
    .filter((f) => f.passes > 0)
    .sort((a, b) => b.passes - a.passes);
}

// Écopages : séquence courte au ras de l'eau à vitesse d'écopage, loin de la base,
// suivie d'une remontée (sinon c'est un atterrissage).
export function detectScoops(trail) {
  const pts = trail.points;
  const scoops = [];
  let start = null;
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i];
    const scooping =
      isLow(p) && p.gs != null && p.gs >= SCOOP_MIN_KT && p.gs <= SCOOP_MAX_KT &&
      haversine(p.lat, p.lon, NIMES_GARONS.latitude, NIMES_GARONS.longitude) > 3;
    if (scooping && start == null) start = i;
    if (!scooping && start != null) {
      const dur = pts[i - 1].t - pts[start].t;
      // remontée dans les 3 min qui suivent ?
      let climbs = false;
      for (let j = i; j < pts.length && pts[j].t - pts[i - 1].t < 180; j++) {
        if (pts[j].alt != null && pts[j].alt > CLIMB_ALT_FT) {
          climbs = true;
          break;
        }
      }
      if (dur >= 4 && dur <= SCOOP_MAX_S && climbs) {
        const mid = pts[Math.floor((start + i - 1) / 2)];
        scoops.push({ lat: mid.lat, lon: mid.lon, t: mid.t });
      }
      start = null;
    }
  }
  // regroupe par plan d'eau (~3 km)
  const clusters = new Map();
  for (const s of scoops) {
    const key = `${Math.round(s.lat / 0.03)}:${Math.round(s.lon / 0.03)}`;
    let c = clusters.get(key);
    if (!c) clusters.set(key, (c = { latSum: 0, lonSum: 0, count: 0 }));
    c.latSum += s.lat;
    c.lonSum += s.lon;
    c.count++;
  }
  return [...clusters.values()]
    .map((c) => ({ lat: c.latSum / c.count, lon: c.lonSum / c.count, count: c.count }))
    .sort((a, b) => b.count - a.count);
}

// Posés intermédiaires (> 3 min au sol au milieu de la trace) : recharges
// retardant des Dash sur pélicandromes, avitaillements…
export function groundStops(trail) {
  const pts = trail.points;
  const stops = [];
  let start = null;
  for (let i = 0; i < pts.length; i++) {
    const grounded = pts[i].onGround || (pts[i].gs != null && pts[i].gs < 30 && isLow(pts[i]));
    if (grounded && start == null) start = i;
    if (!grounded && start != null) {
      if (pts[i - 1].t - pts[start].t >= GROUND_STOP_S && start > 0 && i < pts.length - 1) {
        const mid = pts[Math.floor((start + i - 1) / 2)];
        stops.push({ lat: mid.lat, lon: mid.lon, t: mid.t });
      }
      start = null;
    }
  }
  // dédoublonne par lieu (~3 km)
  const seen = new Set();
  return stops.filter((s) => {
    const key = `${Math.round(s.lat / 0.03)}:${Math.round(s.lon / 0.03)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function analyzeMission(trail, foyers) {
  if (!trail || trail.points.length < 2) return null;
  return {
    foyerStats: foyerPasses(trail, foyers ?? []),
    scoopClusters: detectScoops(trail),
    stops: groundStops(trail),
  };
}
