// Read-only bridge from ALREADY FETCHED ESPN game/role evidence to the
// ALREADY FETCHED SportsGameOdds NFL snapshot. No network, mutation or bets.
import { buildSgoReadOnlyCrosswalk } from "./sgo-crosswalk.js";
import { reviewRawSgoGameSnapshot } from "./sgo-raw-event.js";

const pending = (reason, extras={}) => ({
  ready:false, crosswalkVerified:false, quoteRows:0, matchedPlayers:0,
  advisoryOnly:true, publishingDisabled:true, combinedSgpQuoteVerified:false,
  reason, ...extras
});

export function inspectNflSgoShadow({
  gameIdentity, rolePlayers=[], events=[], capturedAt, now
}={}) {
  if (!gameIdentity?.gameId || !Array.isArray(gameIdentity?.teams) ||
      gameIdentity.teams.length!==2 || !gameIdentity.kickoff)
    return pending("espn_game_identity_missing");
  if (!Array.isArray(rolePlayers) || !rolePlayers.length)
    return pending("espn_player_roster_missing");
  if (!Array.isArray(events) || !events.length)
    return pending("sgo_event_snapshot_unavailable");
  if (!Number.isFinite(now) || !Number.isFinite(capturedAt) ||
      capturedAt>now || now-capturedAt>15*60*1000)
    return pending("sgo_snapshot_stale");

  const game={...gameIdentity,playerProjections:rolePlayers};
  const valid=[];
  for (const event of events) {
    if (event?.leagueID!=="NFL") continue;
    // Independently verify side, kickoff and two team identities in the
    // crosswalk. Never rely solely on a team name or an event list ranking.
    const crosswalk=buildSgoReadOnlyCrosswalk({game,event,capturedAt,now});
    if (crosswalk.ready)valid.push({event,crosswalk});
  }
  if (!valid.length) return pending("game_event_player_crosswalk_unavailable");
  if (valid.length!==1) return pending("ambiguous_sgo_event_identity",{
    matchingEvents:valid.length
  });
  const {event,crosswalk}=valid[0];
  // We pass NO requested bets. reviewRawSgoGameSnapshot only determines if
  // source quote rows can be safely normalized; it never recommends or
  // publishes a player prop.
  const shadow=reviewRawSgoGameSnapshot({
    game,event,eventMapping:crosswalk.eventMapping,
    playerMappings:crosswalk.playerMappings,picks:[],capturedAt,now
  });
  const quoteRows=Number(shadow.acceptedMarkets)||0;
  return {
    ready:quoteRows>0,crosswalkVerified:true,quoteRows,
    matchedPlayers:crosswalk.matchedPlayers,
    unmappedPlayers:Number(shadow.unmappedPlayers)||0,
    sourceEventId:String(event.eventID),
    advisoryOnly:true,publishingDisabled:true,
    combinedSgpQuoteVerified:false,
    reason:quoteRows>0?"shadow_identity_and_book_quotes_observed":
      shadow.reason||"no_eligible_book_quotes"
  };
}
