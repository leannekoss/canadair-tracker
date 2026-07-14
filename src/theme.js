// Tokens partagés JS ↔ deck.gl (les mêmes valeurs que @theme dans index.css)

export const CATEGORY_COLORS = {
  canadair: [214, 52, 38],     // #d63426
  dash: [184, 136, 15],        // #b8880f
  airtractor: [63, 142, 208],  // #3f8ed0
  dragon: [84, 168, 63],       // #54a83f
};

export const CATEGORY_HEX = {
  canadair: "#d63426",
  dash: "#b8880f",
  airtractor: "#3f8ed0",
  dragon: "#54a83f",
};

export const FIRE_COLOR = [255, 92, 51]; // #ff5c33 — statut réservé, jamais une série
export const INK = [237, 232, 220];
export const SURFACE = "#0b1017";

export const MAP_STYLE =
  "https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json";

// Vue satellite (Esri World Imagery, raster sans clé) — assombrie/désaturée pour
// que les trails colorés restent lisibles par-dessus
export const SATELLITE_STYLE = {
  version: 8,
  sources: {
    esri: {
      type: "raster",
      tiles: [
        "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      maxzoom: 18,
      attribution: "© Esri, Maxar, Earthstar Geographics",
    },
  },
  layers: [
    {
      id: "esri-imagery",
      type: "raster",
      source: "esri",
      paint: { "raster-brightness-max": 0.72, "raster-saturation": -0.2 },
    },
  ],
};

export const FRANCE_VIEW = { longitude: 2.6, latitude: 46.6, zoom: 5.4 };
export const FONTAINEBLEAU_VIEW = { longitude: 2.7, latitude: 48.42, zoom: 10.2 };
export const NIMES_GARONS = { longitude: 4.4165, latitude: 43.7574 }; // base avions Sécurité Civile

export function colorFor(meta) {
  return CATEGORY_COLORS[meta?.category] ?? [148, 161, 181];
}
