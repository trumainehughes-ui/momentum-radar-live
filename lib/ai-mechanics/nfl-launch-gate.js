// NFL launch gate: describe what must be independently evidenced before
// sportsbook SGP features can be marked live. Read-only; makes no API calls.
// No client-provided booleans or calculated odds constitute a book quote.
export function assessNflLaunchReadiness({
  gameId, home, away, rolePlayers = [], rosterChecked = false,
  marketEvidence, crosswalkVerified = false, verifiedCombinedBookQuotes = 0,
  finalPregameVerifiedAt = null, kickoff = null, now
} = {}) {
  const reasons = [];
  const required = (condition, reason) => { if (!condition) reasons.push(reason); };
  const gameScoped = Boolean(gameId && home && away && home !== away);
  required(gameScoped, "game_identity_unverified");
  required(rosterChecked === true, "roster_and_inactive_verification_pending");

  // At least one independently verified starting QB on EACH team is necessary
  // for a game-wide SGP-ready state; not enough to assert the roster was read.
  const confirmed = new Set((Array.isArray(rolePlayers) ? rolePlayers : [])
    .filter(p => p && p.starterVerified === true &&
      p.verification?.role?.verified === true &&
      p.starterStatus === "CONFIRMED_STARTER" &&
      String(p.position || "").toUpperCase() === "QB")
    .map(p => p.team));
  required(gameScoped && confirmed.has(home) && confirmed.has(away),
    "both_starting_quarterbacks_unconfirmed");

  required(marketEvidence?.state === "BOOK_LINES_OBSERVED_UNQUOTED" &&
    marketEvidence?.observedBookLines > 0,
    "fresh_draftkings_or_fanduel_player_lines_missing");
  required(crosswalkVerified === true, "server_verified_player_event_crosswalk_pending");
  required(Number.isSafeInteger(verifiedCombinedBookQuotes) &&
    verifiedCombinedBookQuotes > 0,
    "actual_combined_sgp_book_quote_missing");

  // A client asking ?finalCheck=true only requests a refresh, never proves that
  // the last T-30 reconciliation happened. Require a recorded validation time.
  const kickoffAt = Date.parse(String(kickoff || ""));
  const checkedAt = Date.parse(String(finalPregameVerifiedAt || ""));
  const validTime = Number.isFinite(now) && Number.isFinite(kickoffAt) &&
    Number.isFinite(checkedAt) && checkedAt <= now && checkedAt <= kickoffAt &&
    kickoffAt - checkedAt <= 30 * 60 * 1000 &&
    now - checkedAt <= 30 * 60 * 1000;
  required(validTime, "verified_final_pregame_check_pending");

  const ready = reasons.length === 0;
  return {
    league:"NFL",readyForLiveBookSgps:ready,
    modelProjectionsMayDisplay:true,advisoryOnly:true,
    missingEvidence:reasons,
    message:ready
      ? "All game-specific evidence gates passed; verify live sportsbook slip before wagering."
      : "NFL models available. Sportsbook-verified SGPs remain pending: " +
        reasons.length + " release checks are incomplete."
  };
}
