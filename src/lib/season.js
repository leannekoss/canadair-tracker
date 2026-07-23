// Agrège plusieurs bilans journaliers en un cumul de saison.
// dailyRecaps : [{ date, recap }] où recap vient de buildRecap.
export function buildSeason(dailyRecaps) {
  const days = dailyRecaps.filter((d) => d.recap && d.recap.aircraftCount > 0);
  if (days.length === 0) return null;

  const totalKm = days.reduce((s, d) => s + d.recap.totalKm, 0);
  const totalScoops = days.reduce((s, d) => s + d.recap.totalScoops, 0);
  const busiestDay = days.reduce((a, b) => (b.recap.totalKm > a.recap.totalKm ? b : a));

  const foyerCount = new Map();
  const kmByReg = new Map();
  for (const d of days) {
    for (const name of d.recap.foyersHit ?? []) {
      foyerCount.set(name, (foyerCount.get(name) ?? 0) + 1);
    }
    for (const a of d.recap.top ?? []) {
      const e = kmByReg.get(a.reg) ?? { reg: a.reg, category: a.category, km: 0 };
      e.km += a.distKm;
      kmByReg.set(a.reg, e);
    }
  }
  const topFoyers = [...foyerCount.entries()]
    .map(([name, days]) => ({ name, days }))
    .sort((a, b) => b.days - a.days)
    .slice(0, 5);
  const topAircraft = [...kmByReg.values()].sort((a, b) => b.km - a.km).slice(0, 5);

  // les journées sont triées récent → ancien par l'index d'archive
  const dates = days.map((d) => d.date).sort();
  return {
    days: days.length,
    totalKm,
    totalScoops,
    busiestDay: { date: busiestDay.date, km: busiestDay.recap.totalKm },
    topFoyers,
    topAircraft,
    since: dates[0] ?? null,
  };
}
