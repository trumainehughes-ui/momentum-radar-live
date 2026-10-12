// Non-authoritative Groq/OpenRouter review of already rebuilt SGPs.
// This must never choose a player, change numeric model thresholds, or
// masquerade as sportsbook-verified odds.
const MAX=1400;
import { validateBookOffer } from './sportsbook-market-verification.js';
// The AI only sees offers that pass deterministic validation; it cannot invent prices.
export function aiSafeMarketEvidence(offers, now=Date.now()){
 return (Array.isArray(offers)?offers:[]).filter(x=>validateBookOffer(x,now).ok)
  .slice(0,40).map(x=>({book:x.book,sport:x.sport,gameId:x.gameId,playerId:x.playerId,
   market:x.market,line:x.line,americanOdds:x.americanOdds,checkedAt:x.checkedAt,sourceUrl:x.sourceUrl}));
}
const short=x=>String(x??'').slice(0,MAX);
export function pregameAiEvidence(league,game,snapshot){
 const allowed=new Set([game.home?.abbr,game.away?.abbr].filter(Boolean));
 const source=league==='nba'?snapshot.sgps:(snapshot.sgps||[]).filter(x=>x.source==='DATA_MODEL');
 const cards=(source||[]).filter(x=>Array.isArray(x.legs)&&x.legs.length>0)
 .map(x=>({
  source:'Analytics',risk:x.risk,combinedBookQuoteVerified:false,
  legs:x.legs.slice(0,7).map(l=>({
   name:short(l.name).slice(0,80),team:l.team,
   playerId:l.playerId||l.playerID||null,
   eventID:l.gameId||l.eventID||game.gameId,
   category:l.category||l.cat,
   projection:l.projection??l.projectionAtLock??null,
   modelThreshold:l.threshold??l.analyticsThreshold??null,
   sampleGames:l.sampleGames||null,
   rosterPresent:allowed.has(l.team)
  }))
 })).slice(0,3);
 const injuries=(league==='nba'?snapshot.verifiedInjuries:snapshot.injuryEvidence)||[];
 const matchup=league==='nfl'?snapshot.matchupEvidence||null:null;
 const checked=snapshot.injuryChecks?.rosterAndInjuryEligibilityChecked===true;
 return {gameId:game.gameId,league,game:{homeAbbr:game.home?.abbr,awayAbbr:game.away?.abbr},
  model:{validation:{sportsbookVerificationAvailable:false,
   injuryEligibilityChecked:checked},fetchedAt:snapshot.checkedAt||snapshot.lockedAt,
   degraded:league==='nfl'&&matchup?.status!=='BILATERAL_EVIDENCE'},
  sgps:cards,
  matchup:matchup?{sides:matchup.sides||[],rankMeaning:matchup.rankMeaning,
   modelOnly:true,source:matchup.source,risks:matchup.risks||[]}:null,
  playerAvailability:{skillPositionAlerts:injuries.slice(0,15).map(x=>({
   name:x.name,team:x.team,status:x.status,source:x.source||'ESPN_REPORTED'
  })),injuryEligibilityChecked:checked,officialInactivesVerified:false},
  injuries:injuries.slice(0,15).map(x=>({name:x.name,team:x.team,status:x.status})),
  verifiedIndividualOffers:aiSafeMarketEvidence(snapshot.verifiedIndividualOffers||[]),
  sourceNotes:league==='nba'?
   'ESPN team rosters and historical box scores; early sample; official starters/bookmaker odds not verified':
   'ESPN completed-box-score offense vs opponent defense in BOTH directions, with positional samples, role/injury gating and model-only SGPs; no bookmaker-combined quote has been established.',
  checkedAt:snapshot.checkedAt||snapshot.lockedAt};
}
export async function pregameAiAudit(league,game,snapshot,{
 fetcher=fetch,base='https://momentum-radar-live.vercel.app',timeout=10000
}={}){
 if(!['nfl','nba'].includes(league))return{status:'SKIPPED',reason:'invalid_league'};
 const data=pregameAiEvidence(league,game,snapshot);
 if(!data.sgps.length)return{status:'SKIPPED',reason:'no_eligible_model_cards'};
 // Never use the model to repair incomplete or mismatched roster identities.
 try{
  const response=await fetcher(base+'/api/ai-analysis',{
   method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:league==='nba'?'nbaPregame':'parlay',data}),
   signal:AbortSignal.timeout(timeout)
  });
  if(!response.ok)return{status:'UNAVAILABLE',reason:'provider_http_'+response.status};
  const ans=await response.json();
  if(!ans.ok||!ans.analysis)return{status:'UNAVAILABLE',reason:'empty_review'};
  return{status:'REVIEWED',provider:ans.provider||'unknown',summary:short(ans.analysis),
   advisoryOnly:true,canAlterPicks:false,
   checkedAt:new Date().toISOString()};
 }catch{return{status:'UNAVAILABLE',reason:'provider_unreachable'}}
}
