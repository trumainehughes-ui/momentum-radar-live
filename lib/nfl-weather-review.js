// Server-side stadium weather orchestration. Uses free NWS forecasts; advisory only.
import {validateNflVenue} from './nfl-venue-validation.js';
import {fetchNwsStadiumForecast} from './nfl-weather-nws.js';
import {evaluateNflWeather} from './nfl-weather-impact.js';
import {explainNflWeatherImpact} from './nfl-weather-explanation.js';
export async function reviewNflStadiumWeather({gameId,venue,fetcher,now=Date.now()}={}){
 if(!/^\d{7,12}$/.test(String(gameId||'')))throw Error('invalid_game_id');
 let verifiedVenue;
 try{verifiedVenue=validateNflVenue({gameId,venue})}catch{
  const assessment=evaluateNflWeather({gameId,venue:{roofStatus:'unknown'},now});
  return {assessment,explanation:explainNflWeatherImpact(assessment),paidSportsApiCalls:0,publicationBlocked:true};
 }
 venue=verifiedVenue;
 const roof=String(venue.roofStatus).toLowerCase();
 if(['closed','indoor','dome'].includes(roof)||!['open','outdoor'].includes(roof)){
  const assessment=evaluateNflWeather({gameId,venue,now});
  return {assessment,explanation:explainNflWeatherImpact(assessment),paidSportsApiCalls:0,publicationBlocked:true};
 }
 try{
  const forecast=await fetchNwsStadiumForecast({latitude:venue?.latitude,longitude:venue?.longitude,
   kickoffAt:venue?.kickoffAt,fetcher,now});
  const assessment=evaluateNflWeather({gameId,venue,forecast,now});
  return {assessment,explanation:explainNflWeatherImpact(assessment),paidSportsApiCalls:0,publicationBlocked:true};
 }catch{
  const assessment=evaluateNflWeather({gameId,venue,now});
  return {assessment,explanation:explainNflWeatherImpact(assessment),paidSportsApiCalls:0,publicationBlocked:true};
 }
}
