// Hotspots incendies : détections thermiques VIIRS (NASA via ArcGIS Living Atlas).
// Endpoint public, sans clé, CORS ouvert (access-control-allow-origin: *) — validé le 14/07/2026.
// Champ hours_old fourni par le service ; données rafraîchies plusieurs fois par jour.

const VIIRS_URL =
  "https://services9.arcgis.com/RHVPKKiFTONKtxq3/arcgis/rest/services/" +
  "Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity/FeatureServer/0/query";

const FRANCE_BBOX = "-5.5,41,10,51.5";
const MAX_AGE_HOURS = 24;

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
