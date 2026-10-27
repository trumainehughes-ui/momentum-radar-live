// NBA.com recent-game cross-check. Never converts research to a sportsbook quote.
export const NBA_STATS=['points','rebounds','assists','threes'];
const statKey={points:'points',rebounds:'rebounds',assists:'assists',threes:'threes'};
export function nbaCrossCheckProjections(projections=[],logs=[]){
 const byName=new Map(logs.filter(x=>x?.samples>=1&&Array.isArray(x.recent))
  .map(x=>[String(x.name||'').trim().toLowerCase(),x]));
 return projections.map(p=>{
  const source=byName.get(String(p.name||'').trim().toLowerCase());
  const key=statKey[p.category];
  if(!source||!key)return {...p,nbaComCrossCheck:{status:'UNAVAILABLE'}};
  const values=source.recent.map(x=>x?.[key]).filter(x=>x!==null&&x!==undefined&&x!=='')\n   .map(Number).filter(x=>Number.isFinite(x)&&x>=0);
  if(values.length<1)return {...p,nbaComCrossCheck:{status:'INSUFFICIENT_SAMPLE'}};
  const mean=values.reduce((a,b)=>a+b,0)/values.length;
  const original=Number(p.projection);
  const discrepancy=Number.isFinite(original)&&original>0?Math.abs(mean-original)/original:null;
  const usable=values.length>=1&&source.samples>=1&&discrepancy!==null&&discrepancy<=0.35&&\n   Number.isFinite(original)&&original>0;\n  // Early-season NBA.com samples earn 4% weight per verified game, capped at 20%;
  // the ESPN historical baseline remains dominant. Never use an anomalous sample.\n  const weight=usable?Math.min(0.2,values.length*0.04):0;
  const blended=usable?Number((original*(1-weight)+mean*weight).toFixed(2)):original;\n  return {...p,projection:usable?blended:p.projection,\n   nbaComCrossCheck:{status:discrepancy!==null&&discrepancy>0.35?'REVIEW_REQUIRED':'OBSERVED',\n   appliedToProjection:usable,blendWeight:weight,
   source:'nba_api',season:source.season,samples:values.length,
   recentMean:Number(mean.toFixed(2)),modelProjection:Number.isFinite(original)?original:null,
   relativeDifference:discrepancy===null?null:Number(discrepancy.toFixed(3)),
   note:usable?'Bounded NBA.com recent-stat adjustment to ESPN model; no sportsbook offer inferred':'ESPN model unchanged; NBA.com sample not eligible for blending'}};
 });
}
