// Read-only weather intelligence report for a single NFL player and upcoming game.
// Historical data must already be joined from verified stats and weather sources.
import {playerWeatherSplits} from './nfl-player-weather-splits.js';
import {evaluateNflWeather} from './nfl-weather-impact.js';
import {explainNflWeatherImpact} from './nfl-weather-explanation.js';
const STAT_LABELS={passingYards:'Passing yards',rushingYards:'Rushing yards',receivingYards:'Receiving yards',receptions:'Receptions'};
export function buildNflWeatherPlayerReport({playerId,playerName,stat,historyRows,gameId,venue,forecast,now}={}){
 if(!Object.hasOwn(STAT_LABELS,stat))throw Error('unsupported_weather_report_stat');
 const assessment=evaluateNflWeather({gameId,venue,forecast,now});
 const explanation=explainNflWeatherImpact(assessment);
 const history=playerWeatherSplits({playerId,stat,rows:historyRows||[]});
 const comparable=assessment.status==='FORECAST_REVIEWED'?
  assessment.weather.windMph>=15?'windy':assessment.weather.windMph<=10?'calm':null:null;
 const split=comparable?history.splits[comparable]:null;
 const enough=split?.confidence==='descriptive_sample';
 return {gameId:String(gameId),playerId:String(playerId),playerName:String(playerName||''),stat,label:STAT_LABELS[stat],
  weatherStatus:assessment.status,severity:assessment.severity,forecast:assessment.weather||null,
  explanation:explanation.message,insights:explanation.insights,
  historicalComparison:comparable?{condition:comparable,games:split.games,average:split.average,
   sampleStatus:split.confidence}:null,
  displayMessage:assessment.status!=='FORECAST_REVIEWED'?'Verified kickoff weather unavailable.':
   !comparable?'Wind is in a transitional range; no direct windy/calm historical comparison.':
   !enough?'Historical weather sample is too small for a reliable player-level adjustment.':
   'Historical weather average is descriptive only; account for opponents, role and game script.',
  verifiedPlayerProp:false,playerAdjustmentsAllowed:false,canPublish:false,
  nextChecks:['verified player starter and injury status','opponent defense and usage','verified book-specific prop line and odds','SGP tier and market availability']};
}
