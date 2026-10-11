// Server-side book-specific SGP rebuild. A leg must be actually offered by
// the SAME sportsbook. Small uses conservative floors; Medium moves toward
// verified model expectations; Nuke uses separately vetted ceiling logic.
// A collection of individual listed prop prices is NEVER a combined SGP quote.
import {modelNflSgpStatThreshold} from './ai-mechanics/nfl-sgp-tiers.js';
const CATS=new Set(['passing','rushing','receiving','receptions']);
const YARD=new Set(['passing','rushing','receiving']);
const numeric=x=>x===null||x===undefined||x===''?null:
 Number.isFinite(Number(x))?Number(x):null;
export function nflOfferedOverThreshold(offer,cat){
 if(cat==='td')return 'Anytime TD';
 if(!CATS.has(cat)||offer?.available===false)return null;
 const raw=String(offer?.line??'').trim();
 if(!raw)return null;
 let threshold=null;
 // The normal book prop is Over x.5 for an integer settlement threshold.
 // Some alternate markets supply N+ directly; never treat Under as Over.
 if(/^\d+(?:\.\d+)?\+$/.test(raw))threshold=Number(raw.slice(0,-1));
 else if(/^\d+\.5$/.test(raw))threshold=Math.floor(Number(raw))+1;
 else if(/^\d+$/.test(raw))threshold=Number(raw);
 if(!Number.isSafeInteger(threshold)||threshold<=0)return null;
 if(YARD.has(cat)&&threshold%5!==0)return null;
 return threshold;
}
export function rebuildNflBookTierPools(basePool,groups,modelTarget,{
 maxCandidatesPerStat=18
}={}){
 const tiers={Small:[],Medium:[],Nuke:[]};
 const first=Array.isArray(basePool)?basePool:[];
 for(const original of first){
  const cat=String(original?.cat||'').toLowerCase(),
   group=groups instanceof Map?groups.get(String(original?.playerID||'')+'|'+cat):null,
   offers=Array.isArray(group)?group.filter(x=>x?.bookOffer?.available!==false)
    .slice(0,maxCandidatesPerStat):[];
  if(cat==='td'){
   for(const risk of ['Small','Medium','Nuke']){
    if(offers.length)tiers[risk].push({...offers[0],bookTierTarget:'Anytime TD',
     bookTierMode:'TOUCHDOWN_SUPPLEMENT_ONLY'});
   }
   continue;
  }
  if(!CATS.has(cat)||!offers.length)continue;
  const targets={};
  for(const risk of ['Small','Medium']){
   const requested=typeof modelTarget==='function'?modelTarget(original,cat,risk):null;
   targets[risk]=modelNflSgpStatThreshold(original,cat,risk,requested);
  }
  const options=offers.map(x=>({row:x,
   threshold:nflOfferedOverThreshold(x.bookOffer,cat)}))
   .filter(x=>x.threshold!==null);
  // Do not lift Small above its conservative source/model floor.
  const small=options.filter(x=>targets.Small!==null&&
   x.threshold<=targets.Small).sort((a,b)=>
    targets.Small-b.threshold-(targets.Small-a.threshold)||
    (Number(b.row.momentumScore)||0)-(Number(a.row.momentumScore)||0))[0];
  if(small)tiers.Small.push({...small.row,bookTierTarget:small.threshold,
   modelTierTarget:targets.Small,bookTierMode:'CONSERVATIVE_FLOOR',
   modelSupportedThreshold:true});
  // Medium is genuinely MORE demanding than Small in the same market when
  // an eligible book alternate exists. Never relabel the Small line Medium.
  const medium=options.filter(x=>targets.Medium!==null&&
   x.threshold<=targets.Medium&&
   (!small||x.threshold>small.threshold)).sort((a,b)=>
    targets.Medium-b.threshold-(targets.Medium-a.threshold)||
    (Number(b.row.momentumScore)||0)-(Number(a.row.momentumScore)||0))[0];
  if(medium)tiers.Medium.push({...medium.row,bookTierTarget:medium.threshold,
   modelTierTarget:targets.Medium,bookTierMode:'ELEVATED_EXPECTATION',
   modelSupportedThreshold:true});
  // Do not force a Medium market if it has no distinct, genuinely offered
  // threshold. Missing data is more honest than fabricating extra risk.
 }
 return tiers;
}
