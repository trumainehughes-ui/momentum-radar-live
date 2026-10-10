// Legacy, game-specific role observations must never be silently treated as current.
export function filterCurrentRoleEvidence(records, { now, kickoff, maxAgeMs = 48 * 60 * 60 * 1000 } = {}) {
  if (!Array.isArray(records) || !Number.isFinite(now) || !Number.isFinite(kickoff) || !Number.isFinite(maxAgeMs) || maxAgeMs <= 0) return [];
  return records.filter(r => {
    if (!r || !["NFL_OFFICIAL","TEAM_OFFICIAL"].includes(r.authority) || !["EXPECTED_STARTER","CONFIRMED_STARTER"].includes(r.status) || !r.source || !r.name || !r.team) return false;
    const checked = Date.parse(r.checkedAt);
    return Number.isFinite(checked) && checked <= now && now - checked <= maxAgeMs && checked <= kickoff && kickoff - checked <= maxAgeMs;
  });
}
