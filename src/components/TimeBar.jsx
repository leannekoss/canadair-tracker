// Barre temporelle : bascule LIVE/REPLAY, scrubber, vitesse, sélecteur de journée.
// Mobile : contrôles sur une ligne + slider pleine largeur en dessous · desktop : une ligne.

const SPEEDS = [10, 60, 300];

function fmtClock(t) {
  return new Date(t * 1000).toLocaleTimeString("fr-FR", {
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function TimeBar({
  mode,
  window: win,
  replayTime,
  playing,
  speed,
  selectedDate,
  archiveIndex,
  trailsLoading,
  onScrub,
  onPlayToggle,
  onSpeedChange,
  onGoLive,
  onDateChange,
}) {
  const hasWindow = win && win.end > win.start;
  const dates = [
    { value: "today", label: "Aujourd'hui" },
    ...archiveIndex
      .map((d) => d.date)
      .filter((d) => d !== new Date().toISOString().slice(0, 10))
      .sort()
      .reverse()
      .map((d) => ({
        value: d,
        label: new Date(d + "T12:00:00Z").toLocaleDateString("fr-FR", {
          weekday: "short",
          day: "numeric",
          month: "short",
        }),
      })),
  ];

  return (
    <div className="pointer-events-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-md border border-line bg-panel px-3 py-2 backdrop-blur-md md:gap-4 md:px-4 md:py-2.5">
      {/* Journée */}
      <select
        value={selectedDate}
        onChange={(e) => onDateChange(e.target.value)}
        className="cursor-pointer rounded-sm border border-line bg-raise px-2 py-1.5 font-display text-sm font-semibold tracking-wide text-ink outline-none md:py-1"
      >
        {dates.map((d) => (
          <option key={d.value} value={d.value}>
            {d.label}
          </option>
        ))}
      </select>

      {/* LIVE */}
      <button
        onClick={onGoLive}
        disabled={selectedDate !== "today"}
        className={`font-display text-sm font-bold tracking-widest transition-colors ${
          mode === "live"
            ? "text-live"
            : selectedDate === "today"
              ? "text-ink-faint hover:text-ink"
              : "cursor-not-allowed text-ink-faint/40"
        }`}
      >
        <span className={`mr-1.5 inline-block h-2 w-2 rounded-full align-middle ${mode === "live" ? "bg-live pulse-dot" : "bg-ink-faint"}`} />
        LIVE
      </button>

      {/* Play / pause */}
      <button
        onClick={onPlayToggle}
        disabled={!hasWindow}
        title={playing ? "Pause" : "Rejouer"}
        className="grid h-9 w-9 place-items-center rounded-sm border border-line bg-raise text-ink transition-colors hover:border-ink-faint disabled:opacity-40 md:h-8 md:w-8"
      >
        {playing ? (
          <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor"><rect width="4" height="12" /><rect x="7" width="4" height="12" /></svg>
        ) : (
          <svg width="11" height="12" viewBox="0 0 11 12" fill="currentColor"><path d="M0 0 L11 6 L0 12 Z" /></svg>
        )}
      </button>

      {/* Horloge */}
      <div className="tnum ml-auto font-display text-lg font-bold text-ink md:ml-0 md:w-14 md:text-center">
        {mode === "replay" && replayTime ? fmtClock(replayTime) : fmtClock(Date.now() / 1000)}
      </div>

      {/* Vitesses */}
      <div className="flex gap-1">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`rounded-sm px-2 py-1 font-display text-xs font-semibold tracking-wide transition-colors md:px-1.5 md:py-0.5 ${
              speed === s && mode === "replay"
                ? "bg-ink text-surface"
                : "text-ink-faint hover:text-ink"
            }`}
          >
            ×{s}
          </button>
        ))}
      </div>

      {/* Scrubber — pleine largeur sur mobile, inline sur desktop */}
      <div className="order-last flex w-full items-center gap-3 md:order-none md:w-[30vw] md:min-w-56">
        <span className="tnum font-display text-xs font-semibold text-ink-dim">
          {hasWindow ? fmtClock(win.start) : "--:--"}
        </span>
        <input
          type="range"
          className="timebar"
          min={hasWindow ? win.start : 0}
          max={hasWindow ? win.end : 1}
          step={10}
          value={mode === "replay" ? replayTime : hasWindow ? win.end : 0}
          onChange={(e) => onScrub(Number(e.target.value))}
          disabled={!hasWindow}
        />
        <span className="tnum font-display text-xs font-semibold text-ink-dim">
          {hasWindow ? fmtClock(win.end) : "--:--"}
        </span>
      </div>

      {trailsLoading && (
        <span className="hidden font-display text-xs font-semibold tracking-wide text-ink-faint md:inline">
          chargement des traces…
        </span>
      )}
    </div>
  );
}
