// Cross-check the server-owned venue registry against the live ESPN event.
import {resolveServerWeatherVenue} from './nfl-weather-trusted-venue.js';
import {fetchVerifiedEspnNflGame} from './nfl-weather-espn-fetch.js';
export async function resolveVerifiedNflWeatherGame({gameId,fetcher=fetch,registryJson,now=Date.now()}={}){
 const id=String(gameId||'');
 const venue=resolveServerWeatherVenue({gameId:id,registryJson});
 const schedule=await fetchVerifiedEspnNflGame({gameId:id,fetcher});
 const kickoffDifference=Math.abs(Date.parse(schedule.kickoffAt)-Date.parse(venue.kickoffAt));
 if(!Number.isFinite(kickoffDifference)||kickoffDifference>60*1000)throw Error('schedule_venue_kickoff_mismatch');
 const teams=[venue.awayTeam,venue.homeTeam].map(x=>String(x||'').toUpperCase());
 if(teams.some(x=>!/^[A-Z]{2,4}$/.test(x))||new Set(teams).size!==2)throw Error('venue_teams_missing');
 if(teams.sort().join(',')!==[...schedule.teams].sort().join(','))throw Error('schedule_venue_teams_mismatch');
 return Object.freeze({gameId:id,venue:Object.freeze({...venue}),schedule});
}
