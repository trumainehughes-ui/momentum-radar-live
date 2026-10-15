// Join official/statistical game logs to independently sourced game-time weather.
// Never infer weather from a city name, season, or game date alone.
export function joinPlayerGameWeather({gameLogs,weatherObservations}={}){
 if(!Array.isArray(gameLogs)||!Array.isArray(weatherObservations))throw Error('invalid_weather_join_input');
 const weatherByGame=new Map();
 for(const weather of weatherObservations){
  if(!weather?.gameId||!weather?.weatherSource||!weather?.observedAt||!weather?.kickoffAt)continue;
  const t=Date.parse(weather.observedAt),k=Date.parse(weather.kickoffAt);
  if(!Number.isFinite(t)||!Number.isFinite(k)||Math.abs(t-k)>3600000)continue;
  if(weatherByGame.has(String(weather.gameId))){weatherByGame.set(String(weather.gameId),null);continue}
  weatherByGame.set(String(weather.gameId),weather);
 }
 const joined=[];
 for(const log of gameLogs){
  if(!log?.gameId||!log?.playerId||!log?.statsSource)continue;
  const weather=weatherByGame.get(String(log.gameId));
  if(!weather||String(log.gameId)!==String(weather.gameId))continue;
  const kickoffLog=Date.parse(log.kickoffAt||''),kickoffWeather=Date.parse(weather.kickoffAt||'');
  if(!Number.isFinite(kickoffLog)||kickoffLog!==kickoffWeather)continue;
  if(log.roofStatus!==weather.roofStatus||log.roofStatus!=='outdoor')continue;
  joined.push({...log,windMph:weather.windMph??null,temperatureF:weather.temperatureF??null,
   precipitationInches:weather.precipitationInches??null,weatherSource:weather.weatherSource,
   observedAt:weather.observedAt});
 }
 return joined;
}
