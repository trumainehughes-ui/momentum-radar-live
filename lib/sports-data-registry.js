// Lightweight, extensible sports-data source registry.
// Research data only: never provides sportsbook lines or prices.
export const SPORTS_DATA_REGISTRY = Object.freeze({
  NBA: Object.freeze({enabled:true,primary:'espn',crossCheck:['nba_api_live'],features:['schedule','roster','boxscore','player_history','matchups']}),
  NFL: Object.freeze({enabled:true,primary:'espn',crossCheck:['nfl_official'],features:['schedule','roster','boxscore','play_by_play','injuries','matchups']}),
  MLB: Object.freeze({enabled:true,primary:'mlb_official',crossCheck:['espn','statcast'],features:['schedule','roster','boxscore','play_by_play','pitcher_batter','park_weather']}),
  WNBA: Object.freeze({enabled:false,primary:null,crossCheck:[],features:['schedule','roster','boxscore','player_history']}),
  NHL: Object.freeze({enabled:false,primary:null,crossCheck:[],features:['schedule','roster','boxscore','player_history']}),
  NCAAF: Object.freeze({enabled:false,primary:null,crossCheck:[],features:['schedule','roster','play_by_play']}),
  NCAAB: Object.freeze({enabled:false,primary:null,crossCheck:[],features:['schedule','roster','boxscore']})
});
export function getSportsDataConfig(league) {
  const key=String(league||'').trim().toUpperCase();
  const config=SPORTS_DATA_REGISTRY[key];
  if(!config) return {ok:false,league:key,error:'UNSUPPORTED_LEAGUE'};
  return {ok:true,league:key,...config,sportsbookVerified:false};
}
export function isSportsDataEnabled(league) {
  return getSportsDataConfig(league).enabled===true;
}

/**
 * Validate third-party research evidence before it reaches a prediction model.
 * This does not authenticate sportsbook offers or establish projection accuracy.
 */
export function validateSportsResearchEvidence(league, evidence, {maxAgeMinutes=180}={}) {
 const config=getSportsDataConfig(league);
 if(!config.ok||!config.enabled)return {ok:false,reason:'LEAGUE_NOT_ENABLED'};
 if(!evidence||typeof evidence!=='object'||Array.isArray(evidence))return {ok:false,reason:'INVALID_EVIDENCE'};
 const source=String(evidence.source||'').trim();
 if(!source||![config.primary,...config.crossCheck].includes(source))return {ok:false,reason:'UNAPPROVED_SOURCE'};
 const observed=Date.parse(String(evidence.observedAt||''));
 if(!Number.isFinite(observed))return {ok:false,reason:'MISSING_TIMESTAMP'};
 const age=Date.now()-observed;
 if(age< -60000||age>maxAgeMinutes*60000)return {ok:false,reason:'STALE_OR_FUTURE_EVIDENCE'};
 if(!Array.isArray(evidence.records)||evidence.records.length===0)return {ok:false,reason:'EMPTY_RECORDS'};
 if(evidence.records.some(record=>!record||typeof record!=='object'||Array.isArray(record)))return {ok:false,reason:'INVALID_RECORD_SHAPE'};
 if(evidence.records.length>10000)return {ok:false,reason:'TOO_MANY_RECORDS'};
 return {ok:true,league:config.league,source,records:evidence.records.length,
  observedAt:new Date(observed).toISOString(),sportsbookVerified:false};
}
