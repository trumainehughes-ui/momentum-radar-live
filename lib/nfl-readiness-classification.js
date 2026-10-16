// Separate saved-market readiness from collector-stage readiness.
// An existing fresh model candidate is useful research, but never a verified bet.
// Never upgrade a stale or missing sportsbook snapshot to a publishable quote.
export function reconcileNflReadinessStatus({marketStatus, quoteVerified=false, collectorCoverage=null}={}) {
  if (quoteVerified === true) return 'BOOK_QUOTED';
  if (marketStatus === 'MODEL_ONLY') return 'MODEL_ONLY';
  if (marketStatus === 'PENDING_SNAPSHOT' && collectorCoverage === 'READY_3_OF_3')
    return 'MODEL_READY_MARKET_SNAPSHOT_MISSING';
  return 'NOT_READY';
}
