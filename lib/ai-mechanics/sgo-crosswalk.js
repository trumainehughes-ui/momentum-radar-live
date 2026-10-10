// Deterministic server-side evidence crosswalk from ESPN's NFL roster to
// SportsGameOdds v2 event players. Strict home/away, kickoff and exact identity
// requirements; names alone never verify a sportsbook market or starter role.
// Call with responses fetched by the server, never with untrusted HTTP body data.
const MAX_CAPTURE_AGE = 15 * 60 * 1000;
const MAX_KICKOFF_DELTA = 10 * 60 * 1000;
const nameKey = s => String(s || "").normalize("NFKC").toLowerCase()
  .replace(/[.\u2019']/g, "").replace(/[^\p{L}\p{N}]+/gu, " ").trim().replace(/\s+/g, " ");
const error = reason => ({
  ready:false, advisoryOnly:true, reason, eventMapping:null,
  playerMappings:[], matchedPlayers:0, unresolvedPlayers:0
});

export function buildSgoReadOnlyCrosswalk({game,event,capturedAt,now}={}) {
  const gameId=String(game?.gameId || ""), eventId=String(event?.eventID || "");
  if (!gameId || !eventId || !Array.isArray(game?.teams) ||
      game.teams.length !== 2 || !Array.isArray(game?.playerProjections) ||
      !event?.teams?.home || !event?.teams?.away ||
      !event?.players || Array.isArray(event.players) ||
      typeof event.players !== "object")
    return error("incomplete_game_or_event");
  if (!Number.isFinite(now) || !Number.isFinite(capturedAt) ||
      capturedAt > now || now-capturedAt > MAX_CAPTURE_AGE)
    return error("stale_event_snapshot");
  const espnKickoff=Date.parse(String(game?.kickoff || ""));
  const sgoKickoff=Date.parse(String(event?.startTime || ""));
  if (!Number.isFinite(espnKickoff) || !Number.isFinite(sgoKickoff) ||
      Math.abs(espnKickoff-sgoKickoff)>MAX_KICKOFF_DELTA)
    return error("kickoff_not_correlated");

  // The ESPN game must identify its home and away teams separately.
  const bySide=new Map();
  for(const t of game.teams){
    if(!["home","away"].includes(t?.homeAway) || bySide.has(t.homeAway) ||
       !t.abbr || !t.id) return error("untrusted_espn_team_identity");
    bySide.set(t.homeAway,t);
  }
  if(bySide.size!==2) return error("untrusted_espn_team_identity");
  const teamIds={};
  const usedIds=new Set();
  for(const side of ["home","away"]){
    const t=bySide.get(side), s=event.teams[side];
    const abbr=String(t.abbr).toUpperCase();
    const short=String(s?.names?.short || "").toUpperCase();
    const id=String(s?.teamID || "");
    if(short!==abbr || !id || usedIds.has(id))
      return error("unverified_home_away_team_crosswalk");
    teamIds[abbr]=id;
    usedIds.add(id);
  }

  const roster=new Map(),duplicates=new Set();
  for(const p of game.playerProjections){
    const key=nameKey(p?.name)+"|"+String(p?.team || "");
    if(!nameKey(p?.name) || !p?.playerId || !teamIds[p.team])continue;
    if(roster.has(key))duplicates.add(key);
    else roster.set(key,p);
  }
  const playerMappings=[],seenRosterIds=new Set(),seenSgoIds=new Set();
  let unresolvedPlayers=0;
  for(const [eventKey, player] of Object.entries(event.players)){
    const upstreamId=String(player?.playerID || "");
    if(!upstreamId || upstreamId!==eventKey || seenSgoIds.has(upstreamId)) {
      unresolvedPlayers++; continue;
    }
    seenSgoIds.add(upstreamId);
    const abbr=Object.keys(teamIds).find(a=>teamIds[a]===player?.teamID);
    const display=String(player?.name || player?.names?.display || "").trim();
    const key=nameKey(display)+"|"+String(abbr || "");
    const r=roster.get(key);
    if(!abbr || !display || !r || duplicates.has(key) ||
       seenRosterIds.has(String(r.playerId))) {unresolvedPlayers++;continue}
    seenRosterIds.add(String(r.playerId));
    playerMappings.push({
      gameId,eventId,upstreamPlayerId:upstreamId,
      playerId:String(r.playerId),team:abbr,sgoTeamId:String(player.teamID),
      source:"verified_espn_sgo_crosswalk",verifiedAt:capturedAt,
      matchMethod:"exact_player_name_team_game_time",advisoryOnly:true
    });
  }
  if(!playerMappings.length)
    return {...error("no_unambiguous_player_crosswalk"),unresolvedPlayers};
  return {
    ready:true,advisoryOnly:true,gameId,eventId,
    eventMapping:{gameId,eventId,teamIds},
    playerMappings,matchedPlayers:playerMappings.length,unresolvedPlayers,
    source:"ESPN game roster + SGO event players (strict identity and kickoff)"
  };
}
