// NBA.com recent-game cross-check. Never converts research to a sportsbook quote.
export const NBA_STATS=['points','rebounds','assists','threes'];
const statKey={points:'points',rebounds:'rebounds',assists:'assists',threes:'threes'};
export function nbaCrossCheckProjections(projections=[],logs=[]){
 const byName=new Map(logs.filter(x=>x?.samples>=3&&Array.isArray(x.recent))
  .map(x=>[String(x.name||'').trim().toLowerCase(),x]));
 return projections.map(p=>{
  const source=byName.get(String(p.name||'').trim().toLowerCase());
  const key=statKey[p.category];
  if(!source||!key)return {...p,nbaComCrossCheck:{status:'UNAVAILABLE'}};
  const values=source.recent.map(x=>Number(x[key])).filter(Number.isFinite);
  if(values.length<3)return {...p,nbaComCrossCheck:{status:'INSUFFICIENT_SAMPLE'}};
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const original=Number(p.projection);
  const discrepancy=Number.isFinite(original)&&original>0?Math.abs(mean-original)/original:null;
  return {...p,nbaComCrossCheck:{status:discrepancy!==null&&discrepancy>0.35?'REVIEW_REQUIRED':'OBSERVED',
   source:'nba_api',season:source.season,samples:values.length,
   recentMean:Number(mean.toFixed(2)),modelProjection:Number.isFinite(original)?original:null,
   relativeDifference:discrepancy===null?null:Number(discrepancy.toFixed(3)),
   note:'Cross-check only; ESPN model unchanged and no sportsbook offer inferred'}};
 });
}
