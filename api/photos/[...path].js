// Proxy serverless pour les photos planespotters : l'API exige un User-Agent
// avec contact, header qu'un fetch navigateur ne peut pas définir.
// Chemin attendu : /api/photos/hex/{hex}

const PATH_RE = /^hex\/[0-9a-f]{6}$/;

export default async function handler(req, res) {
  const parts = req.query.path ?? [];
  const path = Array.isArray(parts) ? parts.join("/") : parts;
  if (!PATH_RE.test(path)) {
    return res.status(400).json({ error: "chemin photo invalide" });
  }
  const upstream = await fetch(`https://api.planespotters.net/pub/photos/${path}`, {
    headers: { "User-Agent": "CanadairTracker/1.0 (+mailto:hcasalis@gmail.com)" },
  });
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/json");
  // les photos d'un appareil changent rarement → cache CDN 24 h
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  res.send(await upstream.text());
}
