// Advisory-only signals. No external requests, writes, or live pick mutations.
export function evaluateInjuryImpact(before, after) {
  if (!before || !after || before.playerId !== after.playerId || before.team !== after.team) return { changed: false, reason: "identity_mismatch" };
  const statuses = new Set(["out", "inactive", "ir", "doubtful", "questionable", "active"]);
  if (!statuses.has(String(after.status).toLowerCase())) return { changed: false, reason: "unverified_status" };
  const changed = before.status !== after.status || before.expectedSnapShare !== after.expectedSnapShare;
  return { changed, review: changed ? ["team_offense_vs_defense", "defense_vs_position", "anytime_td", "passing", "rushing", "receiving", "receptions", "sgp", "best_of_slate"] : [], autoReplace: false };
}
export function evaluatePropValue(modelProbability, overOdds, underOdds) {
  const implied = odds => odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
  if (![modelProbability, overOdds, underOdds].every(Number.isFinite) || modelProbability < 0 || modelProbability > 1 || overOdds === 0 || underOdds === 0) return null;
  const a = implied(overOdds), b = implied(underOdds);
  const noVigOver = a / (a + b);
  return { modelProbability, noVigOver, edge: modelProbability - noVigOver, requiresCalibration: true };
}
export function summarizeBacktest(rows = []) {
  const valid = rows.filter(r => Number.isFinite(r.predicted) && r.predicted >= 0 && r.predicted <= 1 && (r.hit === true || r.hit === false));
  if (!valid.length) return { samples: 0, brier: null };
  const brier = valid.reduce((sum, r) => sum + (r.predicted - Number(r.hit)) ** 2, 0) / valid.length;
  return { samples: valid.length, brier };
}
export function validateEvidence(record, maxAgeMs, now) {
  if (!record || typeof record.source !== "string" || !record.source.trim() || !Number.isFinite(record.timestamp) || !Number.isFinite(maxAgeMs) || maxAgeMs < 0 || !Number.isFinite(now)) return false;
  return record.timestamp <= now && now - record.timestamp <= maxAgeMs;
}
