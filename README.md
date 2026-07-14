# Canadair Tracker

Suivi temps réel + replay des bombardiers d'eau de la Sécurité Civile française
(Canadair CL-415 « Pélican », Dash 8 MR « Milan », Air Tractors loués), avec
overlay des feux actifs (détections satellites VIIRS). Contexte : incendies de
l'été 2026, notamment Fontainebleau.

## Lancer

```bash
npm run dev        # → http://localhost:5173
```

Aucune clé API nécessaire. Le proxy Vite (vite.config.js) gère les trois
endpoints qui exigent des headers spécifiques.

## Utilisation

- **LIVE** : positions temps réel (poll 12 s), traîne des 2 dernières heures
- **Replay** : bouton ▶ ou déplacer le slider — rejoue la journée (×10/×60/×300)
- **Sélecteur de journée** : « Aujourd'hui » (traces 24 h glissantes airplanes.live)
  ou une journée archivée (`data/archive/`)
- Clic sur un appareil (carte ou strip) : fiche avec photo, alt/vitesse/cap,
  distance du jour, rotations
- **Feux** : hotspots VIIRS < 24 h, taille ∝ intensité (FRP), opacité ∝ fraîcheur

## Sources de données (gratuites, validées 07/2026)

| Donnée | Source | Particularité |
|---|---|---|
| Positions live | `api.airplanes.live/v2/mil` (+ `/v2/type/AT8T` filtré France) | CORS ouvert |
| Trace du jour | `globe.airplanes.live/data/traces/{xx}/trace_full_{hex}.json` | exige header `Referer` → proxy |
| Photos | `api.planespotters.net/pub/photos/hex/{hex}` | exige User-Agent avec contact → proxy |
| Feux | ArcGIS Living Atlas `Satellite_VIIRS_Thermal_Hotspots_and_Fire_Activity` | champ `hours_old`, CORS ouvert |

Registre flotte : `data/fleet.json` (12 CL-415 + 6 Dash 8, hex bloc `3b7bxx`,
constitué via adsbdb.com). Les appareils inconnus de type bombardier immatriculés
F-Z* et les AT-802 au-dessus de la France sont **auto-découverts** par le poll live.

## Archivage quotidien

`scripts/collect-traces.mjs` télécharge chaque soir les traces de la journée UTC
courante → `data/archive/YYYY-MM-DD/` + met à jour `index.json` (sélecteur UI).

- Job launchd : `~/Library/LaunchAgents/com.henri.canadair-collect.plist` (23 h 30)
- Manuel : `node scripts/collect-traces.mjs` (ou `--hex a,b,c` / `--date YYYY-MM-DD`)
- Log : `data/collect.log`

⚠️ Les traces tar1090 couvrent la **journée UTC** et basculent à minuit UTC
(02 h 00 Paris l'été) — d'où le passage du collecteur avant.

## Stack

React 18 · Vite 8 · Tailwind v4 · MapLibre GL (basemap CARTO dark) · deck.gl 9
(TripsLayer pour les trails animés). Palette catégorielle validée daltonisme
(ΔE ≥ 12) : Pélican `#d63426`, Milan `#b8880f`, Air Tractor `#3f8ed0`.
