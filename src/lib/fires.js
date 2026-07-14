// Hotspots incendies : détections thermiques VIIRS (NASA via ArcGIS Living Atlas).
// Endpoint public, sans clé, CORS ouvert (access-control-allow-origin: *) — validé le 14/07/2026.
// Champ hours_old fourni par le service ; données rafraîchies plusieurs fois par jour.

const VIIRS_URL =
  "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/" +
  "Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query";

const FRANCE_BBOX = "-5.5,41,10,51.5";
const MAX_AGE_HOURS = 72;        // fenêtre de requête (foyers récents « sous surveillance »)
export const ACTIVE_AGE_HOURS = 24; // au-delà : plus de braise sur la carte, foyer « en extinction »

// Regroupe les hotspots en foyers (grille ~0.15° ≈ 15 km), triés par puissance totale.
export function clusterFires(fires, cell = 0.15, top = 8) {
  const buckets = new Map();
  for (const f of fires) {
    const key = `${Math.round(f.lat / cell)}:${Math.round(f.lon / cell)}`;
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { latW: 0, lonW: 0, sumW: 0, frp: 0, count: 0, minAge: 99 }));
    const w = Math.max(f.frp ?? 0, 1);
    b.latW += f.lat * w;
    b.lonW += f.lon * w;
    b.sumW += w;
    b.frp += f.frp ?? 0;
    b.count += 1;
    b.minAge = Math.min(b.minAge, f.ageHours ?? 99);
  }
  const all = [...buckets.values()].map((b) => ({
    lat: b.latW / b.sumW,
    lon: b.lonW / b.sumW,
    frp: Math.round(b.frp),
    count: b.count,
    minAge: b.minAge,
    active: b.minAge <= ACTIVE_AGE_HOURS, // sinon : « en extinction / sous surveillance »
  }));
  // beaucoup de petites détections (écobuages, industriel) : seuils pour rester lisible
  const actives = all
    .filter((c) => c.active && c.count >= 3)
    .sort((a, b) => b.frp - a.frp)
    .slice(0, top);
  const fading = all
    .filter((c) => !c.active && c.count >= 3 && c.frp >= 50)
    .sort((a, b) => b.frp - a.frp)
    .slice(0, 3);
  return [...actives, ...fading];
}

// Nomme un foyer par sa commune (geo.api.gouv.fr, sans clé, CORS ouvert).
// NB : pas BAN /reverse — celle-ci cherche des ADRESSES proches et renvoie []
// en pleine forêt, là où naissent précisément les feux.
const geoCache = new Map();
export async function communeName(lat, lon) {
  return reverseName(lat, lon);
}
async function reverseName(lat, lon) {
  const key = `${lat.toFixed(2)},${lon.toFixed(2)}`;
  if (geoCache.has(key)) return geoCache.get(key);
  let name = null; // null = hors France (aucune commune) → foyer exclu du sélecteur
  try {
    const res = await fetch(
      `https://geo.api.gouv.fr/communes?lat=${lat.toFixed(4)}&lon=${lon.toFixed(4)}&fields=nom,codeDepartement`
    );
    if (res.ok) {
      const [c] = await res.json();
      if (c?.nom) name = `${c.nom}${c.codeDepartement ? ` (${c.codeDepartement})` : ""}`;
      geoCache.set(key, name); // réponse valide : cacher aussi le null (vrai hors France)
    }
  } catch {
    // échec transitoire (réseau, 5xx) : NE PAS cacher — un foyer français serait
    // exclu du sélecteur pour toute la session ; on retentera au prochain refresh
  }
  return name;
}

// Foyers nommés, France (métropole + Corse + DOM) uniquement — la bbox de requête
// VIIRS déborde sur les pays voisins, le géocodage par commune sert de frontière.
export async function namedFireClusters(fires) {
  const clusters = clusterFires(fires);
  const named = await Promise.all(
    clusters.map(async (c) => {
      const name = await reverseName(c.lat, c.lon);
      return name ? { ...c, name } : null;
    })
  );
  return named.filter(Boolean);
}

export async function fetchFires() {
  const params = new URLSearchParams({
    where: `hours_old<=${MAX_AGE_HOURS}`,
    geometry: FRANCE_BBOX,
    geometryType: "esriGeometryEnvelope",
    inSR: "4326",
    spatialRel: "esriSpatialRelIntersects",
    outFields: "frp,confidence,hours_old",
    returnGeometry: "true",
    f: "geojson",
  });
  const res = await fetch(`${VIIRS_URL}?${params}`);
  if (!res.ok) throw new Error(`VIIRS: HTTP ${res.status}`);
  const data = await res.json();
  return (data.features ?? []).map((f) => ({
    lon: f.geometry.coordinates[0],
    lat: f.geometry.coordinates[1],
    frp: f.properties.frp ?? 0,          // Fire Radiative Power (MW)
    confidence: f.properties.confidence, // low | nominal | high
    ageHours: f.properties.hours_old,
  }));
}
