// Historical player performance grouped by observed game-time weather.
// Input rows must be source-joined player game logs + historical observations.
// Descriptive only: no causal claim, odds generation, or automatic prop edits.
const numeric=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
export function playerWeatherSplits({playerId,stat,rows,minimumGames=8}={}){
 if(!playerId||!['passingYards','rushingYards','receivingYards','receptions','passingTDs','rushingTDs','receivingTDs'].includes(stat)||!Array.isArray(rows))
  throw Error('invalid_weather_splits_request');
 const buckets={windy:[],calm:[],cold:[],warm:[],wet:[],dry:[]};
 const seen=new Set();
 for(const row of rows){
  if(String(row.playerId)!==String(playerId)||!row.gameId||seen.has(row.gameId)||row.roofStatus!=='outdoor')continue;
  if(!row.statsSource||!row.weatherSource||!row.observedAt||!row.kickoffAt)continue;
  const observed=Date.parse(row.observedAt),kickoff=Date.parse(row.kickoffAt);
  if(!Number.isFinite(observed)||!Number.isFinite(kickoff)||Math.abs(observed-kickoff)>60*60*1000)continue;
  const value=numeric(row[stat]),wind=numeric(row.windMph),temp=numeric(row.temperatureF),precip=numeric(row.precipitationInches);
  if(value===null||value<0||[wind,temp,precip].every(x=>x===null))continue;
  seen.add(row.gameId);
  if(wind!==null&&wind>=15)buckets.windy.push(value);
  if(wind!==null&&wind<=10)buckets.calm.push(value);
  if(temp!==null&&temp<=35)buckets.cold.push(value);
  if(temp!==null&&temp>=50)buckets.warm.push(value);
  if(precip!==null&&precip>=0.05)buckets.wet.push(value);
  if(precip!==null&&precip===0)buckets.dry.push(value);
 }
 const summary={};
 for(const [condition,values] of Object.entries(buckets)){
  const games=values.length;
  summary[condition]={games,average:games?Math.round(values.reduce((a,b)=>a+b,0)/games*10)/10:null,
   confidence:games>=minimumGames?'descriptive_sample':'small_sample',usableForPlayerAdjustment:false};
 }
 return {playerId:String(playerId),stat,minimumGames,splits:summary,advisoryOnly:true,
  canPublish:false,warning:'Weather splits are observational and confounded by opponent, role, season, and game script. Never treat as a causal or independently calibrated prop probability.'};
}
