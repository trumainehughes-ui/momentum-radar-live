// Bind each saved NFL AI narrative to the *exact* model legs and injury
// observations it actually reviewed. An older Groq narrative may describe
// athletes on IR even after live market cards are corrected. Never display
// that narrative beside a newer, different lineup.
import {createHash} from 'node:crypto';

const risks=['Small','Medium','Nuke'];
const norm=x=>String(x??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const digest=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex').slice(0,24);
const legId=x=>String(x?.playerID||x?.playerId||'').trim();
function modelCards(s){
 if(Array.isArray(s?.sgps))return s.sgps.filter(x=>x?.source==='DATA_MODEL');
 return Array.isArray(s?.sgps?.Analytics)?s.sgps.Analytics:[];
}
export function nflReviewedModelDigest(snapshot){
 const cards=modelCards(snapshot);
 if(!cards.length)return null;
 const rows=risks.map(risk=>{
  const card=cards.find(x=>x?.risk===risk);
  if(!card)return[risk,null];
  if(!Array.isArray(card.legs)||card.legs.length<2||card.legs.length>7)return null;
  const legs=card.legs.map(x=>{
   const cat=String(x?.category||x?.cat||'').toLowerCase();
   const threshold=cat==='td'?'TD':Number(x?.analyticsThreshold??x?.threshold??x?.line);
   const athlete=legId(x),team=norm(x?.team);
   if(!athlete||!team||!['td','passing','rushing','receiving','receptions'].includes(cat)||
     cat!=='td'&&(!Number.isFinite(threshold)||threshold<=0))return null;
   return [athlete,team,cat,threshold];
  });
  if(legs.some(x=>!x))return null;
  return[risk,legs.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))];
 });
 if(rows.some(x=>!x))return null;
 return digest(rows);
}
export function nflReviewedInjuryDigest(rows){
 if(!Array.isArray(rows))return null;
 const entries=rows.filter(x=>
  ['IR','OUT','INACTIVE','DOUBTFUL','QUESTIONABLE','SUSPENDED','PUP','NFI']
   .includes(String(x?.status||'').toUpperCase()))
 .map(x=>[String(x.playerId||x.playerID||''),norm(x.name),norm(x.team),
  String(x.status).toUpperCase()])
 .filter(x=>x[1]&&x[2]);
 return digest(entries.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
}
export function nflAiReviewMarketAgreement(history,market,{
 date,gameId,now=Date.now(),freshMs=15*60*1000
}={}){
 const current=market?.body,review=history?.aiReview,at=Number(market?.at);
 if(current?.ok!==true||String(current?.gameId)!==String(gameId)||
  current?.date!==date||!Number.isFinite(at)||at<=0||
  at>now+60_000||now-at>freshMs)
  return{ok:false,status:'MODEL_REFRESH_PENDING'};
 const historical=nflReviewedModelDigest(history),
  currentModel=nflReviewedModelDigest(current),
  oldInjuries=nflReviewedInjuryDigest(history?.injuryEvidence),
  currentInjuries=nflReviewedInjuryDigest(current?.validation?.injuryEvidence);
 // Legacy AI text without attached exact-evidence fingerprints is not
 // safe to display against a current changing market. Let the protected
 // scheduled collector re-review the new game state, without a public paid call.
 if(!historical||!currentModel||!oldInjuries||!currentInjuries||
   !review?.modelSelectionDigest||!review?.injurySelectionDigest||
   review.modelSelectionDigest!==historical||
   review.injurySelectionDigest!==oldInjuries||
   historical!==currentModel||oldInjuries!==currentInjuries)
  return{ok:false,status:'AI_REVIEW_NEEDS_REVALIDATION'};
 return{ok:true,status:'AI_AND_MARKET_MATCH'};
}
