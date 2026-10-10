// Pure, deterministic guardrails for AI-generated suggestions.
// AI output is advisory; verified source data remains authoritative.
export const AI_MECHANICS = Object.freeze([
  "dataQuality", "injuryOpportunity", "propValue", "parlayArchitect",
  "matchupIntelligence", "gameScript", "breakoutShadow", "postgameLearning"
]);
export const enabled = (name, flags = {}) => AI_MECHANICS.includes(name) && flags[name] === true;
export function validateCandidate(candidate, { activePlayers = [], markets = [], minNukeOdds = 10000 } = {}) {
  const reasons = [];
  if (!candidate || typeof candidate !== "object") return { valid: false, reasons: ["invalid_candidate"] };
  if (!activePlayers.some(p => p.id === candidate.playerId && p.team === candidate.team && p.status === "active"))
    reasons.push("unverified_active_player_or_team");
  if (!markets.some(m => m.playerId === candidate.playerId && m.market === candidate.market && m.line === candidate.line && m.available === true))
    reasons.push("unavailable_or_unverified_market");
  if (candidate.market && /yards/i.test(candidate.market) && (!Number.isFinite(candidate.line) || candidate.line % 5 !== 0))
    reasons.push("yardage_not_multiple_of_five");
  if (candidate.probability != null && (!Number.isFinite(candidate.probability) || candidate.probability < 0 || candidate.probability > 1))
    reasons.push("invalid_probability");
  if (candidate.tier === "nuke" && (!Number.isFinite(candidate.combinedAmericanOdds) || candidate.combinedAmericanOdds < minNukeOdds))
    reasons.push("nuke_payout_not_verified");
  return { valid: reasons.length === 0, reasons };
}
export function noVigTwoWay(overAmerican, underAmerican) {
  const implied = odds => odds > 0 ? 100 / (odds + 100) : -odds / (-odds + 100);
  if (![overAmerican, underAmerican].every(Number.isFinite) || overAmerican === 0 || underAmerican === 0) return null;
  const a = implied(overAmerican), b = implied(underAmerican);
  return { over: a / (a + b), under: b / (a + b) };
}
