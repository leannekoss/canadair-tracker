import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MapView from "./components/MapView.jsx";
import TimeBar from "./components/TimeBar.jsx";
import FleetStrips from "./components/FleetStrips.jsx";
import AircraftCard from "./components/AircraftCard.jsx";
import NewsFeed from "./components/NewsFeed.jsx";
import { useFleet } from "./lib/useFleet.js";
import { positionAt, timeWindow } from "./lib/replay.js";
import { fetchFires, namedFireClusters } from "./lib/fires.js";
import { FRANCE_VIEW } from "./theme.js";

const REPLAY_TICK_MS = 50;
const FIRES_REFRESH_MS = 15 * 60_000;

export default function App() {
  const {
    fleet, liveMap, trails, trailsLoading,
    archiveIndex, selectedDate, setSelectedDate,
    lastUpdate, error,
  } = useFleet();

  const [mode, setMode] = useState("live");
  const [replayTime, setReplayTime] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(60);
  const [selectedHex, setSelectedHex] = useState(null);
  const [showFires, setShowFires] = useState(true);
  const [showFleet, setShowFleet] = useState(true);
  const [foyers, setFoyers] = useState([]);
  const [hiddenCats, setHiddenCats] = useState(() => new Set());

  const toggleCategory = useCallback((cat) => {
    setHiddenCats((prev) => {
      const next = new Set(prev);
      if (next.has(cat)) next.delete(cat);
      else next.add(cat);
      return next;
    });
  }, []);
  const [fires, setFires] = useState([]);
  const [, setClockTick] = useState(0); // re-render 1s : horloge + avance du fade live
  const mapRef = useRef(null);

  const fleetByHex = useMemo(
    () => Object.fromEntries(fleet.map((a) => [a.hex, a])),
    [fleet]
  );
  const win = useMemo(() => timeWindow(trails), [trails]);
  const t0 = win?.start ?? null;

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

  useEffect(() => {
    if (mode === "replay" && replayTime == null && win) {
      setReplayTime(win.start);
    }
  }, [mode, replayTime, win]);

  // Hotspots incendies + foyers nommés (clusters triés par puissance)
  useEffect(() => {
    let alive = true;
    const load = () =>
      fetchFires()
        .then(async (f) => {
          if (!alive) return;
          setFires(f);
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
        hiddenCats={hiddenCats}
        selectedHex={selectedHex}
        onSelect={setSelectedHex}
        onMapReady={(m) => (mapRef.current = m)}
      />

      {/* Header — identité + état du dispositif */}
      <header className="pointer-events-none absolute left-4 top-4">
        <div className="pointer-events-auto rounded-md border border-line bg-panel px-4 py-2.5 backdrop-blur-md">
          <h1 className="font-display text-[22px] font-bold leading-none tracking-wide text-ink">
            CANADAIR TRACKER
          </h1>
          <p className="mt-1 text-xs text-ink-dim">
            Bombardiers d'eau · Sécurité Civile
            <span className="tnum ml-2 font-semibold text-ink">
              {airborne > 0 ? `${airborne} en vol` : "aucun vol en cours"}
            </span>
            {lastUpdate && mode === "live" && (
              <span className="tnum ml-2 text-ink-faint">
                maj {new Date(lastUpdate).toLocaleTimeString("fr-FR")}
              </span>
            )}
          </p>
        </div>
        {error && (
          <div className="pointer-events-auto mt-2 rounded-md border border-alert/60 bg-alert/15 px-3 py-1.5 text-xs font-semibold text-ink backdrop-blur-md">
            Flux live indisponible : {error}
          </div>
        )}
      </header>

      {/* Panneau flotte (repliable pour dégager la carte) */}
      <div className="absolute left-4 top-[92px] flex items-start gap-1">
        {showFleet && (
          <FleetStrips
            fleet={fleet}
            liveMap={liveMap}
            trails={trails}
            mode={mode}
            replayTime={replayTime ?? 0}
            selectedHex={selectedHex}
            onSelect={(hex) => setSelectedHex((h) => (h === hex ? null : hex))}
            hiddenCats={hiddenCats}
            onToggleCategory={toggleCategory}
          />
        )}
        <button
          onClick={() => setShowFleet((v) => !v)}
          title={showFleet ? "Replier la flotte" : "Afficher la flotte"}
          className="rounded-md border border-line bg-panel px-1.5 py-2 font-display text-xs font-bold text-ink-faint backdrop-blur-md transition-colors hover:text-ink"
        >
          {showFleet ? "‹" : "flotte ›"}
        </button>
      </div>

      {/* Contrôles de vue + feux */}
      <div className="absolute right-4 top-4 flex gap-1.5">
        <button
          onClick={() => setShowFires((v) => !v)}
          className={`rounded-md border px-3 py-1.5 font-display text-sm font-semibold tracking-wide backdrop-blur-md transition-colors ${
            showFires
              ? "border-fire/50 bg-fire/15 text-ink"
              : "border-line bg-panel text-ink-faint hover:text-ink"
          }`}
        >
          ● Feux{fires.length ? ` ${fires.length}` : ""}
        </button>
        {/* Foyers actifs détectés (clusters VIIRS triés par puissance) */}
        {foyers.length > 0 && (
          <select
            value=""
            onChange={(e) => {
              const f = foyers[Number(e.target.value)];
              if (f) flyTo({ longitude: f.lon, latitude: f.lat, zoom: 10.2 });
              e.target.value = "";
            }}
            className="cursor-pointer rounded-md border border-line bg-panel px-2 py-1.5 font-display text-sm font-semibold tracking-wide text-ink-dim backdrop-blur-md transition-colors hover:text-ink"
          >
            <option value="" disabled>
              Foyers actifs ({foyers.length})
            </option>
            {foyers.map((f, i) => (
              <option key={i} value={i}>
                {f.name} · {f.frp.toLocaleString("fr-FR")} MW · {f.count} pts
              </option>
            ))}
          </select>
        )}
        <button
          onClick={() => flyTo(FRANCE_VIEW)}
          className="rounded-md border border-line bg-panel px-3 py-1.5 font-display text-sm font-semibold tracking-wide text-ink-dim backdrop-blur-md transition-colors hover:text-ink"
        >
          France
        </button>
      </div>

      {/* Colonne droite : fiche appareil + fil d'actus */}
      <div className="absolute right-4 top-16 flex flex-col items-end gap-2">
        {selectedHex && fleetByHex[selectedHex] && (
          <AircraftCard
            meta={fleetByHex[selectedHex]}
            live={liveMap[selectedHex]}
            trail={trails[selectedHex]}
            mode={mode}
            replayTime={replayTime ?? 0}
            onClose={() => setSelectedHex(null)}
          />
        )}
        <NewsFeed />
      </div>

      {/* Barre temporelle */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2">
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
            if (mode !== "replay") handlePlayToggle();
          }}
          onGoLive={handleGoLive}
          onDateChange={setSelectedDate}
        />
      </div>
    </div>
  );
}
