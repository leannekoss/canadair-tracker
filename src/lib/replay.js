// Interpolation des positions le long d'une trace pour le replay.
// Les traces tar1090 sont échantillonnées irrégulièrement (2s à 60s+ entre points).

// Position interpolée à l'instant t (epoch s). null si l'appareil n'est pas en vol à t
// (avant son premier point, après son dernier, ou trou de plus de `gapMax` secondes).
export function positionAt(trail, t, gapMax = 600) {
  const pts = trail.points;
  if (!pts.length || t < pts[0].t || t > pts[pts.length - 1].t + 60) return null;

  // recherche binaire du dernier point <= t
  let lo = 0, hi = pts.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >> 1;
    if (pts[mid].t <= t) lo = mid;
    else hi = mid - 1;
  }
  const a = pts[lo];
  const b = pts[lo + 1];
  if (!b) return { ...a, interpolated: false };
  if (b.t - a.t > gapMax) return null; // trou de couverture : ne pas inventer de position

  const f = (t - a.t) / (b.t - a.t || 1);
  const lerp = (x, y) => (x == null || y == null ? x ?? y : x + (y - x) * f);
  return {
    t,
    lat: lerp(a.lat, b.lat),
    lon: lerp(a.lon, b.lon),
    alt: lerp(a.alt, b.alt),
    gs: lerp(a.gs, b.gs),
    track: b.track ?? a.track,
    onGround: f < 0.5 ? a.onGround : b.onGround,
    interpolated: true,
  };
}

// Segments de vol d'une trace (séparés par des trous > gapMax) — pour les stats
export function flightSegments(trail, gapMax = 600) {
  const segs = [];
  let cur = [];
  for (const p of trail.points) {
    if (cur.length && p.t - cur[cur.length - 1].t > gapMax) {
      if (cur.length > 1) segs.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length > 1) segs.push(cur);
  return segs;
}

const R = 6371; // km
export function haversine(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

// Distance parcourue (km) sur l'ensemble de la trace
export function trailDistanceKm(trail) {
  let d = 0;
  const pts = trail.points;
  for (let i = 1; i < pts.length; i++) {
    if (pts[i].t - pts[i - 1].t > 600) continue; // ne pas compter les trous
    d += haversine(pts[i - 1].lat, pts[i - 1].lon, pts[i].lat, pts[i].lon);
  }
  return d;
}

// Fenêtre temporelle englobante d'un ensemble de traces
export function timeWindow(trails) {
  let start = Infinity, end = -Infinity;
  for (const tr of Object.values(trails)) {
    if (tr.start != null) start = Math.min(start, tr.start);
    if (tr.end != null) end = Math.max(end, tr.end);
  }
  return start < end ? { start, end } : null;
}
