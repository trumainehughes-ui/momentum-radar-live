// Research-only calibration; never publishes sportsbook lines or mutates SGPs.
const CATS=['passing','rushing','receiving','receptions','td'];
const TIERS=['Small','Medium','Large','Nuke'];
const finite=n=>typeof n==='number'&&Number.isFinite(n);
const cat=v=>String(v??'').toLowerCase();
const bounded=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
export function diagnoseAndCalibrateHistory(games=[],{minSamples=20}={}){
 const categories=Object.fromEntries(CATS.map(c=>[c,{hits:0,misses:0,errors:[]}]));
 const tiers=Object.fromEntries(TIERS.map(t=>[t,{hits:0,misses:0,unresolved:0}]));
 const exclusions={unverified:0,incomplete:0};
 for(const game of Array.isArray(games)?games:[]){
  const kickoff=Date.parse(game?.kickoffAt),locked=Date.parse(game?.lockedAt);
  if(game?.finalVerified!==true||!Number.isFinite(kickoff)||!Number.isFinite(locked)||locked>=kickoff){exclusions.unverified++;continue;}
  for(const pick of Array.isArray(game.picks)?game.picks:[]){
   const c=cat(pick?.category??pick?.cat),g=pick?.grade;
   if(!categories[c]||g?.sourceVerified!==true||!finite(g.actual)||!finite(g.target)||!['over','under'].includes(pick?.direction)){exclusions.incomplete++;continue;}
   const hit=pick.direction==='over'?g.actual>g.target:g.actual<g.target;
   if(g.actual===g.target){exclusions.incomplete++;continue;}
   categories[c][hit?'hits':'misses']++;
   if(finite(g.projectionAtLock))categories[c].errors.push(g.actual-g.projectionAtLock);
  }
  for(const sgp of Array.isArray(game.sgps)?game.sgps:[]){
   const tier=tiers[sgp?.risk??sgp?.tier];if(!tier)continue;
   if(sgp?.settlementVerified!==true||!['win','loss'].includes(sgp?.settlement)){tier.unresolved++;continue;}
   tier[sgp.settlement==='win'?'hits':'misses']++;
  }
 }
 const categoryAdjustments={};
 for(const [c,s] of Object.entries(categories)){
  const n=s.hits+s.misses;
  if(n<minSamples||s.errors.length<minSamples){categoryAdjustments[c]=null;continue;}
  const mean=s.errors.reduce((a,b)=>a+b,0)/s.errors.length;
  const bias=mean<0&&c!=='td'?bounded(1+mean/Math.max(100,Math.abs(mean)*10),0.9,1):1;
  categoryAdjustments[c]=Number(bias.toFixed(3));
 }
 return {categories,tiers,categoryAdjustments,exclusions,publishable:false};
}
export function calibratedTierThreshold(player,category,tier,calibration){
 const c=cat(category),p=player?.predictiveProjection;
 if(!['passing','rushing','receiving','receptions'].includes(c)||!TIERS.includes(tier)||!finite(p)||p<=0)return null;
 const adj=calibration?.categoryAdjustments?.[c];
 if(!finite(adj)||adj<0.9||adj>1)return null;
 const recent=player?.recentFive;
 if(!Array.isArray(recent)||recent.length<5||recent.some(x=>!finite(x)||x<0)||player?.starterVerified!==true||player?.matchupVerified!==true)return null;
 const rank=player?.matchupRankMost;
 if(!Number.isInteger(rank)||rank<1||rank>32)return null;
 const sorted=[...recent].sort((a,b)=>a-b),proj=p*adj;
 const factors={Small:0.7,Medium:0.82,Large:0.98,Nuke:1.1};
 const desired=proj*factors[tier];
 const cap=tier==='Nuke'?Math.max(...sorted):tier==='Large'?Math.max(...sorted):sorted[1];
 const step=c==='receptions'?1:c==='passing'?10:5;
 const target=Math.floor(Math.min(desired,cap)/step)*step;
 return target>0?target:null;
}
// A game-script warning is a review signal, not proof of negative correlation.
export function assessSlipCorrelation(candidate,legs=[],tier='Small'){
 if(!['Large','Nuke'].includes(tier))return {allowed:true,warnings:[]};
 const team=String(candidate?.team??'').toUpperCase(),category=cat(candidate?.category??candidate?.cat);
 const same=legs.filter(l=>String(l?.team??'').toUpperCase()===team);
 const warnings=[];
 if(team&&((category==='passing'&&same.some(l=>cat(l.category??l.cat)==='rushing'))||(category==='rushing'&&same.some(l=>cat(l.category??l.cat)==='passing'))))warnings.push('REVIEW_PASS_RUSH_GAME_SCRIPT');
 if(team&&category==='receiving'&&same.some(l=>cat(l.category??l.cat)==='receiving'))warnings.push('REVIEW_SHARED_RECEIVING_VOLUME');
 return {allowed:true,warnings};
}
