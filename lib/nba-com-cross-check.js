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
  const values=source.recent.map(x=>x?.[key]).filter(x=>x!==null&&x!==undefined&&x!=='')\n   .map(Number).filter(x=>Number.isFinite(x)&&x>=0);
  if(values.length<3)return {...p,nbaComCrossCheck:{status:'INSUFFICIENT_SAMPLE'}};
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const original=Number(p.projection);
  const discrepancy=Number.isFinite(original)&&original>0?Math.abs(mean-original)/original:null;
  const usable=values.length>=5&&source.samples>=5&&discrepancy!==null&&discrepancy<=0.35&&\n   Number.isFinite(original)&&original>0;\n  // Bounded 20% NBA.com / 80% ESPN blend; never use an anomalous sample.\n  const blended=usable?Number((original*0.8+mean*0.2).toFixed(2)):original;\n  return {...p,projection:usable?blended:p.projection,\n   nbaComCrossCheck:{status:discrepancy!==null&&discrepancy>0.35?'REVIEW_REQUIRED':'OBSERVED',\n   appliedToProjection:usable,blendWeight:usable?0.2:0,
   source:'nba_api',season:source.season,samples:values.length,
   recentMean:Number(mean.toFixed(2)),modelProjection:Number.isFinite(original)?original:null,
   relativeDifference:discrepancy===null?null:Number(discrepancy.toFixed(3)),
   note:usable?'Bounded NBA.com recent-stat adjustment to ESPN model; no sportsbook offer inferred':'ESPN model unchanged; NBA.com sample not eligible for blending'}};
 });
}
