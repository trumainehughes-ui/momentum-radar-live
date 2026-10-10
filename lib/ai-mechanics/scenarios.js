export function projectScenarios(baseline, cases) {
  if (!Number.isFinite(baseline) || baseline < 0 || !Array.isArray(cases) || !cases.length) return null;
  if (cases.some(item => !Number.isFinite(item.weight) || item.weight < 0 || !Number.isFinite(item.factor) || item.factor < 0)) return null;
  const total = cases.reduce((sum, item) => sum + item.weight, 0);
  if (Math.abs(total - 1) > 0.000001) return null;
  return { estimate: cases.reduce((sum, item) => sum + baseline * item.factor * item.weight, 0), advisoryOnly: true };
}
