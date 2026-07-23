import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView.jsx";
import TimeBar from "./components/TimeBar.jsx";
import FleetStrips from "./components/FleetStrips.jsx";
import AircraftCard from "./components/AircraftCard.jsx";
import NewsFeed from "./components/NewsFeed.jsx";
import DayRecap from "./components/DayRecap.jsx";
import Legend from "./components/Legend.jsx";
import EffortBar from "./components/EffortBar.jsx";
import FoyerCard from "./components/FoyerCard.jsx";
import SeasonPanel from "./components/SeasonPanel.jsx";
import { EvacCard } from "./components/EvacInfo.jsx";
import { useFleet } from "./lib/useFleet.js";
import { positionAt, timeWindow } from "./lib/replay.js";
import { ACTIVE_AGE_HOURS, fetchFires, namedFireClusters } from "./lib/fires.js";
import { analyzeMission, foyerPasses } from "./lib/mission.js";
import { buildRecap } from "./lib/recap.js";
import { FRANCE_VIEW, CAP_FERRET_VIEW } from "./theme.js";

const REPLAY_TICK_MS = 50;
const FIRES_REFRESH_MS = 15 * 60_000;

// Montage conditionnel réel des panneaux desktop/mobile : le simple `hidden md:`
// laisserait deux instances montées (double fetch NewsFeed, strips fantômes).
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(
    () => window.matchMedia("(min-width: 768px)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = (e) => setIsDesktop(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

export default function App() {
  const {
    fleet, liveMap, trails, trailsLoading,
    archiveIndex, selectedDate, setSelectedDate,
    lastUpdate, error,
  } = useFleet();

  const isDesktop = useIsDesktop();
  const [mode, setMode] = useState("live");
  const [replayTime, setReplayTime] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [selectedHex, setSelectedHex] = useState(null);
  const [selectedFoyer, setSelectedFoyer] = useState(null);
  const [showFires, setShowFires] = useState(true);
  const [showFleet, setShowFleet] = useState(true); // desktop
  const [showNews, setShowNews] = useState(false); // desktop
  const [mobilePanel, setMobilePanel] = useState(null); // mobile : 'fleet' | 'news' | null
  const [foyers, setFoyers] = useState([]);
  const [satellite, setSatellite] = useState(false);
  const [showRecap, setShowRecap] = useState(false);
  const [showSeason, setShowSeason] = useState(false);
  const [evacPoints, setEvacPoints] = useState([]);
  const [showEvac, setShowEvac] = useState(
    () => new URLSearchParams(window.location.search).get("evac") === "1"
  );
  const [selectedEvac, setSelectedEvac] = useState(null);
  const [fires, setFires] = useState([]);
  const [, setClockTick] = useState(0); // re-render 1s : horloge + avance du fade live
  const mapRef = useRef(null);

  const fleetByHex = useMemo(
    () => Object.fromEntries(fleet.map((a) => [a.hex, a])),
    [fleet]
  );
  const win = useMemo(() => timeWindow(trails), [trails]);
  const t0 = win?.start ?? null;

  // Analyse de mission de l'appareil sélectionné (A-R par foyer, écopages, posés)
  const mission = useMemo(() => {
    const trail = selectedHex ? trails[selectedHex] : null;
    return trail ? analyzeMission(trail, foyers) : null;
  }, [selectedHex, trails, foyers]);

  // Appareils passés sur le foyer sélectionné aujourd'hui (estimation ADS-B).
  const foyerPassesByAircraft = useMemo(() => {
    if (!selectedFoyer) return [];
    const rows = [];
    for (const hex of Object.keys(trails)) {
      const meta = fleetByHex[hex];
      if (!meta) continue;
      const hits = foyerPasses(trails[hex], [selectedFoyer]);
      if (hits[0]?.passes > 0) {
        rows.push({ reg: meta.reg, family: meta.family, category: meta.category, passes: hits[0].passes });
      }
    }
    return rows.sort((a, b) => b.passes - a.passes);
  }, [selectedFoyer, trails, fleetByHex]);

  // Les hotspots VIIRS chargés sont ceux d'aujourd'hui. Ne jamais les appliquer
  // rétroactivement à une archive : on garderait les bons vols mais de faux feux.
  const recapFoyers = selectedDate === "today" ? foyers : [];

  // Bilan de la journée sélectionnée : calculé en continu (bandeau d'effort +
  // poster). Un seul calcul partagé — le coût O(points × foyers) n'est payé
  // qu'une fois par changement de trails/foyers, pas deux.
  const recap = useMemo(
    () => buildRecap(trails, fleetByHex, recapFoyers),
    [trails, fleetByHex, recapFoyers]
  );
  const dateLabel = useMemo(() => {
    const d = selectedDate === "today" ? new Date() : new Date(selectedDate + "T12:00:00Z");
    return d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
  }, [selectedDate]);

  // Horloge : re-render léger toutes les secondes
  useEffect(() => {
    const id = setInterval(() => setClockTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // Avance du replay
  useEffect(() => {
    if (!playing || mode !== "replay" || !win) return;
    const id = setInterval(() => {
      setReplayTime((t) => {
        const next = (t ?? win.start) + (REPLAY_TICK_MS / 1000) * speed;
        if (next >= win.end) {
          setPlaying(false);
          return win.end;
        }
        return next;
      });
    }, REPLAY_TICK_MS);
    return () => clearInterval(id);
  }, [playing, mode, speed, win]);

  // Changement de journée : une archive se regarde en replay depuis le début
  useEffect(() => {
    if (selectedDate === "today") {
      setMode("live");
      setPlaying(false);
    } else {
      setMode("replay");
      setPlaying(false);
      setReplayTime(null); // sera calé sur la fenêtre une fois les traces chargées
    }
  }, [selectedDate]);

  // ne caler le début du replay qu'une fois la journée entièrement chargée :
  // pendant le chargement, la fenêtre ne couvre que les premières traces et le
  // replay démarrerait à un instant arbitraire (ex. le vol de nuit d'un Dragon)
  useEffect(() => {
    if (mode === "replay" && replayTime == null && win && !trailsLoading) {
      setReplayTime(win.start);
    }
  }, [mode, replayTime, win, trailsLoading]);

  // Hotspots incendies + foyers nommés (clusters triés par puissance)
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchFires()
        .then(async (f) => {
          if (!alive) return;
          // braises sur la carte : détections récentes · foyers : fenêtre élargie
          setFires(f.filter((x) => x.ageHours <= ACTIVE_AGE_HOURS));
          const clusters = await namedFireClusters(f);
          if (alive) setFoyers(clusters);
        })
        .catch((e) => console.warn("fires:", e.message));
    load();
    const id = setInterval(load, FIRES_REFRESH_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, []);

  const flyTo = useCallback((view) => {
    mapRef.current?.flyTo({
      center: [view.longitude, view.latitude],
      zoom: view.zoom,
      duration: 1800,
      essential: true,
    });
  }, []);

  // Points du plan d'évacuation maritime (chargés une fois).
  useEffect(() => {
    fetch("/evacuation-points.json")
      .then((r) => r.json())
      .then((d) => setEvacPoints(d.points ?? []))
      .catch(() => {});
  }, []);

  // Deep-link ?evac=1 : cadrer sur le Cap-Ferret au chargement.
  useEffect(() => {
    if (showEvac) flyTo(CAP_FERRET_VIEW);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleScrub = useCallback((t) => {
    setMode("replay");
    setReplayTime(t);
  }, []);

  const handlePlayToggle = useCallback(() => {
    if (mode === "live") {
      setMode("replay");
      setReplayTime(win?.start ?? null);
      setPlaying(true);
    } else {
      // relance depuis le début si on est arrivé au bout
      if (!playing && win && replayTime != null && replayTime >= win.end - 1) {
        setReplayTime(win.start);
      }
      setPlaying((p) => !p);
    }
  }, [mode, playing, win, replayTime]);

  const handleGoLive = useCallback(() => {
    setMode("live");
    setPlaying(false);
  }, []);

  // Raccourcis globaux — ignorés dans les contrôles de saisie pour ne jamais
  // interférer avec le sélecteur de date, le slider ou d'autres formulaires.
  useEffect(() => {
    const onKeyDown = (event) => {
      const target = event.target;
      const editing = target instanceof HTMLElement && (
        target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA"].includes(target.tagName)
      );
      if (event.repeat || event.metaKey || event.ctrlKey || event.altKey || editing) return;

      const key = event.key.toLowerCase();
      if (key === "escape") {
        if (showSeason) setShowSeason(false);
        else if (showRecap) setShowRecap(false);
        else if (selectedEvac) setSelectedEvac(null);
        else if (selectedFoyer) setSelectedFoyer(null);
        else if (selectedHex) setSelectedHex(null);
        else if (mobilePanel) setMobilePanel(null);
        else if (showNews) setShowNews(false);
        return;
      }
      if (key === "f") {
        event.preventDefault();
        if (isDesktop) setShowFleet((value) => !value);
        else setMobilePanel((panel) => (panel === "fleet" ? null : "fleet"));
      } else if (key === "a") {
        event.preventDefault();
        if (isDesktop) setShowNews((value) => !value);
        else setMobilePanel((panel) => (panel === "news" ? null : "news"));
      } else if (key === "b") {
        event.preventDefault();
        setShowRecap((value) => !value);
      } else if (key === "s") {
        event.preventDefault();
        setShowSeason((value) => !value);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isDesktop, mobilePanel, selectedHex, selectedFoyer, selectedEvac, showNews, showRecap, showSeason]);

  const airborne =
    mode === "replay"
      ? Object.values(trails).filter((tr) => {
          if (!fleetByHex[tr.hex]) return false;
          const p = positionAt(tr, replayTime ?? 0);
          return p && !p.onGround;
        }).length
      : Object.values(liveMap).filter(
          (ac) => ac.lat != null && !ac.onGround && fleetByHex[ac.hex]
        ).length;
  const airborneByKind = useMemo(() => {
    const current = mode === "replay"
      ? fleet.filter((a) => {
          const p = trails[a.hex] && positionAt(trails[a.hex], replayTime ?? 0);
          return p && !p.onGround;
        })
      : fleet.filter((a) => {
          const ac = liveMap[a.hex];
          return ac?.lat != null && !ac.onGround;
        });
    return {
      planes: current.filter((a) => a.category !== "dragon").length,
      helicopters: current.filter((a) => a.category === "dragon").length,
    };
  }, [fleet, liveMap, mode, replayTime, trails]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-surface">
      <MapView
        fleetByHex={fleetByHex}
        trails={trails}
        liveMap={liveMap}
        mode={mode}
        replayTime={replayTime ?? win?.end ?? 0}
        t0={t0}
        fires={fires}
        showFires={showFires}
        satellite={satellite}
        mission={mission}
        selectedHex={selectedHex}
        onSelect={setSelectedHex}
        onMapReady={(m) => (mapRef.current = m)}
        evacPoints={evacPoints}
        showEvac={showEvac}
        onEvacSelect={setSelectedEvac}
      />

      {/* Header — identité + état du dispositif (compact sur mobile) */}
      <header className="pointer-events-none absolute left-2 right-2 top-2 md:left-4 md:right-auto md:top-4">
        <div className="pointer-events-auto flex items-baseline gap-2 rounded-md border border-line bg-panel px-3 py-2 backdrop-blur-md md:block md:px-4 md:py-2.5">
          <h1 className="font-display text-[17px] font-bold leading-none tracking-wide text-ink md:text-[22px]">
            CANADAIR TRACKER
          </h1>
          <p className="min-w-0 flex-1 truncate text-[11px] text-ink-dim md:mt-1 md:text-xs">
            <span className="hidden lg:inline">Bombardiers d'eau · Sécurité Civile</span>
            <span className="tnum font-semibold text-ink md:ml-2">
              {airborne > 0 ? `${airborne} en vol` : "aucun vol en cours"}
            </span>
            {airborne > 0 && (
              <span className="tnum ml-2 hidden text-ink-dim sm:inline">
                ✈ {airborneByKind.planes} · ✣ {airborneByKind.helicopters}
              </span>
            )}
            {lastUpdate && mode === "live" && (
              <span className="tnum ml-2 hidden text-ink-faint lg:inline">
                maj {new Date(lastUpdate).toLocaleTimeString("fr-FR")}
              </span>
            )}
          </p>
          {/* Effort du jour : grands écrans seulement (sous lg, le header reste
              compact pour laisser la place à la rangée de contrôles à droite) */}
          <div className="hidden lg:block">
            <EffortBar recap={recap} />
          </div>
        </div>
      </header>
      {/* Bandeau d'erreur : sous la rangée de chips (mobile) / sous le header (desktop) */}
      {error && (
        <div className="pointer-events-auto absolute left-2 right-2 top-[104px] rounded-md border border-alert/60 bg-alert/15 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur-md md:left-4 md:right-auto md:top-[76px]">
          Flux live indisponible : {error}
        </div>
      )}

      {/* Contrôles : rangée scrollable sous le header (mobile) / haut-droite (desktop) */}
      <div className="no-scrollbar absolute left-2 right-2 top-[52px] flex gap-1.5 overflow-x-auto pb-1 md:left-auto md:right-4 md:top-4 md:max-w-[calc(100vw-230px)] md:flex-wrap md:justify-end md:gap-2 md:overflow-visible md:pb-0">
        {/* mobile : ouvre les panneaux */}
        <button
          onClick={() => setMobilePanel((p) => (p === "fleet" ? null : "fleet"))}
          title="Flotte (F)"
          aria-keyshortcuts="f"
          className={`min-h-11 shrink-0 rounded-md border px-3 py-2 font-display text-sm font-semibold tracking-wide backdrop-blur-md md:hidden ${
            mobilePanel === "fleet" ? "border-ink-dim/60 bg-raise text-ink" : "border-line bg-panel text-ink-dim"
          }`}
        >
          Flotte
        </button>
        <button
          onClick={() => setMobilePanel((p) => (p === "news" ? null : "news"))}
          title="Actualités (A)"
          aria-keyshortcuts="a"
          className={`min-h-11 shrink-0 rounded-md border px-3 py-2 font-display text-sm font-semibold tracking-wide backdrop-blur-md md:hidden ${
            mobilePanel === "news" ? "border-ink-dim/60 bg-raise text-ink" : "border-line bg-panel text-ink-dim"
          }`}
        >
          Actus
        </button>
        {/* Accès au guide d'évacuation — mobile (chip dans la rangée qui défile) ;
            sur desktop l'entrée est dans le footer pour ne pas surcharger. */}
        <a
          href="/evacuation.html"
          title="Guide d'évacuation maritime (Lège-Cap-Ferret)"
          className="flex min-h-11 shrink-0 items-center rounded-md border border-fire/50 bg-fire/15 px-3 py-2 font-display text-sm font-semibold tracking-wide text-ink backdrop-blur-md md:hidden"
        >
          Évacuation
        </a>
        <button
          onClick={() => setShowFires((v) => !v)}
          title="Détections satellite VIIRS des 72 dernières heures, zone France élargie"
          className={`min-h-11 shrink-0 rounded-md border px-3 py-2 font-display text-sm font-semibold tracking-wide backdrop-blur-md transition-colors md:min-h-0 md:py-1.5 ${
            showFires
              ? "border-fire/50 bg-fire/15 text-ink"
              : "border-line bg-panel text-ink-faint hover:text-ink"
          }`}
        >
          ● Feux{fires.length ? ` ${fires.length}` : ""}
          <span className="ml-1 hidden font-normal text-ink-dim lg:inline">
            · zone France
          </span>
        </button>
        {/* Foyers actifs détectés (clusters VIIRS triés par puissance) */}
        {foyers.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              if (e.target.value === "") return; // placeholder « Foyers (N) »
              const f = foyers[Number(e.target.value)];
              if (f) {
                flyTo({ longitude: f.lon, latitude: f.lat, zoom: 10.2 });
                setSelectedFoyer(f);
              }
              e.target.value = "";
            }}
            className="shrink-0 cursor-pointer rounded-md border border-line bg-panel px-2 py-2 font-display text-sm font-semibold tracking-wide text-ink-dim backdrop-blur-md transition-colors hover:text-ink md:py-1.5"
          >
            {/* NB : PAS de `disabled` — sur Chrome Android une option
                disabled+selected s'affiche vide (le select paraît vide). */}
            <option value="">Foyers ({foyers.length})</option>
            {foyers.map((f, i) => (
              <option key={i} value={i}>
                {f.active ? "🔥" : "🌫"} {f.name} · {f.frp.toLocaleString("fr-FR")} MW FRP
                {f.active ? "" : " · en extinction"}
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => setSatellite((v) => !v)}
          className={`shrink-0 rounded-md border px-3 py-2 font-display text-sm font-semibold tracking-wide backdrop-blur-md transition-colors md:py-1.5 ${
            satellite
              ? "border-ink-dim/60 bg-raise text-ink"
              : "border-line bg-panel text-ink-faint hover:text-ink"
          }`}
        >
          Satellite
        </button>
        <button
          onClick={() => flyTo(FRANCE_VIEW)}
          className="shrink-0 rounded-md border border-line bg-panel px-3 py-2 font-display text-sm font-semibold tracking-wide text-ink-dim backdrop-blur-md transition-colors hover:text-ink md:py-1.5"
        >
          France
        </button>
        <button
          onClick={() => setShowRecap(true)}
          title="Bilan de la journée sélectionnée (B)"
          aria-keyshortcuts="b"
          className="shrink-0 rounded-md border border-line bg-panel px-3 py-2 font-display text-sm font-semibold tracking-wide text-ink-dim backdrop-blur-md transition-colors hover:text-ink md:py-1.5"
        >
          {selectedDate === "today" ? (
            <>Bilan<span className="hidden lg:inline"> du jour</span></>
          ) : (
            `Bilan du ${new Date(selectedDate + "T12:00:00Z").toLocaleDateString("fr-FR", { day: "numeric", month: "short" })}`
          )}
        </button>
        <button
          onClick={() => setShowSeason(true)}
          title="Cumul de toutes les journées archivées (S)"
          aria-keyshortcuts="s"
          className="shrink-0 rounded-md border border-line bg-panel px-3 py-2 font-display text-sm font-semibold tracking-wide text-ink-dim backdrop-blur-md transition-colors hover:text-ink md:py-1.5"
        >
          Saison
        </button>
        <a
          href="/methodo.html"
          title="Sources & méthodologie"
          className="shrink-0 rounded-md border border-line bg-panel px-3 py-2 font-display text-sm font-semibold text-ink-faint backdrop-blur-md md:hidden"
        >
          ⓘ
        </a>
      </div>

      {/* Panneau flotte — desktop : colonne gauche · mobile : overlay via bouton Flotte */}
      {isDesktop && (
      <div className="absolute left-4 top-[92px] flex items-start gap-1">
        {showFleet && (
          <FleetStrips
            fleet={fleet}
            liveMap={liveMap}
            trails={trails}
            mode={mode}
            replayTime={replayTime ?? 0}
            selectedDate={selectedDate}
            selectedHex={selectedHex}
            onSelect={(hex) => setSelectedHex((h) => (h === hex ? null : hex))}
          />
        )}
        <button
          onClick={() => setShowFleet((v) => !v)}
          title={`${showFleet ? "Replier" : "Afficher"} la flotte (F)`}
          aria-keyshortcuts="f"
          className="rounded-md border border-line bg-panel px-1.5 py-2 font-display text-xs font-bold text-ink-faint backdrop-blur-md transition-colors hover:text-ink"
        >
          {showFleet ? "‹" : "flotte ›"}
        </button>
      </div>
      )}
      {!isDesktop && mobilePanel === "fleet" && (
        <div className="absolute inset-x-2 bottom-[118px] top-[104px] z-20 md:hidden">
          <FleetStrips
            fleet={fleet}
            liveMap={liveMap}
            trails={trails}
            mode={mode}
            replayTime={replayTime ?? 0}
            selectedDate={selectedDate}
            selectedHex={selectedHex}
            onSelect={(hex) => {
              setSelectedHex((h) => (h === hex ? null : hex));
              setMobilePanel(null); // referme pour voir la carte + la fiche
            }}
            className="h-full w-full max-h-none"
          />
        </div>
      )}
      {!isDesktop && mobilePanel === "news" && (
        <div className="absolute inset-x-2 bottom-[130px] top-[104px] z-20">
          <NewsFeed className="h-full w-full" listClassName="max-h-none flex-1" defaultOpen />
        </div>
      )}

      {/* Desktop : fiche appareil + fil d'actus en colonne droite */}
      {isDesktop && (
      <div className="absolute right-4 top-16 flex flex-col items-end gap-2 md:top-28 lg:top-16">
        {selectedEvac && (
          <EvacCard
            point={selectedEvac}
            onClose={() => setSelectedEvac(null)}
            className="w-72"
          />
        )}
        {selectedFoyer && (
          <FoyerCard
            foyer={selectedFoyer}
            passes={foyerPassesByAircraft}
            onClose={() => setSelectedFoyer(null)}
            className="w-72"
          />
        )}
        {selectedHex && fleetByHex[selectedHex] && (
          <AircraftCard
            meta={fleetByHex[selectedHex]}
            live={liveMap[selectedHex]}
            trail={trails[selectedHex]}
            mission={mission}
            mode={mode}
            replayTime={replayTime ?? 0}
            onClose={() => setSelectedHex(null)}
          />
        )}
        <NewsFeed open={showNews} onOpenChange={setShowNews} />
      </div>
      )}

      {/* Mobile : fiche point d'évacuation en bottom sheet */}
      {!isDesktop && selectedEvac && (
        <div className="absolute inset-x-2 bottom-[130px] z-30 max-h-[calc(100dvh-242px)] overflow-y-auto overscroll-contain rounded-md">
          <EvacCard point={selectedEvac} onClose={() => setSelectedEvac(null)} className="w-full" />
        </div>
      )}

      {/* Mobile : fiche foyer en bottom sheet */}
      {!isDesktop && selectedFoyer && (
        <div className="absolute inset-x-2 bottom-[130px] z-30 max-h-[calc(100dvh-242px)] overflow-y-auto overscroll-contain rounded-md">
          <FoyerCard
            foyer={selectedFoyer}
            passes={foyerPassesByAircraft}
            onClose={() => setSelectedFoyer(null)}
            className="w-full"
          />
        </div>
      )}

      {/* Mobile : fiche appareil en bottom sheet au-dessus de la barre temporelle */}
      {!isDesktop && selectedHex && fleetByHex[selectedHex] && (
        <div className="absolute inset-x-2 bottom-[130px] z-30 max-h-[calc(100dvh-242px)] overflow-y-auto overscroll-contain rounded-md">
          <AircraftCard
            meta={fleetByHex[selectedHex]}
            live={liveMap[selectedHex]}
            trail={trails[selectedHex]}
            mission={mission}
            mode={mode}
            replayTime={replayTime ?? 0}
            onClose={() => setSelectedHex(null)}
            className="w-full"
            compact
          />
        </div>
      )}

      {/* Footer : sources & auteur (desktop — sur mobile : chip ⓘ) */}
      <footer className="absolute bottom-4 left-4 hidden flex-col gap-0.5 text-[11px] md:flex">
        <a
          href="/evacuation.html"
          className="pointer-events-auto mb-1 inline-flex w-fit items-center gap-1.5 rounded-md border border-fire/50 bg-fire/15 px-2 py-1 font-display text-xs font-semibold tracking-wide text-ink backdrop-blur-md transition-colors hover:bg-fire/25"
        >
          ● Guide d'évacuation maritime →
        </a>
        <span className="mb-1 text-ink-faint/70">
          F flotte · A actus · B bilan · S saison · Échap fermer
        </span>
        <a
          href="/methodo.html"
          className="pointer-events-auto text-ink-faint transition-colors hover:text-ink"
        >
          Sources &amp; méthodologie
        </a>
        <a
          href="https://www.linkedin.com/in/henricasalis/"
          target="_blank"
          rel="noopener noreferrer"
          className="pointer-events-auto text-ink-faint transition-colors hover:text-ink"
        >
          par Henri Casalis
        </a>
      </footer>

      {/* Légende / clé de lecture — dépliée en bas à gauche (desktop),
          repliée sous les chips (mobile) où l'espace est compté */}
      {isDesktop ? (
        <div className="absolute bottom-[76px] left-4 z-20">
          <Legend fleet={fleet} defaultOpen showEvac={showEvac} />
        </div>
      ) : (
        <div className="absolute left-2 top-[150px] z-20">
          <Legend fleet={fleet} defaultOpen={false} showEvac={showEvac} />
        </div>
      )}

      {/* Bilan de la journée (poster exportable) */}
      {showRecap && (
        <DayRecap
          recap={recap}
          trails={trails}
          fleetByHex={fleetByHex}
          foyers={recapFoyers}
          dateLabel={dateLabel}
          isToday={selectedDate === "today"}
          hasHistoricalFires={selectedDate === "today"}
          onClose={() => setShowRecap(false)}
        />
      )}

      {/* Vue saison : cumul des journées archivées */}
      {showSeason && (
        <SeasonPanel fleetByHex={fleetByHex} onClose={() => setShowSeason(false)} />
      )}

      {/* Barre temporelle */}
      <div className="absolute inset-x-2 bottom-2 md:inset-x-auto md:bottom-4 md:left-1/2 md:-translate-x-1/2">
        <TimeBar
          mode={mode}
          window={win}
          replayTime={replayTime}
          playing={playing}
          speed={speed}
          selectedDate={selectedDate}
          archiveIndex={archiveIndex}
          trailsLoading={trailsLoading}
          onScrub={handleScrub}
          onPlayToggle={handlePlayToggle}
          onSpeedChange={(s) => {
            setSpeed(s);
            // ne lance la lecture que si une fenêtre chargée existe, sinon on
            // basculerait en replay figé sur un écran vide
            if (mode !== "replay" && win && !trailsLoading) handlePlayToggle();
          }}
          onGoLive={handleGoLive}
          onDateChange={setSelectedDate}
        />
      </div>
    </div>
  );
}
