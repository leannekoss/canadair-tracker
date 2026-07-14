// Projection Web Mercator bornée, pour dessiner trails + contour France en SVG
// (indépendant de MapLibre : rendu net et 100% capturable à l'export PNG).
// x ET y en radians Mercator (même unité) — sinon la France est écrasée.

const RAD = Math.PI / 180;
const mercX = (lon) => lon * RAD;
const mercY = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * RAD) / 2));

// bounds [lonMin, latMin, lonMax, latMax]. Retourne project(lon,lat)->[x,y] dans
// un cadre width×height avec padding, en préservant le ratio (fit "contain").
export function makeProjector(bounds, width, height, pad = 8) {
  const [lonMin, latMin, lonMax, latMax] = bounds;
  const xMin = mercX(lonMin), xMax = mercX(lonMax);
  const yTop = mercY(latMax), yBot = mercY(latMin); // nord = haut
  const xSpan = xMax - xMin, ySpan = yTop - yBot; // > 0
  const w = width - 2 * pad, h = height - 2 * pad;
  const scale = Math.min(w / xSpan, h / ySpan);
  const offX = pad + (w - xSpan * scale) / 2;
  const offY = pad + (h - ySpan * scale) / 2;
  return (lon, lat) => [
    offX + (mercX(lon) - xMin) * scale,
    offY + (yTop - mercY(lat)) * scale,
  ];
}

export const FRANCE_BOUNDS = [-5.2, 41.3, 9.7, 51.2];
