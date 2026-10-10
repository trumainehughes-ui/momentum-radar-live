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
    // A source-listed individual player prop is NOT a verified combined SGP.
    eligibleBookLegs: Number.isSafeInteger(sgp.verifiedLegs)
      ? Math.max(0, sgp.verifiedLegs) : 0,
    verifiedLegs: 0,
    verifiedAt: null,
    modelGeneratedAt: sgp.modelGeneratedAt || sgp.verifiedAt || null,
    publishableAsBookSgp: false,
    nukePayoutVerified: false,
    payoutBandVerified: false,
    combinedBookQuoteVerified: false,
    actualSgpOdds: null,
    combinedPriceType: estimatedOdds !== null
      ? "independent_leg_estimate"
      : "not_available",
    bookVerificationPending: true,
    modelDriven: sgp.modelDriven === true || estimatedOdds === null,
    pricingNote: sgp.eligibilityPruned === true
      ? (sgp.pricingNote || "Injury update changed the parlay; all old price and leg verification is invalid.")
      : estimatedOdds !== null
      ? "Estimated from independent player-prop prices; actual same-game parlay odds can differ and are not verified."
      : "Model-generated parlay candidate; no verified combined sportsbook price is available."
  };
}


// Independent offense/defense projections do not become sportsbook offers
// just because a model threshold falls below one visible alternate-line cap.
// They remain useful Small/Medium/Nuke candidates during odds API outages.
export function markAnalyticsSgpCandidate(sgp) {
  if (!sgp || typeof sgp !== "object") return sgp;
  const legs = Array.isArray(sgp.legs) ? sgp.legs.map(leg => ({
    ...leg,
    sportsbookVerified: false,
    bookOffer: null,
    bestBook: null,
    sportsbooks: {},
    availableAt: [],
    bookThresholdCaps: {},
    thresholdCappedToSportsbook: false,
    marketVerificationPending: true,
    quoteVerifiedAt: null,
    verifiedAt: null,
    marketQuoteVerified: false
  })) : [];
  return {
    ...sgp,
    legs,
    displayable: true,
    publishable: false,
    publishableAsBookSgp: false,
    modelOnly: true,
    modelDriven: true,
    candidateComplete: sgp.tierAssessment?.compositionOk === true &&
      Number.isSafeInteger(sgp.requiredLegs) &&
      sgp.requiredLegs > 0 && legs.length === sgp.requiredLegs,
    eligibleBookLegs: 0,
    verifiedLegs: 0,
    actualSgpOdds: null,
    estimatedOdds: null,
    payoutBandVerified: false,
    nukePayoutVerified: false,
    combinedBookQuoteVerified: false,
    combinedPriceType: "model_projection_no_book_quote",
    bookVerificationPending: true,
    verifiedAt: null,
    modelGeneratedAt: sgp.modelGeneratedAt || sgp.verifiedAt || null,
    pricingNote: sgp.tierAssessment?.compositionOk === false
      ? sgp.tierAssessment.reason
      : "Model composition candidate only. Combined sportsbook odds have not been verified; the displayed payout target is not guaranteed."
  };
}
