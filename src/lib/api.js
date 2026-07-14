// Couche données : API airplanes.live
// - live : v2/mil (flotte d'État, dbFlags=1) + v2/type/AT8T (Air Tractors loués, filtre France)
//   → dev : proxy Vite /api · prod : appel direct (CORS ouvert chez airplanes.live)
// - trace du jour : /api/traces/... (dev : proxy Vite avec Referer · prod : fonction serverless)

const LIVE_BASE = import.meta.env.DEV ? "/api" : "https://api.airplanes.live";

const FRANCE_BBOX = { latMin: 41, latMax: 51.5, lonMin: -5.5, lonMax: 10 };

export function inFrance(ac) {
  return (
    ac.lat >= FRANCE_BBOX.latMin && ac.lat <= FRANCE_BBOX.latMax &&
    ac.lon >= FRANCE_BBOX.lonMin && ac.lon <= FRANCE_BBOX.lonMax
  );
}

function normalizeLive(ac) {
  return {
    hex: ac.hex?.toLowerCase(),
    callsign: (ac.flight ?? "").trim(),
    lat: ac.lat,
    lon: ac.lon,
    // alt_baro vaut "ground" quand l'appareil est au sol
    alt: ac.alt_baro === "ground" ? 0 : ac.alt_baro ?? null,
    onGround: ac.alt_baro === "ground",
    gs: ac.gs ?? null,
    track: ac.track ?? null,
    seen: ac.seen ?? null, // secondes depuis le dernier message
    type: ac.t ?? null,
    reg: ac.r ?? null,
  };
}

// Positions live des aéronefs d'État (dbFlags=1) — le filtrage flotte se fait dans useFleet
export async function fetchLiveMil() {
  const res = await fetch(`${LIVE_BASE}/v2/mil`);
  if (!res.ok) throw new Error(`live mil: HTTP ${res.status}`);
  const data = await res.json();
  return (data.ac ?? []).map(normalizeLive);
}

// Bombardiers d'eau non français au-dessus de la France : Canadairs de renfort
// européen (rescEU : I-, SX-, EC-…) et Air Tractors loués. Les types amphibies
// CL2T/CL4T et AT8T ne sont jamais des liners → le filtre bbox suffit.
export async function fetchLiveEuroBombers() {
  const res = await fetch(`${LIVE_BASE}/v2/type/CL4T,CL2T,AT8T`);
  if (!res.ok) throw new Error(`live bombers: HTTP ${res.status}`);
  const data = await res.json();
  return (data.ac ?? [])
    .filter((ac) => ac.lat != null && inFrance(ac))
    .map(normalizeLive);
}

// Trace tar1090 : [offset_s, lat, lon, alt|"ground", gs, track, flags, vert_rate, details?, src?, ...]
export function parseTrace(json) {
  const base = json.timestamp; // epoch (s) du premier point
  const points = (json.trace ?? []).map((p) => ({
    t: base + p[0],
    lat: p[1],
    lon: p[2],
    alt: p[3] === "ground" ? 0 : p[3],
    onGround: p[3] === "ground",
    gs: p[4],
    track: p[5],
  }));
  return {
    hex: json.icao?.toLowerCase(),
    reg: json.r ?? null,
    desc: json.desc ?? null,
    points,
    start: points[0]?.t ?? null,
    end: points[points.length - 1]?.t ?? null,
  };
}

// Trace du jour (fenêtre glissante ~24h) via le proxy. null si l'appareil n'a pas volé.
// 403 = panne du proxy Referer (systémique) : on la laisse remonter, sinon toute la
// flotte s'afficherait faussement comme « n'a pas volé ».
export async function fetchTodayTrace(hex) {
  const h = hex.toLowerCase();
  const res = await fetch(`/api/traces?hex=${h}`);
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`trace ${h}: HTTP ${res.status}`);
  return parseTrace(await res.json());
}

// Trace archivée (servie statiquement depuis data/archive/, copiée dans public/)
export async function fetchArchivedTrace(date, hex) {
  const h = hex.toLowerCase();
  const res = await fetch(`/archive/${date}/trace_full_${h}.json`);
  if (!res.ok) return null;
  return parseTrace(await res.json());
}

// Liste des journées archivées disponibles (index généré par le collecteur)
export async function fetchArchiveIndex() {
  const res = await fetch("/archive/index.json");
  if (!res.ok) return [];
  return res.json();
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
