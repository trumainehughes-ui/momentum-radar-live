// Server-only, read-only shadow validation entry point.
// Do not accept crosswalks from HTTP request bodies. Derive them from
// trusted ESPN and SGO upstream objects inside this function.
import { buildSgoReadOnlyCrosswalk } from "./sgo-crosswalk.js";
import { reviewRawSgoGameSnapshot } from "./sgo-raw-event.js";

export function reviewServerSgoShadow({game,event,picks=[],capturedAt,now}={}) {
  const crosswalk=buildSgoReadOnlyCrosswalk({game,event,capturedAt,now});
  if (!crosswalk.ready) return {
    ready:false, reason:crosswalk.reason, reviewed:[], advisoryOnly:true,
    publishingDisabled:true, matchedPlayers:0, unresolvedPlayers:crosswalk.unresolvedPlayers
  };
  const reviewed=reviewRawSgoGameSnapshot({
    game,event,picks,capturedAt,now,
    eventMapping:crosswalk.eventMapping,
    playerMappings:crosswalk.playerMappings
  });
  return {
    ...reviewed, advisoryOnly:true,publishingDisabled:true,
    matchedPlayers:crosswalk.matchedPlayers,
    unresolvedPlayers:crosswalk.unresolvedPlayers,
    crosswalkMethod:"strict_game_time_home_away_exact_player_name_team",
    combinedSgpQuoteVerified:false
  };
}
