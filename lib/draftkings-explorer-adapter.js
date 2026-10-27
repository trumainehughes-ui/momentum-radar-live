/**
 * DraftKings public market normalization, inspired by yzRobo/draftkings_api_explorer
 * (MIT licensed). No network calls, browser impersonation or sportsbook quote claims.
 * Input must be a separately retrieved and timestamped public market snapshot.
 */
const number = value => value === null || value === undefined || value === '' ? NaN :
  (typeof value === 'number' ? value : Number(value));
export function normalizeDraftKingsSelections(snapshot, {fetchedAt, sourceUrl} = {}) {
  if (!Array.isArray(snapshot?.events) || !Array.isArray(snapshot?.markets)) return [];
  if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) return [];
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { return []; }
  if (parsedUrl.protocol !== 'https:' || !(parsedUrl.hostname === 'draftkings.com' || parsedUrl.hostname.endsWith('.draftkings.com'))) return [];
  const events = new Map(snapshot.events.map(e => [String(e.eventId ?? e.id), e]));
  const selections = [];
  for (const market of snapshot.markets) {
    const event = events.get(String(market.eventId));
    if (!event || market.status === 'SUSPENDED' || market.isSuspended === true) continue;
    const outcomes = market.outcomes ?? market.selections ?? [];
    if (!Array.isArray(outcomes)) continue;
    for (const outcome of outcomes) {
      if (outcome.status === 'SUSPENDED' || outcome.isSuspended === true) continue;
      const line = number(outcome.line ?? outcome.points);
      const price = number(outcome.americanOdds ?? outcome.oddsAmerican);
      const player = outcome.participantName ?? outcome.playerName;
      if (!player || !String(player).trim() || !Number.isFinite(line) || !Number.isInteger(price) || price === 0 || (price > -100 && price < 100)) continue;
      selections.push({
        book: 'DraftKings', eventId: String(market.eventId),
        eventName: event.name ?? null, marketId: String(market.marketId ?? market.id ?? ''),
        marketName: market.name ?? null, player: String(player),
        outcome: String(outcome.label ?? outcome.name ?? ''),
        line, americanOdds: price,
        isMainLine: outcome.main === true || outcome.isMain === true,
        fetchedAt, sourceUrl, verifiedSGPQuote: false
      });
    }
  }
  return selections;
}
export function eligibleDraftKingsProp(prop, {activeStarter, offeredLines, now = Date.now(), maxAgeMs = 15 * 60_000} = {}) {
  const age = now - Date.parse(prop?.fetchedAt);
  let validSource = false;
  try {
    const u = new URL(prop?.sourceUrl);
    validSource = u.protocol === 'https:' && (u.hostname === 'draftkings.com' || u.hostname.endsWith('.draftkings.com'));
  } catch { /* invalid source */ }
  const market = String(prop?.marketName || '').toLowerCase();
  const isYardage = /\byards?\b/.test(market);
  const isReceptions = /\breceptions?\b|\bcatches\b/.test(market);
  const isTouchdown = /\btouchdowns?\b|\banytime td\b/.test(market);
  if (!isYardage && !isReceptions && !isTouchdown) return false;
  // Do not manufacture increments: DK may list half-catch thresholds and
  // alternate yardage lines. Exact first-party offeredLines are authoritative.
  const validLine = Number.isFinite(prop?.line) && prop.line >= 0;
  return Boolean(activeStarter && prop?.book === 'DraftKings' &&
    validLine &&
    Array.isArray(offeredLines) && offeredLines.includes(prop.line) &&
    Number.isFinite(age) && age >= 0 && age <= maxAgeMs && validSource);
}
