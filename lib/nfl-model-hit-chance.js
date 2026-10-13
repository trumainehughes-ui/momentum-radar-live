// Model-estimated likelihood of reaching an explicit NFL stat threshold.
// This is NOT Momentum Score, a calibrated true probability, sportsbook implied
// chance, or an independently verified positive-EV betting recommendation.
// Always estimate the exact selected target; never treat a forecast as odds.
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const clamp=(x,min,max)=>Math.max(min,Math.min(max,x));
const CATS=new Set(['td','passing','rushing','receiving','receptions']);
const tail=z=>{
 const a=Math.abs(z),t=1/(1+0.2316419*a);
 const p=Math.exp(-a*a/2)/Math.sqrt(2*Math.PI);
 const lower=p*t*(0.319381530+t*(-0.356563782+t*(1.781477937+
  t*(-1.821255978+t*1.330274429))));
 return clamp(z>=0?lower:1-lower,0,1);
};
export function nflHitTarget(cat,projection){
 if(!CATS.has(cat))return null;
 if(cat==='td')return'Anytime TD';
 if(!finite(projection)||Number(projection)<=0)return null;
 const p=Number(projection);
 return cat==='receptions'?Math.max(1,Math.ceil(p)):
  Math.max(5,Math.round(p/5)*5);
}
export function estimateNflHitChance(x,cat,{target}={}){
 if(!x||!CATS.has(cat))return null;
 if(cat==='td'){
  const p=x.modelTdPercent,e=x.evidence||{};
  if(x.tdModelStatus!=='ESPN_MATCHUP_MODEL'||x.modelOnly!==true||
   !finite(p)||Number(p)<3||Number(p)>73||
   !Number.isInteger(Number(e.games))||Number(e.games)<2||
   !finite(e.opportunitiesPerGame)||Number(e.opportunitiesPerGame)<2)return null;
  return{target:'Anytime TD',percent:Math.round(Number(p)),
   sampleGames:Number(e.games),calibrated:false,
   modelOnly:true,method:'ESPN_MATCHUP_TD_ESTIMATE'};
 }
 const prediction=x.predictiveProjection??x.projection;
 const actualTarget=target===undefined?nflHitTarget(cat,prediction):Number(target);
 const gp=Number(x.gamesPlayed),avg=Number(x.perGame);
 const recent=Array.isArray(x.recentForm?.last10)&&x.recentForm.last10.length>=3?
  x.recentForm.last10:x.recentForm?.last5;
 const values=(Array.isArray(recent)?recent:[]).map(Number)
  .filter(v=>Number.isFinite(v)&&v>=0).slice(-10);
 if(!finite(prediction)||Number(prediction)<=0||!finite(avg)||avg<=0||
  !Number.isInteger(gp)||gp<3||values.length<3||
  !finite(actualTarget)||Number(actualTarget)<1)return null;
 const thresh=Number(actualTarget);
 if(cat!=='receptions'&&(!Number.isInteger(thresh)||thresh%5!==0))return null;
 if(cat==='receptions'&&!Number.isInteger(thresh))return null;
 const estimate=Number(prediction);
 const mean=values.reduce((a,b)=>a+b,0)/values.length;
 const variance=values.reduce((a,b)=>a+(b-mean)**2,0)/(values.length-1);
 const prior=cat==='passing'?Math.max(45,estimate*.25):
  cat==='rushing'?Math.max(15,estimate*.34):
  cat==='receiving'?Math.max(16,estimate*.4):
  Math.max(1.2,estimate*.38);
 const weight=Math.min(.76,values.length/(values.length+5));
 const floor=cat==='passing'?30:cat==='receptions'?1:12;
 const sigma=Math.sqrt(Math.max(floor**2,variance*weight+prior**2*(1-weight)));
 // Zero catch / zero rush observations are preserved as actual history.
 // Shrink early samples and missing opposing-defense evidence toward 50%;
 // do not convert a model ranking to a confidence percentage.
 const sampleReliability=Math.min(.9,.34+Math.min(10,gp)*.065);
 const matchupEvidence=Number(x.matchupRankMost??x.matchup?.rankMost);
 const verifiedDvp=x.matchupRankMost!=null||x.matchup?.rankMost!=null;
 const reliability=sampleReliability*(verifiedDvp&&matchupEvidence>=1&&matchupEvidence<=32?1:.86);
 const continuousThreshold=cat==='receptions'?thresh-.5:thresh-.5;
 const raw=tail((continuousThreshold-estimate)/sigma);
 const percent=clamp(Math.round(100*(.5+(raw-.5)*reliability)),1,99);
 return{target:thresh,percent,sampleGames:gp,historySample:values.length,
  calibrated:false,modelOnly:true,method:'SHRUNK_HISTORICAL_VARIANCE_MODEL',
  interpretation:cat==='receptions'?'AT_LEAST_RECEPTIONS':'AT_LEAST_YARDS'};
}
export function nflHitChanceValid(value,cat,target){
 if(!value||value.calibrated!==false||value.modelOnly!==true||
  !Number.isInteger(value.percent)||value.percent<1||value.percent>99)return false;
 if(cat==='td')return value.target==='Anytime TD'&&
  value.method==='ESPN_MATCHUP_TD_ESTIMATE';
 const wanted=nflHitTarget(cat,target);
 return wanted!==null&&value.target===wanted&&
  value.method==='SHRUNK_HISTORICAL_VARIANCE_MODEL';
}
