/**
 * DraftKings public market normalization, inspired by yzRobo/draftkings_api_explorer
 * (MIT licensed). No network calls, browser impersonation or sportsbook quote claims.
 * Input must be a separately retrieved and timestamped public market snapshot.
 */
const number = value => typeof value === 'number' ? value : Number(value);
export function normalizeDraftKingsSelections(snapshot, {fetchedAt, sourceUrl} = {}) {
  if (!Array.isArray(snapshot?.events) || !Array.isArray(snapshot?.markets)) return [];
  if (!fetchedAt || !Number.isFinite(Date.parse(fetchedAt)) || !/^https:\/\//.test(sourceUrl || '')) return [];
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
      if (!player || !Number.isFinite(line) || !Number.isInteger(price) || price === 0 || (price > -100 && price < 100)) continue;
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
export function eligibleDraftKingsProp(prop, {activeStarter, offeredLines} = {}) {
  return Boolean(activeStarter && prop?.book === 'DraftKings' &&
    Number.isFinite(prop.line) && Number.isInteger(prop.line / 5) &&
    Array.isArray(offeredLines) && offeredLines.includes(prop.line) &&
    prop.fetchedAt && prop.sourceUrl);
}
