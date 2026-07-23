# Lisibilité grand public & partage — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rendre Canadair Tracker compréhensible en quelques secondes par un visiteur LinkedIn non initié, et faire en sorte que le lien partagé s'affiche avec un visuel.

**Architecture:** Application React 18 + Vite + deck.gl/MapLibre, sans framework de test. La boucle de vérification est donc `npm run build` (aucune erreur) + contrôle visuel dans le navigateur via chrome-devtools sur la production locale (`npm run dev`). Les chantiers 1 à 3 n'ajoutent aucune donnée : ils exposent des valeurs déjà calculées dans `src/lib/`.

**Tech Stack:** React 18, Vite 8, deck.gl 9, MapLibre 5, Tailwind 4, html-to-image.

## Global Constraints

- Texte français, ton sobre. Tirets `-` jamais `—` dans le texte destiné à l'affichage.
- Les valeurs de mission (écopages, rotations, passages) sont des HEURISTIQUES ADS-B : le mot « estimé » ou « estimation » doit accompagner tout chiffre de ce type. Détail des heuristiques uniquement dans `/methodo.html`.
- Couleurs des familles : lire `CATEGORY_HEX` de `src/theme.js`, ne jamais réécrire les hex en dur ailleurs.
- Image de partage : URL absolue `https://canadair-tracker.vercel.app/og.jpg`, < 5 Mo, versionnée dans le dépôt.
- Aucun nouveau paquet npm sauf nécessité absolue (règle projet).
- Commits en français, une phrase à l'impératif.

---

### Task 1 : Carte de partage social (chantier 0)

**Files:**
- Modify: `index.html` (balises `<head>`)
- Create: `public/og.jpg` (image 1200×630)
- Create: `scripts/make-og.mjs` (script de capture reproductible)

**Interfaces:**
- Consumes: rien.
- Produces: fichier statique `/og.jpg` référencé par les balises `og:image`.

- [ ] **Step 1 : Ajouter les balises meta dans `index.html`**

Dans `<head>`, après la balise `theme-color`, insérer :

```html
    <meta name="description" content="Suivi en temps réel et rejeu des avions bombardiers d'eau de la Sécurité Civile française (Canadair, Dash 8, Air Tractor) avec les feux actifs détectés par satellite." />
    <meta property="og:type" content="website" />
    <meta property="og:url" content="https://canadair-tracker.vercel.app/" />
    <meta property="og:title" content="Canadair Tracker — les bombardiers d'eau en direct" />
    <meta property="og:description" content="Où sont les Canadair, Milan et Air Tractor de la Sécurité Civile, et sur quels feux ils interviennent. Carte live + rejeu de la journée." />
    <meta property="og:image" content="https://canadair-tracker.vercel.app/og.jpg" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="Canadair Tracker — les bombardiers d'eau en direct" />
    <meta name="twitter:description" content="Carte live + rejeu des avions bombardiers d'eau de la Sécurité Civile française." />
    <meta name="twitter:image" content="https://canadair-tracker.vercel.app/og.jpg" />
```

- [ ] **Step 2 : Écrire le script de capture `scripts/make-og.mjs`**

Le script part d'une capture de la carte en vue France (prise via chrome-devtools ou une capture manuelle enregistrée dans `scripts/`), la redimensionne/recadre en 1200×630, incruste le titre et enregistre `public/og.jpg`. Sans dépendance lourde : utiliser `sharp` seulement s'il est déjà présent, sinon composer via un canvas HTML capturé. Approche retenue par défaut (zéro dépendance) : ouvrir `public/og.html` (un gabarit 1200×630 avec la capture en fond + titre en CSS) dans le navigateur et le capturer en `og.jpg`.

Créer `public/og.html` : un document 1200×630 fond `#0b1017`, une image de fond (capture carte), un bandeau titre « CANADAIR TRACKER » + sous-titre « Les bombardiers d'eau de la Sécurité Civile, en direct » en police Barlow auto-hébergée.

- [ ] **Step 3 : Générer l'image**

Ouvrir `http://localhost:5173/og.html` (ou le fichier), capturer en 1200×630, enregistrer `public/og.jpg` (qualité ~85, viser < 400 Ko).

Run : `npm run dev` puis capture chrome-devtools de `/og.html` à viewport `1200x630`.
Expected : `public/og.jpg` existe, 1200×630, < 5 Mo.

- [ ] **Step 4 : Vérifier le build et le HTML servi**

Run : `npm run build`
Expected : build OK. Puis `npx vite preview` + `curl -s http://localhost:4173/ | grep og:image` doit renvoyer la balise.

- [ ] **Step 5 : Commit**

```bash
git add index.html public/og.jpg public/og.html scripts/make-og.mjs
git commit -m "Ajoute la carte de partage social (Open Graph + image)"
```

Note post-déploiement : après push, valider le rendu via le LinkedIn Post Inspector (l'utilisateur le fait) ; LinkedIn cache agressivement, une seule bonne première capture compte.

---

### Task 2 : Légende et clé de lecture (chantier 1)

**Files:**
- Create: `src/components/Legend.jsx`
- Modify: `src/App.jsx` (montage du composant + état d'ouverture)
- Modify: `public/methodo.html` (origine des indicatifs)

**Interfaces:**
- Consumes: `CATEGORY_HEX`, `AIRCRAFT_KIND` de `src/theme.js` ; la liste `fleet` (pour ne montrer que les familles réellement suivies).
- Produces: `<Legend fleet={fleet} />` — composant autonome, aucun état remonté.

- [ ] **Step 1 : Écrire `src/components/Legend.jsx`**

```jsx
import { useState } from "react";
import { CATEGORY_HEX } from "../theme.js";

// Familles dans l'ordre d'affichage, avec libellé lisible.
const FAMILIES = [
  { category: "canadair", label: "Pélican", sub: "CL-415" },
  { category: "dash", label: "Milan", sub: "Dash 8" },
  { category: "airtractor", label: "Air Tractor", sub: "loués" },
  { category: "dragon", label: "Dragon", sub: "EC145" },
];

export default function Legend({ fleet }) {
  const [open, setOpen] = useState(true);
  const present = new Set((fleet ?? []).map((a) => a.category));
  const rows = FAMILIES.filter((f) => present.has(f.category));

  return (
    <div className="legend">
      <button className="legend-head" onClick={() => setOpen((o) => !o)}>
        Légende {open ? "▾" : "▸"}
      </button>
      {open && (
        <div className="legend-body">
          {rows.map((f) => (
            <div className="legend-row" key={f.category}>
              <span className="legend-dot" style={{ background: CATEGORY_HEX[f.category] }} />
              <span>{f.label} <em>{f.sub}</em></span>
            </div>
          ))}
          <div className="legend-row">
            <span className="legend-dot" style={{ background: "#ff5c33" }} />
            <span>Feu détecté par satellite</span>
          </div>
          <div className="legend-row">
            <span className="legend-line" />
            <span>Trajectoire des dernières heures</span>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Styles dans `src/index.css`**

Ajouter les classes `.legend`, `.legend-head`, `.legend-body`, `.legend-row`, `.legend-dot` (rond 10px), `.legend-line` (trait 14×2px, couleur `#8aa`) en cohérence avec les panneaux existants (fond semi-opaque `#0b1017`, texte `#ede8dc`). Sur mobile (`max-width: 767px`), `.legend` repliée par défaut : initialiser `open` à `window.matchMedia("(min-width: 768px)").matches`.

- [ ] **Step 3 : Monter le composant dans `App.jsx`**

Importer `Legend` et le placer dans le rendu, en bas à gauche de la carte (au-dessus du bloc « Sources & méthodologie »). Lui passer `fleet`.

- [ ] **Step 4 : Ajouter l'origine des indicatifs dans `methodo.html`**

Dans la section flotte de `public/methodo.html`, une phrase : l'indicatif « Pélican » vient des premiers Catalina PBY mis en service en 1963 ; « Milan » désigne les Dash 8 ; « Dragon » les hélicoptères EC145.

- [ ] **Step 5 : Vérifier**

Run : `npm run build` (OK) puis `npm run dev`, capture chrome-devtools desktop (1440px) et mobile (`emulate 390x844,mobile`).
Expected : légende visible et lisible desktop ; repliée mobile ; couleurs identiques aux appareils sur la carte.

- [ ] **Step 6 : Commit**

```bash
git add src/components/Legend.jsx src/App.jsx src/index.css public/methodo.html
git commit -m "Ajoute une légende et la clé de lecture de la carte"
```

---

### Task 3 : Compteur de feux honnête (chantier 5)

**Files:**
- Modify: `src/App.jsx` (libellé du bouton/compteur « Feux … »)
- Modify: `public/methodo.html` (préciser la zone)

**Interfaces:**
- Consumes: `fires` (déjà dans l'état de `App.jsx`), `MAX_AGE_HOURS` conceptuel (72 h, fenêtre de requête de `fires.js`).
- Produces: rien.

- [ ] **Step 1 : Repérer le libellé actuel**

Run : `grep -n "Feux" src/App.jsx`
Expected : la ligne qui rend « Feux {n} ».

- [ ] **Step 2 : Reformuler le libellé**

Remplacer le libellé par une forme qui expose le périmètre, p. ex. `Feux {n} · zone France` avec une infobulle `title="Détections satellite VIIRS des 72 dernières heures, zone France élargie"`. Ne pas prétendre à un décompte strictement national (la bbox `-5.5,41,10,51.5` déborde sur les pays voisins).

- [ ] **Step 3 : Préciser dans `methodo.html`**

Ajouter que le compteur porte sur une zone rectangulaire englobant la France métropolitaine (débordant légèrement sur les pays limitrophes), sur 72 h.

- [ ] **Step 4 : Vérifier**

Run : `npm run build` (OK) puis contrôle visuel du header.
Expected : le compteur et le filtre ne se contredisent plus.

- [ ] **Step 5 : Commit**

```bash
git add src/App.jsx public/methodo.html
git commit -m "Explicite le périmètre du compteur de feux"
```

---

### Task 4 : Bandeau d'effort du jour (chantier 2)

**Files:**
- Modify: `src/App.jsx` (calcul `recap` toujours actif + montage du bandeau)
- Create: `src/components/EffortBar.jsx`

**Interfaces:**
- Consumes: `buildRecap(trails, fleetByHex, recapFoyers)` de `src/lib/recap.js` → objet `{ aircraftCount, totalKm, totalScoops, flightHours, ... }`.
- Produces: `<EffortBar recap={recap} compact={!isDesktop} />`.

- [ ] **Step 1 : Rendre `recap` toujours calculé dans `App.jsx`**

Aujourd'hui `recap` n'est calculé que si `showRecap`. Le bandeau en a besoin en continu. Modifier le `useMemo` :

```jsx
// Bilan de la journée : calculé en continu (bandeau d'effort + poster).
const recap = useMemo(
  () => buildRecap(trails, fleetByHex, recapFoyers),
  [trails, fleetByHex, recapFoyers]
);
```

Le poster `DayRecap` continue de consommer ce même `recap` : aucun double calcul (le coût O(points × foyers) n'est payé qu'une fois par changement de `trails`).

- [ ] **Step 2 : Écrire `src/components/EffortBar.jsx`**

```jsx
// Bandeau d'effort du jour. Chiffres issus de buildRecap (heuristiques ADS-B).
export default function EffortBar({ recap, compact }) {
  if (!recap || recap.aircraftCount === 0) return null;
  const items = [
    { v: recap.aircraftCount, l: "appareils" },
    { v: recap.totalKm.toLocaleString("fr-FR") + " km", l: "parcourus" },
    { v: recap.flightHours.toFixed(0) + " h", l: "de vol" },
    { v: recap.totalScoops, l: "écopages est.", hideCompact: true },
  ];
  return (
    <div className="effortbar" title="Estimations à partir des traces ADS-B">
      {items
        .filter((it) => !(compact && it.hideCompact))
        .map((it) => (
          <span className="effort-item" key={it.l}>
            <strong>{it.v}</strong> {it.l}
          </span>
        ))}
    </div>
  );
}
```

- [ ] **Step 3 : Styles `.effortbar` / `.effort-item` dans `index.css`**

Ligne horizontale compacte, séparateurs discrets, cohérente avec le header.

- [ ] **Step 4 : Monter dans le header de `App.jsx`**

Importer `EffortBar`, le placer sous le titre « Bombardiers d'eau · Sécurité Civile … », lui passer `recap` et `compact={!isDesktop}`.

- [ ] **Step 5 : Vérifier**

Run : `npm run build` (OK) puis `npm run dev`, capture desktop + mobile.
Expected : chiffres visibles immédiatement, cohérents avec le poster Bilan ; le mot « est. » présent sur les écopages ; sur mobile, écopages masqués.

- [ ] **Step 6 : Commit**

```bash
git add src/components/EffortBar.jsx src/App.jsx src/index.css
git commit -m "Affiche l'effort du jour en bandeau dans le header"
```

---

### Task 5 : Fiche foyer enrichie + encart Kanari (chantiers 3 et 6)

**Files:**
- Create: `src/components/FoyerCard.jsx`
- Modify: `src/App.jsx` (état `selectedFoyer` + montage) et `src/components/MapView.jsx` (clic sur un foyer)

**Interfaces:**
- Consumes: `foyerPasses(trail, foyers)` de `src/lib/mission.js` → `[{ name, passes, lowPasses }]` ; la liste `trails` et `fleetByHex`.
- Produces: `<FoyerCard foyer={selectedFoyer} passes={...} onClose={...} />`.

- [ ] **Step 1 : Exposer le clic foyer dans `MapView.jsx`**

Le calque des foyers doit être `pickable`. Ajouter au `onClick` de la carte : si l'objet cliqué est un foyer, appeler `props.onFoyerClick(foyer)`. Repérer le calque des foyers (`grep -n "foyer\|cluster" src/components/MapView.jsx`) et lui passer `pickable: true`.

- [ ] **Step 2 : Calculer les passages par appareil pour un foyer, dans `App.jsx`**

```jsx
// Appareils passés sur le foyer sélectionné aujourd'hui (estimation ADS-B).
const foyerPassesByAircraft = useMemo(() => {
  if (!selectedFoyer) return [];
  const rows = [];
  for (const hex of Object.keys(trails)) {
    const meta = fleetByHex[hex];
    if (!meta) continue;
    const hits = foyerPasses(trails[hex], [selectedFoyer]);
    if (hits[0]?.passes > 0) rows.push({ reg: meta.reg, family: meta.family, category: meta.category, passes: hits[0].passes });
  }
  return rows.sort((a, b) => b.passes - a.passes);
}, [selectedFoyer, trails, fleetByHex]);
```

Importer `foyerPasses` depuis `src/lib/mission.js` (déjà importé pour `analyzeMission` ? vérifier l'import existant).

- [ ] **Step 3 : Écrire `src/components/FoyerCard.jsx`**

Affiche : commune (`foyer.name`), intensité (`frp`), ancienneté (`minAge` h), nombre de détections (`count`), puis la liste `passes` par appareil avec pastille couleur (`CATEGORY_HEX[category]`) et « n passage(s) est. ». Si `passes` est vide : bloc « Aucun passage détecté » + phrase « les appareils volant bas échappent souvent au suivi ADS-B ; absence de détection ne signifie pas absence d'intervention. » En pied de carte, l'encart Kanari :

```jsx
<a className="foyer-kanari" href="https://kanari.io/" target="_blank" rel="noopener">
  Détecter les départs de feu en temps réel : kanari →
</a>
```

- [ ] **Step 4 : Câbler dans `App.jsx`**

Ajouter `const [selectedFoyer, setSelectedFoyer] = useState(null);`, passer `onFoyerClick={setSelectedFoyer}` à `MapView`, monter `<FoyerCard>` quand `selectedFoyer`. Fermer au clic ailleurs / touche Échap (suivre le motif existant de `AircraftCard`).

- [ ] **Step 5 : Lien Kanari dans `methodo.html`**

Dans la section sources de `public/methodo.html`, ajouter Kanari (détection amont des départs de feu) à côté des autres sources.

- [ ] **Step 6 : Vérifier**

Run : `npm run build` (OK) puis `npm run dev`. Cliquer un foyer avec passages connus (ex. Milan sur Noisy-sur-École le 13/07 en replay) et un foyer sans passage.
Expected : fiche affiche commune + appareils intervenus ; foyer sans passage affiche le disclaimer ; lien Kanari cliquable.

- [ ] **Step 7 : Commit**

```bash
git add src/components/FoyerCard.jsx src/App.jsx src/components/MapView.jsx public/methodo.html
git commit -m "Fiche foyer : appareils intervenus et lien de détection amont"
```

---

### Task 6 : Vue saison (chantier 4)

**Files:**
- Create: `src/lib/season.js` (agrégation multi-journées)
- Modify: `src/components/FleetStrips.jsx` ou le panneau Historique (affichage du cumul)

**Interfaces:**
- Consumes: `archiveIndex` (liste des journées archivées, déjà dans `useFleet`), et pour chaque journée son récapitulatif (`buildRecap`). Charger les journées à la demande via le même mécanisme que le replay.
- Produces: `buildSeason(dailyRecaps)` → `{ days, totalKm, busiestDay, topFoyers, topAircraft, since }`.

- [ ] **Step 1 : Écrire `buildSeason` dans `src/lib/season.js`**

```js
// Agrège plusieurs bilans journaliers en un cumul de saison.
// dailyRecaps : [{ date, recap }] où recap vient de buildRecap.
export function buildSeason(dailyRecaps) {
  const days = dailyRecaps.filter((d) => d.recap && d.recap.aircraftCount > 0);
  if (days.length === 0) return null;
  const totalKm = days.reduce((s, d) => s + d.recap.totalKm, 0);
  const busiestDay = days.reduce((a, b) => (b.recap.totalKm > a.recap.totalKm ? b : a));
  const foyerCount = new Map();
  const kmByReg = new Map();
  for (const d of days) {
    for (const name of d.recap.foyersHit) foyerCount.set(name, (foyerCount.get(name) ?? 0) + 1);
    for (const a of d.recap.top) kmByReg.set(a.reg, (kmByReg.get(a.reg) ?? 0) + a.distKm);
  }
  const topFoyers = [...foyerCount.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  const topAircraft = [...kmByReg.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5);
  return {
    days: days.length,
    totalKm,
    busiestDay: { date: busiestDay.date, km: busiestDay.recap.totalKm },
    topFoyers,
    topAircraft,
    since: days[days.length - 1]?.date ?? null,
  };
}
```

- [ ] **Step 2 : Charger les récaps de toutes les journées archivées**

Dans le panneau Historique, au premier affichage de la vue saison, charger séquentiellement les traces de chaque `archiveIndex` puis appliquer `buildRecap` (sans foyers, car les feux ne sont pas ré-appliqués à une archive — cf. règle existante `recapFoyers`). Mémoriser le résultat pour éviter les rechargements.

- [ ] **Step 3 : Afficher le cumul**

Un bloc « Depuis le {since} » : nombre de journées, total km, journée la plus intense, top foyers, top appareils. Afficher explicitement la période (« depuis le 14 juillet 2026 ») pour ne pas laisser croire à une couverture de toute la saison.

- [ ] **Step 4 : Vérifier**

Run : `npm run build` (OK) puis `npm run dev`, ouvrir la vue saison.
Expected : cumul cohérent (total km ≥ km du jour le plus intense), période affichée, pas d'erreur console si une journée est vide.

- [ ] **Step 5 : Commit**

```bash
git add src/lib/season.js src/components/FleetStrips.jsx
git commit -m "Ajoute la vue saison : cumul depuis le début de l'archive"
```

---

### Task 7 : README vitrine (chantier 7)

**Files:**
- Modify: `README.md`
- Réutiliser: `public/og.jpg` comme capture d'en-tête

**Interfaces:** aucune (documentation).

- [ ] **Step 1 : Restructurer le README**

Ajouter en tête la capture (`public/og.jpg` ou une capture dédiée), puis un tableau des sources de données (donnée · fournisseur · fréquence · limite connue) repris de `methodo.html`, un court résumé d'architecture (SPA Vite + deck.gl/MapLibre, fonctions serverless `api/traces.js` / `api/photos.js`, archivage GitHub Action 21h45 UTC), et le lien méthodo. Rester factuel, pas de survente.

- [ ] **Step 2 : Vérifier le rendu**

Run : prévisualiser le Markdown (le tableau s'aligne, l'image s'affiche).
Expected : README lisible, présentable sur la page GitHub.

- [ ] **Step 3 : Commit**

```bash
git add README.md
git commit -m "README vitrine : capture, sources et architecture"
```

---

## Ordre et jalons de déploiement

- **Jalon A** (Tasks 1, 2, 3) : partage + légende + compteur honnête → push, valider le lien LinkedIn.
- **Jalon B** (Tasks 4, 5) : bandeau d'effort + fiche foyer + Kanari → push.
- **Jalon C** (Tasks 6, 7) : vue saison + README → push.

Chaque push sur `main` redéploie automatiquement sur Vercel.

## Hors périmètre

- Migration feux vers NASA FIRMS (l'actuelle fonctionne ; FIRMS documenté comme repli).
- Couche analytique GeoSQL (décision 16/07 : quand l'archive aura mûri).
- Reprise de l'architecture de rendu deck.gl.
