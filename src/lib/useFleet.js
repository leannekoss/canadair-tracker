// État central de la flotte : positions live (poll 12s) + trails (traces du jour ou archive).
// Auto-découverte : tout appareil F-Z* de type bombardier vu dans /v2/mil (ou AT-802 sur la France)
// absent de fleet.json est ajouté dynamiquement — les nouveaux Dash/DHC-515 apparaîtront seuls.

import { useCallback, useEffect, useRef, useState } from "react";
import fleetData from "../../data/fleet.json";
import {
  fetchArchivedTrace,
  fetchArchiveIndex,
  fetchLiveEuroBombers,
  fetchLiveMil,
  fetchTodayTrace,
  sleep,
} from "./api";

const POLL_MS = 12_000;
const AT8T_EVERY_N_TICKS = 5; // Air Tractors : 1 tick sur 5 (ils changent peu)
const TRACE_REFRESH_MS = 10 * 60_000; // resync complet des traces du jour

const BOMBER_TYPES = new Set(["CL4T", "CL2T", "DH8D", "AT8T"]);

function discoveredMeta(ac) {
  const family =
    ac.type === "DH8D" ? "Milan" :
    ac.type === "AT8T" ? "Air Tractor" : "Pélican";
  return {
    hex: ac.hex,
    reg: ac.reg ?? "?",
    type: ac.type,
    model: family === "Air Tractor" ? "Air Tractor AT-802" : family,
    category: ac.type === "DH8D" ? "dash" : ac.type === "AT8T" ? "airtractor" : "canadair",
    family,
    callsign_prefix: null,
    discovered: true,
  };
}

export function useFleet() {
  const [fleet, setFleet] = useState(fleetData.aircraft);
  const [liveMap, setLiveMap] = useState({});   // hex → position live normalisée
  const [trails, setTrails] = useState({});      // hex → trace parsée {points,...}
  const [archiveIndex, setArchiveIndex] = useState([]);
  const [selectedDate, setSelectedDate] = useState("today");
  const [trailsLoading, setTrailsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [error, setError] = useState(null);

  const fleetRef = useRef(fleet);
  fleetRef.current = fleet;
  const dateRef = useRef(selectedDate);
  dateRef.current = selectedDate;
  const loadSeq = useRef(0); // invalide les chargements de trails obsolètes

  // --- Trails (traces du jour ou archive) --------------------------------
  // reset=true : changement de journée (on repart de zéro, l'UI passe en chargement).
  // reset=false : resync périodique — on merge trace par trace SANS vider, sinon la
  // carte se blanke et le replay en cours perd sa fenêtre pendant 10-30 s.
  const loadTrails = useCallback(async (date, { reset = true } = {}) => {
    const seq = ++loadSeq.current;
    if (reset) {
      setTrailsLoading(true);
      setTrails({});
    }
    const hexes =
      date === "today"
        ? fleetRef.current.map((a) => a.hex)
        : (await fetchArchiveIndex()).find((d) => d.date === date)?.hexes ?? [];
    for (const hex of hexes) {
      if (loadSeq.current !== seq) return; // l'utilisateur a changé de date
      try {
        const trace =
          date === "today" ? await fetchTodayTrace(hex) : await fetchArchivedTrace(date, hex);
        if (trace && trace.points.length > 1) {
          setTrails((prev) => ({ ...prev, [hex]: trace }));
        }
      } catch (e) {
        console.warn(`trail ${hex}:`, e.message);
      }
      await sleep(120); // politesse rate limit
    }
    if (reset && loadSeq.current === seq) setTrailsLoading(false);
  }, []);

  useEffect(() => {
    loadTrails(selectedDate);
  }, [selectedDate, loadTrails]);

  // resync périodique des traces du jour (elles grossissent au fil de la journée)
  useEffect(() => {
    if (selectedDate !== "today") return;
    const id = setInterval(() => loadTrails("today", { reset: false }), TRACE_REFRESH_MS);
    return () => clearInterval(id);
  }, [selectedDate, loadTrails]);

  // --- Index des archives --------------------------------------------------
  useEffect(() => {
    fetchArchiveIndex().then(setArchiveIndex).catch(() => setArchiveIndex([]));
  }, []);

  // --- Poll live -----------------------------------------------------------
  useEffect(() => {
    let tick = 0;
    let stopped = false;
    // les bombardiers étrangers ne sont rafraîchis qu'1 tick sur 5 : on garde leur
    // dernière position entre-temps, sinon ils clignotent (absents 48 s par minute)
    let extrasCache = { list: [], at: 0 };

    async function poll() {
      try {
        const hexSet = new Set(fleetRef.current.map((a) => a.hex));
        const mil = await fetchLiveMil();
        const relevant = mil.filter(
          (ac) =>
            hexSet.has(ac.hex) ||
            (BOMBER_TYPES.has(ac.type) && (ac.reg ?? "").startsWith("F-Z"))
        );
        if (tick % AT8T_EVERY_N_TICKS === 0) {
          extrasCache = { list: await fetchLiveEuroBombers(), at: Date.now() };
        }
        tick++;
        if (stopped) return;
        const extras = Date.now() - extrasCache.at < 120_000 ? extrasCache.list : [];

        // auto-découverte (dédupliquée : un hex peut apparaître dans mil ET extras)
        const seen = new Set(fleetRef.current.map((a) => a.hex));
        const newcomers = [...relevant, ...extras].filter(
          (ac) => ac.hex && !seen.has(ac.hex) && (seen.add(ac.hex), true)
        );
        if (newcomers.length) {
          setFleet((prev) => [...prev, ...newcomers.map(discoveredMeta)]);
        }

        const merged = {};
        for (const ac of [...relevant, ...extras]) merged[ac.hex] = ac;
        setLiveMap(merged);
        setLastUpdate(Date.now());
        setError(null);

        // en vue "aujourd'hui", on prolonge les trails avec les positions live
        if (dateRef.current === "today") {
          setTrails((prev) => {
            let changed = false;
            const next = { ...prev };
            for (const ac of Object.values(merged)) {
              if (ac.lat == null) continue;
              const t = Date.now() / 1000 - (ac.seen ?? 0);
              const trail = next[ac.hex];
              const point = {
                t, lat: ac.lat, lon: ac.lon, alt: ac.alt,
                onGround: ac.onGround, gs: ac.gs, track: ac.track,
              };
              if (!trail) {
                next[ac.hex] = {
                  hex: ac.hex, reg: ac.reg, desc: null,
                  points: [point], start: t, end: t, liveOnly: true,
                };
                changed = true;
              } else if (t - trail.end > 5) {
                next[ac.hex] = {
                  ...trail,
                  points: [...trail.points, point],
                  end: t,
                };
                changed = true;
              }
            }
            return changed ? next : prev;
          });
        }
      } catch (e) {
        if (!stopped) setError(e.message);
      }
    }

    poll();
    const id = setInterval(poll, POLL_MS);
    return () => {
      stopped = true;
      clearInterval(id);
    };
  }, []);

  return {
    fleet,
    liveMap,
    trails,
    trailsLoading,
    archiveIndex,
    selectedDate,
    setSelectedDate,
    lastUpdate,
    error,
  };
}
