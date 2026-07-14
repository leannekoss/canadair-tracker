// Proxy serverless pour le flux RSS Google News (incendies France) :
// le XML est renvoyé brut, le parsing se fait côté client (DOMParser).
// CORS de news.google.com fermé aux navigateurs → passage obligé par ici.

const RSS_URL =
  "https://news.google.com/rss/search?q=" +
  encodeURIComponent('incendie OR canadair OR "feu de forêt" OR "sécurité civile"') +
  "&hl=fr&gl=FR&ceid=FR:fr";

export default async function handler(req, res) {
  let upstream;
  try {
    upstream = await fetch(RSS_URL, {
    headers: { "User-Agent": "CanadairTracker/1.0 (+mailto:hcasalis@gmail.com)" },
  });
  } catch {
    return res.status(502).json({ error: "amont indisponible" });
  }
  res.status(upstream.status);
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "s-maxage=600, stale-while-revalidate=1800");
  res.send(await upstream.text());
}
