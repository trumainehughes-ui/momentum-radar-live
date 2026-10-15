// Compose independently fetched game schedule, server-owned stadium, and NWS weather.
// Advisory only: this function cannot publish bets or alter sportsbook markets.
import {resolveVerifiedNflWeatherGame} from './nfl-weather-verified-game.js';
import {reviewNflStadiumWeather} from './nfl-weather-review.js';
export async function buildVerifiedNflWeatherReport({gameId,registryJson,scheduleFetcher=fetch,weatherFetcher=fetch,now=Date.now()}={}){
 const verified=await resolveVerifiedNflWeatherGame({gameId,registryJson,fetcher:scheduleFetcher,now});
 // Bind forecast evaluation to the kickoff returned by the latest ESPN check.
 const venue={...verified.venue,kickoffAt:verified.schedule.kickoffAt};
 const report=await reviewNflStadiumWeather({gameId:verified.gameId,venue,fetcher:weatherFetcher,now});
 return Object.freeze({gameId:verified.gameId,teams:verified.schedule.teams,venueId:verified.schedule.venueId,
  kickoffAt:verified.schedule.kickoffAt,assessment:report.assessment,explanation:report.explanation,
  paidSportsApiCalls:0,publicationBlocked:true});
}
