// Proxy serverless pour les photos planespotters : l'API exige un User-Agent
// avec contact, header qu'un fetch navigateur ne peut pas définir.
// Usage : /api/photos?hex=3b7b6f

export default async function handler(req, res) {
  const hex = String(req.query.hex ?? "").toLowerCase();
  if (!/^[0-9a-f]{6}$/.test(hex)) {
    return res.status(400).json({ error: "paramètre hex invalide" });
  }
  let upstream;
  try {
    upstream = await fetch(`https://api.planespotters.net/pub/photos/hex/${hex}`, {
    headers: { "User-Agent": "CanadairTracker/1.0 (+mailto:hcasalis@gmail.com)" },
  });
  } catch {
    return res.status(502).json({ error: "amont indisponible" });
  }
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/json");
  // les photos d'un appareil changent rarement → cache CDN 24 h
  res.setHeader("Cache-Control", "s-maxage=86400, stale-while-revalidate=604800");
  res.send(await upstream.text());
}
