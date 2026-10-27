/**
 * DraftKings public market normalization, inspired by yzRobo/draftkings_api_explorer
 * (MIT licensed). No network calls, browser impersonation or sportsbook quote claims.
 * Input must be a separately retrieved and timestamped public market snapshot.
 */
const number = value => value === null || value === undefined || value === '' ? NaN :
  (typeof value === 'number' ? value : Number(value));
export function normalizeDraftKingsSelections(snapshot, {fetchedAt, sourceUrl} = {}) {
  if (!Array.isArray(snapshot?.events) || !Array.isArray(snapshot?.markets)) return [];
  // Nash feeds expose selections at the top level, joined to markets by marketId.
  const byMarket = new Map();
  for (const selection of Array.isArray(snapshot.selections) ? snapshot.selections : []) {
    const id = String(selection.marketId ?? '');
    if (!id) continue;
    if (!byMarket.has(id)) byMarket.set(id, []);
    byMarket.get(id).push(selection);
  }
  if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt))) return [];
  const observedAt = Date.parse(fetchedAt);
  if (observedAt > Date.now() + 60_000) return [];
  let parsedUrl;
  try { parsedUrl = new URL(sourceUrl); } catch { return []; }
  if (parsedUrl.protocol !== 'https:' || !(parsedUrl.hostname === 'draftkings.com' || parsedUrl.hostname.endsWith('.draftkings.com'))) return [];
  const events = new Map(snapshot.events.map(e => [String(e.eventId ?? e.id), e]));
  const selections = [];
  const seenSelections = new Set();
  for (const market of snapshot.markets) {
    const event = events.get(String(market.eventId));
    if (!event || market.status === 'SUSPENDED' || market.isSuspended === true || market.isOpen === false) continue;
    const outcomes = market.outcomes ?? market.selections ?? byMarket.get(String(market.marketId ?? market.id)) ?? [];
    if (!Array.isArray(outcomes)) continue;
    for (const outcome of outcomes) {
      if (outcome.status === 'SUSPENDED' || outcome.isSuspended === true || outcome.isOpen === false) continue;
      const rawLabel = String(outcome.label ?? outcome.name ?? outcome.outcomeType ?? '').trim();
      const embedded = rawLabel.match(/^(over|under)\\s+([+-]?\\d+(?:\\.\\d+)?)$/i);
      const line = number(outcome.line ?? outcome.points ?? embedded?.[2]);
      const side = String(embedded?.[1] ?? outcome.outcomeType ?? rawLabel).trim().toLowerCase();
      const rawPrice = outcome.americanOdds ?? outcome.oddsAmerican ?? outcome.displayOdds?.american;
      const price = number(typeof rawPrice === 'string' ? rawPrice.replace('−', '-') : rawPrice);
      const player = outcome.participantName ?? outcome.playerName ?? market.participantName ?? market.playerName;
      const selectionId = outcome.selectionId ?? outcome.id;
      const marketId = market.marketId ?? market.id;
      if (!player || !String(player).trim() || !marketId || !selectionId || !Number.isFinite(line) || line < 0 || !['over','under'].includes(side) || !Number.isInteger(price) || price === 0 || (price > -100 && price < 100)) continue;
      const selectionKey = String(market.eventId) + '|' + String(marketId) + '|' + String(selectionId);
      if (seenSelections.has(selectionKey)) continue;
      seenSelections.add(selectionKey);
      selections.push({
        book: 'DraftKings', eventId: String(market.eventId),
        eventName: event.name ?? null, marketId: String(marketId),
        marketName: market.name ?? null, player: String(player),
        selectionId: String(selectionId),
        outcome: side,
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
    ['over','under'].includes(String(prop?.outcome||'').toLowerCase()) &&
    typeof prop?.selectionId === 'string' && prop.selectionId.trim().length > 0 &&
    typeof prop?.marketId === 'string' && prop.marketId.trim().length > 0 &&
    typeof prop?.eventId === 'string' && prop.eventId.trim().length > 0 &&
    Number.isInteger(prop?.americanOdds) &&
    (prop.americanOdds <= -100 || prop.americanOdds >= 100) &&
    validLine &&
    Array.isArray(offeredLines) && offeredLines.includes(prop.line) &&
    Number.isFinite(age) && age >= 0 && age <= maxAgeMs && validSource);
}
