// Legacy, game-specific role observations must never be silently treated as current.
export function filterCurrentRoleEvidence(records, { now, kickoff, maxAgeMs = 48 * 60 * 60 * 1000 } = {}) {
  if (!Array.isArray(records) || !Number.isFinite(now) || !Number.isFinite(kickoff) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0 || now > kickoff) return [];
  return records.filter(r => {
    if (!r || !["NFL_OFFICIAL","TEAM_OFFICIAL"].includes(r.authority) || !["EXPECTED_STARTER","CONFIRMED_STARTER"].includes(r.status) || !r.source || !r.name || !r.team) return false;
    const checked = Date.parse(r.checkedAt);
    return Number.isFinite(checked) && checked <= now && now - checked <= maxAgeMs && checked <= kickoff && kickoff - checked <= maxAgeMs;
  });
}


// A current roster or productive season is NOT an independently confirmed
// starting role. Preserve the source's real checkedAt, never the API fetch time.
// This is a strict game-day evidence gate, not a model confidence score.
export function isVerifiedNflStarterRole(signal, {
  now, kickoff, maxAgeMs = 48 * 60 * 60 * 1000
} = {}) {
  if (!signal || signal.status !== "CONFIRMED_STARTER" ||
      !["STRUCTURED","REPORTED_CURRENT_GAME"].includes(signal.kind) ||
      !signal.name || !signal.team || !signal.source ||
      !Number.isFinite(now) || !Number.isFinite(kickoff) ||
      !Number.isFinite(maxAgeMs) || maxAgeMs <= 0 ||
      now > kickoff) return false;
  const observedAt = Date.parse(String(signal.checkedAt || ""));
  return Number.isFinite(observedAt) && observedAt <= now &&
    observedAt <= kickoff && now - observedAt <= maxAgeMs &&
    kickoff - observedAt <= maxAgeMs;
}
