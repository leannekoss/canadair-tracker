// Proxy serverless pour les traces tar1090 de globe.airplanes.live :
// le header Referer est obligatoire (403 sinon) et un navigateur ne peut pas le définir.
// Usage : /api/traces?hex=3b7b9f
// (chemin fixe + query : le routing catch-all [...path] de Vercel ne matche pas les
// chemins multi-segments hors Next.js)

export default async function handler(req, res) {
  const hex = String(req.query.hex ?? "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    return res.status(400).json({ error: "paramètre hex invalide" });
  }
  let upstream;
  try {
    upstream = await fetch(
      `https://globe.airplanes.live/data/traces/${hex.slice(-2)}/trace_full_${hex}.json`,
      { headers: { Referer: "https://globe.airplanes.live/" } }
    );
  } catch {
    return res.status(502).json({ error: "amont indisponible" });
  }
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/json");
  // trace du jour : évolue en continu → cache CDN court
  res.setHeader("Cache-Control", "s-maxage=120, stale-while-revalidate=600");
  res.send(await upstream.text());
}
