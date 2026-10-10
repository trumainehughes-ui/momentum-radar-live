// Historical usage signals only. This module never recommends a wager.
export function detectUsageShift({ recent = [], baseline = [], minRecent = 3, minBaseline = 5 } = {}) {
  if (!Array.isArray(recent) || !Array.isArray(baseline)) return null;
  if (recent.length < minRecent || baseline.length < minBaseline) return null;
  if (![...recent,...baseline].every(v => Number.isFinite(v) && v >= 0)) return null;
  const avg = values => values.reduce((a,b) => a+b,0)/values.length;
  const recentMean = avg(recent), baselineMean = avg(baseline);
  if (baselineMean === 0) return { recentMean, baselineMean, relativeChange: null, direction: recentMean > 0 ? "new_usage" : "unchanged", advisoryOnly: true };
  const relativeChange = (recentMean - baselineMean)/baselineMean;
  return { recentMean, baselineMean, relativeChange, direction: relativeChange >= 0.2 ? "increasing" : relativeChange <= -0.2 ? "decreasing" : "stable", advisoryOnly: true };
}
export function compareShadowNeighbors({ candidateSlot, targetSlot, candidateScore, targetScore, maxDistance = 2 } = {}) {
  if (![candidateSlot,targetSlot].every(Number.isInteger) || candidateSlot < 1 || targetSlot < 1 || candidateSlot > 9 || targetSlot > 9) return null;
  if (![candidateScore,targetScore].every(v => Number.isFinite(v) && v >= 0 && v <= 100)) return null;
  const distance = Math.abs(candidateSlot-targetSlot);
  return { withinNeighborhood: distance <= maxDistance, scoreDifferential: candidateScore-targetScore, advisoryOnly: true };
}
