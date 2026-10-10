// Advisory-only parlay checks. No price inference or automatic pick edits.
import { validateCandidate } from "./guardrails.js";
export function reviewParlay({ legs, tier, combinedAmericanOdds, context = {} } = {}) {
  if (!Array.isArray(legs) || legs.length === 0) return { valid: false, reasons: ["missing_legs"] };
  const reasons = [];
  legs.forEach((leg, index) => {
    const result = validateCandidate(leg, context);
    result.reasons.forEach(reason => reasons.push("leg_" + (index + 1) + ":" + reason));
  });
  if (!Number.isFinite(combinedAmericanOdds) || combinedAmericanOdds <= 0) reasons.push("verified_combined_price_required");
  const floor = tier === "small" ? 1900 : tier === "medium" ? 2900 : tier === "nuke" ? 9900 : null;
  if (floor === null) reasons.push("unknown_tier");
  else if (!Number.isFinite(combinedAmericanOdds) || combinedAmericanOdds < floor) reasons.push("tier_payout_below_target");
  return { valid: reasons.length === 0, reasons, advisoryOnly: true };
}
