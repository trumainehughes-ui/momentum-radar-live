// Scheduled NBA game read fallback — only verified ESPN scoreboard identities.
// Allows an *existing* day-ahead snapshot to be viewed before ESPN publishes
// the detailed game summary. Never implies live stats, starters or book props.
import {parseNbaScoreboard,nbaNotReadyTiers} from './nba-data-model.js';
export function nbaEasternGameDay(timestamp){
 const date=new Date(timestamp);
 if(!Number.isFinite(date.getTime()))return null;
 const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{
  timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
 }).formatToParts(date).filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 return p.year+p.month+p.day;
}
export function nbaVerifiedScheduledFallback(raw,gameId,snapshot){
 if(!snapshot||String(snapshot.gameId)!==String(gameId)||!Array.isArray(raw?.events))
  return null;
 const day=nbaEasternGameDay(snapshot.kickoff);
 if(!day)return null;
 const slate=parseNbaScoreboard(raw,day);
 const game=slate.games.find(x=>x.gameId===String(gameId)&&x.status==='SCHEDULED');
 if(!game||!game.home.id||!game.away.id)return null;
 const incoming=Date.parse(game.kickoff),stored=Date.parse(snapshot.kickoff);
 if(!Number.isFinite(incoming)||!Number.isFinite(stored)||Math.abs(incoming-stored)>60000)
  return null;
 // New snapshots contain the original team identities. Older snapshots may
 // omit them, but the ESPN scoreboard still supplies both sides and game ID.
 if(snapshot.home?.abbr&&snapshot.home.abbr!==game.home.abbr)return null;
 if(snapshot.away?.abbr&&snapshot.away.abbr!==game.away.abbr)return null;
 return{ok:true,gameId:String(gameId),status:'SCHEDULED',
  matchup:{home:{abbr:game.home.abbr,name:game.home.name},
   away:{abbr:game.away.abbr,name:game.away.name}},
  players:[],injuries:[],source:'ESPN NBA scoreboard (detailed game summary pending)',
  fetchedAt:new Date().toISOString(),pregameSourceMode:'SCOREBOARD_VERIFIED_FALLBACK',
  injuryEvidenceStatus:'ESPN_GAME_SUMMARY_UNAVAILABLE',
  validation:{gameIdentityChecked:true,playerGameIdentityChecked:false,
   observedBoxscoreOnly:true,pregameProjectionsAvailable:false,
   officialInactivesVerified:false,sportsbookMarketsVerified:false,
   combinedSgpOddsVerified:false},
  sgps:nbaNotReadyTiers('Pregame snapshot is unavailable or too old for the current stage.')};
}
