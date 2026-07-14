#!/usr/bin/env node
// Archive les traces du jour (journée UTC courante) de la flotte Sécurité Civile.
// Usage : node scripts/collect-traces.mjs [--hex a1b2c3,d4e5f6] [--date YYYY-MM-DD]
// Sans --hex : lit data/fleet.json. Lancé chaque soir par launchd avant la bascule UTC.

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const TRACE_BASE = "https://globe.airplanes.live/data/traces";
const REFERER = "https://globe.airplanes.live/";

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : null;
}

const date = arg("date") ?? new Date().toISOString().slice(0, 10);
let hexes;
if (arg("hex")) {
  hexes = arg("hex").split(",").map((h) => h.trim().toLowerCase());
} else {
  const fleetPath = join(ROOT, "data", "fleet.json");
  if (!existsSync(fleetPath)) {
    console.error("ERREUR: data/fleet.json introuvable et pas de --hex fourni.");
    process.exit(1);
  }
  const fleet = JSON.parse(readFileSync(fleetPath, "utf8"));
  hexes = fleet.aircraft.map((a) => a.hex.toLowerCase());
}

const outDir = join(ROOT, "data", "archive", date);
mkdirSync(outDir, { recursive: true });

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let saved = 0, empty = 0, failed = 0;

// 1 retry après 5 s : un échec réseau transitoire ne doit pas coûter une trace
// (la fenêtre upstream glisse — non archivé ce soir = perdu)
async function fetchTrace(url) {
  try {
    return await fetch(url, { headers: { Referer: REFERER } });
  } catch {
    await sleep(5000);
    return fetch(url, { headers: { Referer: REFERER } });
  }
}

for (const hex of hexes) {
  const url = `${TRACE_BASE}/${hex.slice(-2)}/trace_full_${hex}.json`;
  try {
    const res = await fetchTrace(url);
    if (res.status === 404) {
      empty++;
      console.log(`--   ${hex}: pas de trace (n'a pas volé)`);
    } else if (res.ok) {
      const trace = JSON.parse(await res.text());
      // trace_full = fenêtre GLISSANTE ~24h (pas la journée UTC) : on ne garde que
      // les points de la journée étiquetée, sinon l'archive contient les vols de la veille
      const dayStart = Date.parse(`${date}T00:00:00Z`) / 1000;
      const dayEnd = dayStart + 86400;
      const kept = (trace.trace ?? []).filter((p) => {
        const t = trace.timestamp + p[0];
        return t >= dayStart && t < dayEnd;
      });
      if (kept.length < 2) {
        empty++;
        console.log(`--   ${hex}: aucun point sur la journée ${date}`);
      } else {
        const base = trace.timestamp + kept[0][0];
        const rebased = kept.map((p) => [p[0] - (base - trace.timestamp), ...p.slice(1)]);
        const out = { ...trace, timestamp: base, trace: rebased };
        writeFileSync(join(outDir, `trace_full_${hex}.json`), JSON.stringify(out));
        saved++;
        console.log(`OK   ${hex} (${trace.r ?? "?"}): ${kept.length} points (journée ${date})`);
      }
    } else {
      failed++;
      console.error(`FAIL ${hex}: HTTP ${res.status}`);
    }
  } catch (e) {
    failed++;
    console.error(`FAIL ${hex}: ${e.message}`);
  }
  await sleep(400);
}

// Reconstruit l'index des archives (consommé par l'UI pour le sélecteur de date)
import { readdirSync } from "node:fs";
const archiveRoot = join(ROOT, "data", "archive");
const index = readdirSync(archiveRoot, { withFileTypes: true })
  .filter((e) => e.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(e.name))
  .sort()
  .map((e) => ({
    date: e.name,
    hexes: readdirSync(join(archiveRoot, e.name))
      .filter((f) => f.startsWith("trace_full_"))
      .map((f) => f.replace("trace_full_", "").replace(".json", "")),
  }))
  .filter((e) => e.hexes.length > 0); // pas de journée vide dans le sélecteur
writeFileSync(join(archiveRoot, "index.json"), JSON.stringify(index, null, 1));

console.log(`\n${date} → ${outDir}`);
console.log(`Bilan: ${saved} traces sauvées, ${empty} sans vol, ${failed} échecs · index: ${index.length} journée(s)`);
if (failed > 0) process.exit(1); // échouer fort : un échec réseau ne doit pas passer pour un succès
