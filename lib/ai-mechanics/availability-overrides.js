// Dated, game-specific injury overrides are not authoritative beyond their game window.
export function currentAvailabilityOverrides(records, {now, kickoff, maxAgeMs=72*60*60*1000}={}) {
  if (!Array.isArray(records)||!Number.isFinite(now)||!Number.isFinite(kickoff)||!Number.isFinite(maxAgeMs)||maxAgeMs<=0) return [];
  return records.filter(r=>{
    if (!r||!r.playerId||!r.team||!r.source||!["OUT","IR","DOUBTFUL","INACTIVE"].includes(r.status)) return false;
    const t=Date.parse(r.checkedAt);
    return Number.isFinite(t)&&t<=now&&t<=kickoff&&now-t<=maxAgeMs&&kickoff-t<=maxAgeMs;
  });
}
