// Read-only model research ticket assembly. No sportsbook quote or publish permission.
import {calibratedTierThreshold,scoreCandidateForTier,isCorrelatedWithSlip} from './nfl-sgp-autocorrect.js';
const RULES={Small:{min:2,max:3,yards:1,markets:1,cats:2,td:0},Medium:{min:3,max:4,yards:2,markets:2,cats:2,td:0},Large:{min:3,max:5,yards:3,markets:2,cats:3,td:1},Nuke:{min:5,max:8,yards:3,markets:2,cats:3,td:2}};
const yard=new Set(['passing','rushing','receiving']);
export function synthesizeModelResearchTierFromCategories(risk,categories,gameId,calibration){
 const rule=RULES[risk];if(!rule||!gameId||!calibration)return null;
 const desired={Small:3,Medium:4,Large:5,Nuke:6}[risk];
 const pool=[];
 for(const cat of ['passing','rushing','receiving','receptions']){
  for(const row of Array.isArray(categories?.[cat])?categories[cat]:[]){
   const target=calibratedTierThreshold(row,cat,risk,calibration);
   const score=scoreCandidateForTier(row,cat,risk,calibration);
   if(!Number.isFinite(target)||target<=0||!Number.isFinite(score)||!row?.name||!row?.team)continue;
   pool.push({player:row.name,team:row.team,category:cat,modelTarget:target,
    projection:row.predictiveProjection,score,eventID:String(gameId),
    starterVerified:true,matchupVerified:true});
  }
 }
 pool.sort((a,b)=>b.score-a.score);
 const valid=legs=>{
  const cats=new Set(legs.map(x=>x.category));
  const yards=legs.filter(x=>yard.has(x.category));
  return legs.length>=rule.min&&legs.length<=rule.max&&cats.size>=rule.cats&&
   yards.length>=rule.yards&&new Set(yards.map(x=>x.category)).size>=rule.markets;
 };
 // Enumerate a bounded candidate pool; prefer highest-scoring valid compositions.
 const candidates=pool.slice(0,24);let best=null;
 function visit(start,legs,total){
  if(valid(legs)&&(!best||total>best.score))best={legs:[...legs],score:total};
  if(legs.length>=desired)return;
  for(let i=start;i<candidates.length;i++){
   const x=candidates[i];
   const same=legs.filter(l=>l.player===x.player&&l.team===x.team);
   if(same.length>=2||same.some(l=>l.category===x.category)||!isCorrelatedWithSlip(x,legs,risk))continue;
   legs.push(x);visit(i+1,legs,total+x.score);legs.pop();
  }
 }
 visit(0,[],0);
 if(!best)return null;
 return {risk,mode:'MODEL_RESEARCH',legs:best.legs.map(({player,team,category,projection,modelTarget})=>({player,team,category,projection,modelTarget})),
  legCount:best.legs.length,complete:true,requiredLegs:best.legs.length,
  combinedOddsVerified:false,publishable:false,modelOnly:true,
  reason:'Research-only candidate; sportsbook prices, joint hit probability and settlement are unverified.'};
}
