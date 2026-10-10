// Read-only normalization of the actual SportsGameOdds v2 events[].odds object.
// No upstream fetch, cache writes, Groq prompts, parlay mutations or publication.
// ESPN player identifiers cannot be inferred from SGO statEntityID or names.
import { nflSgoCategory } from "./sgo-categories.js";
import { reviewSgoGameSnapshot } from "./sgo-game-review.js";

const BOOK_IDS = Object.freeze({
  draftkings: "DraftKings",
  draftkingssportsbook: "DraftKings",
  fanduel: "FanDuel",
  fanduelsportsbook: "FanDuel"
});
const fail = reason => ({ ready:false, reviewed:[], reason, advisoryOnly:true, acceptedMarkets:0 });

export function reviewRawSgoGameSnapshot({
  game, event, eventMapping, playerMappings = [], picks = [], capturedAt, now
} = {}) {
  const gameId = String(game?.gameId || "");
  const eventId = String(event?.eventID || "");
  if (!gameId || !eventId || String(eventMapping?.gameId || "") !== gameId ||
      String(eventMapping?.eventId || "") !== eventId)
    return fail("unverified_game_event_crosswalk");
  if (!Number.isFinite(now) || !Number.isFinite(capturedAt) ||
      capturedAt > now || now - capturedAt > 15 * 60 * 1000)
    return fail("stale_or_missing_raw_capture");
  if (!Array.isArray(game?.teams) || game.teams.length !== 2 ||
      !Array.isArray(game?.playerProjections) || !Array.isArray(picks) ||
      !Array.isArray(playerMappings) || !event.odds ||
      Array.isArray(event.odds) || typeof event.odds !== "object")
    return fail("invalid_raw_event_shape");

  const gameTeams = new Set(game.teams.map(x => String(x?.abbr || "")));
  // SGO teamID is commonly a long ID (e.g. PHILADELPHIA_EAGLES_NFL),
  // not an ESPN team abbreviation. Require an explicit trusted crosswalk.
  const sgoTeamIds = new Map(game.teams.map(t => [
    String(t?.abbr || ""), String(eventMapping?.teamIds?.[t?.abbr] || t?.abbr || "")
  ]));
  const upstreamTeams = [event.teams?.home?.teamID, event.teams?.away?.teamID]
    .map(x => String(x || ""));
  if (gameTeams.size !== 2 || sgoTeamIds.size !== 2 ||
      upstreamTeams.some(x => ![...sgoTeamIds.values()].includes(x)) ||
      new Set(upstreamTeams).size !== 2 ||
      new Set(sgoTeamIds.values()).size !== 2)
    return fail("unverified_game_team_match");

  // These crosswalks must be constructed by a trusted, server-side ESPN/SGO
  // identity reconciliation, never copied directly from a browser request.
  const crosswalk = new Map(), mappedEspnPlayers = new Set();
  for (const mapping of playerMappings) {
    if (!mapping || mapping.source !== "verified_espn_sgo_crosswalk" ||
        String(mapping.gameId || "") !== gameId || String(mapping.eventId || "") !== eventId ||
        !mapping.upstreamPlayerId || !mapping.playerId ||
        !gameTeams.has(mapping.team) ||
        (mapping.sgoTeamId && mapping.sgoTeamId !== sgoTeamIds.get(mapping.team)) ||
        !Number.isFinite(mapping.verifiedAt) ||
        mapping.verifiedAt > now || now - mapping.verifiedAt > 48 * 60 * 60 * 1000 ||
        !game.playerProjections.some(p => String(p.playerId) === String(mapping.playerId) &&
           p.team === mapping.team))
      return fail("unverified_player_crosswalk");
    const upstreamId = String(mapping.upstreamPlayerId);
    const espnId = String(mapping.playerId);
    if (crosswalk.has(upstreamId) || mappedEspnPlayers.has(espnId))
      return fail("ambiguous_player_crosswalk");
    crosswalk.set(upstreamId, mapping);
    mappedEspnPlayers.add(espnId);
  }

  const markets = [];
  let unmappedPlayers = 0, skippedMarkets = 0;
  for (const raw of Object.values(event.odds)) {
    if (!raw || typeof raw !== "object") { skippedMarkets++; continue; }
    const category = nflSgoCategory(raw);
    if (!category) { skippedMarkets++; continue; }
    const upstreamId = String(raw.playerID || raw.statEntityID || "");
    const mapped = crosswalk.get(upstreamId);
    if (!mapped) { unmappedPlayers++; continue; }
    // SGO raw odds often have no teamID. Event.players is the documented
    // authoritative SGO player-to-team relationship; never infer from names.
    const eventPlayer = event.players?.[upstreamId];
    const sourceTeamId = String(eventPlayer?.teamID || raw.teamID || "");
    if (!sourceTeamId || sourceTeamId !== sgoTeamIds.get(mapped.team) ||
        (raw.teamID && raw.teamID !== sourceTeamId)) {
      skippedMarkets++; continue;
    }
    let accepted = 0;
    for (const [id, mainOffer] of Object.entries(raw.byBookmaker || {})) {
      const book = BOOK_IDS[String(id).toLowerCase().replace(/[^a-z]/g, "")];
      if (!book || !mainOffer) continue;
      // SGO altLines are optional: only present when upstream explicitly
      // requests includeAltLines=true. Each book/threshold stays independent.
      const offers = [mainOffer, ...(Array.isArray(mainOffer.altLines) ? mainOffer.altLines : [])];
      const seen = new Set();
      for (const offer of offers) {
        if (!offer || offer.available !== true) continue;
        const quoteAt = Date.parse(String(offer.lastUpdatedAt || ""));
        // A recent event fetch does not make an old bookmaker quote fresh.
        if (!Number.isFinite(quoteAt) || quoteAt > now ||
            now - quoteAt > 15 * 60 * 1000) continue;
        const odds = Number(offer.odds);
        if (!Number.isFinite(odds) || !(odds <= -100 || odds >= 100)) continue;
        const rawLine = category === "anytime_td" ? 1 : (offer.overUnder ?? offer.spread);
        if (rawLine === null || rawLine === undefined || rawLine === "" ||
            !Number.isFinite(Number(rawLine)) || Number(rawLine) < 0) continue;
        const key = book + ":" + rawLine + ":" + odds;
        if (seen.has(key)) continue;
        seen.add(key);
        markets.push({
          eventID:eventId, playerID:String(mapped.playerId), team:mapped.team,
          marketName:raw.marketName, statID:raw.statID, periodID:raw.periodID,
          betTypeID:raw.betTypeID, sideID:raw.sideID,
          books:[{book, line:Number(rawLine), odds, available:true}]
        });
        accepted++;
      }
    }
    if (!accepted) skippedMarkets++;
  }
  if (!markets.length)
    return {...fail("no_verified_raw_player_markets"), unmappedPlayers, skippedMarkets};

  const review = reviewSgoGameSnapshot({
    game, event:{eventID:eventId, markets}, eventMapping, picks, capturedAt, now
  });
  return {
    ...review, acceptedMarkets:markets.length, unmappedPlayers, skippedMarkets,
    source:"SportsGameOdds v2 raw odds snapshot", advisoryOnly:true
  };
}
