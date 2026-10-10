// Prevent independently multiplied player-prop prices from being labeled
// as actual sportsbook same-game parlay quotes. Pure display/evidence boundary.
export function markBookSgpEstimate(sgp) {
  if (!sgp || typeof sgp !== "object") return sgp;
  const estimatedOdds = Number.isFinite(sgp.estimatedOdds) ? sgp.estimatedOdds : null;
  return {
    ...sgp,
    // Retain whether the *estimate* reaches the intended Small/Medium/Nuke
    // range, but never equate this with an actual correlated book quote.
    estimatedTargetBandMet: sgp.payoutBandVerified === true,
    payoutBandVerified: false,
    combinedBookQuoteVerified: false,
    actualSgpOdds: null,
    combinedPriceType: estimatedOdds !== null
      ? "independent_leg_estimate"
      : "not_available",
    bookVerificationPending: true,
    modelDriven: sgp.modelDriven === true || estimatedOdds === null,
    pricingNote: estimatedOdds !== null
      ? "Estimated from independent player-prop prices; actual same-game parlay odds can differ and are not verified."
      : "Model-generated parlay candidate; no verified combined sportsbook price is available."
  };
}
