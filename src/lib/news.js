// Feed news incendies : RSS Google News via /api/news (proxy), parsé avec DOMParser.

export async function fetchNews() {
  const res = await fetch("/api/news");
  if (!res.ok) throw new Error(`news: HTTP ${res.status}`);
  const xml = await res.text();
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  return [...doc.querySelectorAll("item")].slice(0, 15).map((item) => {
    const text = (tag) => item.querySelector(tag)?.textContent?.trim() ?? "";
    // Google News suffixe le titre avec " - Source"
    const rawTitle = text("title");
    const source = text("source") || rawTitle.split(" - ").at(-1);
    const title = rawTitle.replace(new RegExp(` - ${source}$`), "");
    return {
      title,
      source,
      link: text("link"),
      date: text("pubDate") ? new Date(text("pubDate")) : null,
    };
  });
}
