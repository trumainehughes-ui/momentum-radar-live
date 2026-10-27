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
