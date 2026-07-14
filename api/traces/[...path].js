// Proxy serverless pour les traces tar1090 de globe.airplanes.live :
// le header Referer est obligatoire (403 sinon) et un navigateur ne peut pas le définir.
// Chemin attendu : /api/traces/{2 derniers hex}/trace_full_{hex}.json

const PATH_RE = /^[0-9a-f]{2}\/trace_full_[0-9a-f]{6}\.json$/;

export default async function handler(req, res) {
  const parts = req.query.path ?? [];
  const path = Array.isArray(parts) ? parts.join("/") : parts;
  if (!PATH_RE.test(path)) {
    return res.status(400).json({ error: "chemin de trace invalide" });
  }
  const upstream = await fetch(`https://globe.airplanes.live/data/traces/${path}`, {
    headers: { Referer: "https://globe.airplanes.live/" },
  });
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/json");
  // trace du jour : évolue en continu → cache CDN court
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
  res.send(await upstream.text());
}
