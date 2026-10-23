// Non-authoritative Groq/OpenRouter review of already rebuilt SGPs.
// This must never choose a player, change numeric model thresholds, or
// masquerade as sportsbook-verified odds.
const MAX=1400;
import { validateBookOffer } from './sportsbook-market-verification.js';
import {safeNflSpotlightForAi} from './nfl-game-spotlight.js';
import {nflSafeSgpRevisionAudit} from './nfl-model-sgp-revision-audit.js';
import {nflReviewedModelDigest,nflReviewedInjuryDigest} from './nfl-ai-review-integrity.js';
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
 // Source-bound Anytime TD evidence for the existing scheduled AI quality
 // reviewer. Groq may comment, never select new players or fabricate lines.
 const tdModel=league==='nfl'?(snapshot.picks||[])
  .filter(x=>x.category==='td'&&x.tdModelStatus==='ESPN_MATCHUP_MODEL'&&
   Number.isFinite(Number(x.modelTdPercent)))
  .sort((a,b)=>Number(b.modelTdPercent)-Number(a.modelTdPercent))
  .slice(0,8).map(x=>({name:short(x.name).slice(0,80),team:x.team,
   playerId:x.playerID||x.playerId||null,gameId:game.gameId,
   modelEstimatedPercent:Number(x.modelTdPercent),
   sampleGames:Number(x.evidence?.games)||null,
   opportunitiesPerGame:Number(x.evidence?.opportunitiesPerGame)||null,
   recordedTouchdowns:Number(x.evidence?.touchdowns)||0,
   opponentDefenseTdRank:x.evidence?.defenseRank??null,
   source:'ESPN_COMPLETED_GAME_TD_MATCHUP_MODEL',
   sportsbookPriceVerified:false})):[];

 return {gameId:game.gameId,league,game:{homeAbbr:game.home?.abbr,awayAbbr:game.away?.abbr},
  matchupIdentity:{gameId:String(game.gameId),homeTeam:game.home?.abbr||null,awayTeam:game.away?.abbr||null,
   rule:'Only discuss these two teams. Never copy a matchup label or game ID from a different event.'},
  model:{validation:{sportsbookVerificationAvailable:false,
   injuryEligibilityChecked:checked},fetchedAt:snapshot.checkedAt||snapshot.lockedAt,
   degraded:league==='nfl'&&matchup?.status!=='BILATERAL_EVIDENCE'},
  sgps:cards,
  playerForecasts:league==='nba'?(snapshot.playerProjections||[])
   .filter(p=>Number.isFinite(Number(p.projection))&&Number(p.projection)>0)
   .sort((a,b)=>{
    const lift=p=>Number(p.baseProjection)>0?(Number(p.projection)/Number(p.baseProjection)-1):-Infinity;
    const reliability=p=>p.sampleSource==='CURRENT_SEASON'?1:0;
    return reliability(b)-reliability(a)||lift(b)-lift(a)||Number(b.sampleGames||0)-Number(a.sampleGames||0);
   })
   .slice(0,30).map(p=>({name:short(p.name).slice(0,80),team:p.team,
    playerId:p.playerId,category:p.category,projection:Number(p.projection),
    historicalAverage:Number.isFinite(Number(p.baseProjection))?Number(p.baseProjection):null,
    matchupFactor:Number.isFinite(Number(p.matchupAdjustment?.factor))?Number(p.matchupAdjustment.factor):null,
    opponent:p.matchupAdjustment?.opponent||p.defenseVsPosition?.opponent||null,
    opponentPositionAllowed:p.defenseVsPosition?.observedAllowed??null,
    positionLeagueAverage:p.defenseVsPosition?.leagueAverage??null,
    matchupEvidenceStatus:p.defenseVsPosition?.status||'UNVERIFIED',
    sampleGames:p.sampleGames||null,sampleSource:p.sampleSource||snapshot.sampleSource||'UNVERIFIED',
    starterVerified:p.starterVerified===true,marketVerified:false,
    basis:short(p.basis).slice(0,240)})):[],
  anytimeTdModel:tdModel,
  matchup:matchup?{sides:matchup.sides||[],rankMeaning:matchup.rankMeaning,
   modelOnly:true,source:matchup.source,risks:matchup.risks||[]}:null,
  playerAvailability:{skillPositionAlerts:injuries.slice(0,15).map(x=>({
   name:x.name,team:x.team,status:x.status,source:x.source||'ESPN_REPORTED'
  })),injuryEligibilityChecked:checked,officialInactivesVerified:false},
  injuries:injuries.slice(0,15).map(x=>({name:x.name,team:x.team,status:x.status})),
  // AI checks verified evidence supplied by collectors; it cannot certify a
  // sportsbook visit or an official starter from model usage alone.
  pregameVerification:{
   injuryReport:snapshot.pregameVerification?.injuryReportStatus||'UNVERIFIED',
   starters:snapshot.pregameVerification?.starterStatus||'UNCONFIRMED',
   officialInactivesVerified:snapshot.pregameVerification?.officialInactivesVerified===true,
   DraftKings:snapshot.pregameVerification?.books?.DraftKings?.status||'NOT_VERIFIED',
   FanDuel:snapshot.pregameVerification?.books?.FanDuel?.status||'NOT_VERIFIED',
   rule:'If player, game, starter, injury or exact book-native selection is missing, mark the SGP model-only. Never invent a verified sportsbook quote.'
  },
  slateSpotlight:league==='nfl'?safeNflSpotlightForAi(game.spotlight,game.gameId):null,
  sgpRevisionAudit:league==='nfl'?nflSafeSgpRevisionAudit(snapshot.sgpRevisionAudit):null,
  verifiedIndividualOffers:aiSafeMarketEvidence(snapshot.verifiedIndividualOffers||[]),
  sourceNotes:league==='nba'?
   'ESPN team rosters and historical box scores; early sample; official starters/bookmaker odds not verified':
   'ESPN completed-box-score offense vs opponent defense in BOTH directions, TDs, rush/target opportunities, role/injury gating and model-only SGPs; model TD percentages are uncalibrated estimates and no bookmaker-combined quote has been established.',
  checkedAt:snapshot.checkedAt||snapshot.lockedAt};
}
export function nbaAiMatchupIdentityConflict(analysis,game){
 const expected=new Set([String(game?.home?.abbr||'').toUpperCase(),String(game?.away?.abbr||'').toUpperCase()]);
 const s=String(analysis||'').slice(0,1400);
 const heading=s.match(/(?:^|\\n)[^\\n]{0,90}\\b([A-Z]{2,3})\\s+(?:vs\\.?|at|@)\\s+([A-Z]{2,3})\\b/i);
 if(heading&&!expected.has(heading[1].toUpperCase())||heading&&!expected.has(heading[2].toUpperCase()))return true;
 const id=s.match(/\\bGame\\s*(?:ID[:\\s]*)?(\\d{7,12})\\b/i);
 return Boolean(id&&id[1]!==String(game?.gameId||''));
}
export async function pregameAiAudit(league,game,snapshot,{
 fetcher=fetch,base='https://momentum-radar-live.vercel.app',timeout=10000
}={}){
 if(!['nfl','nba'].includes(league))return{status:'SKIPPED',reason:'invalid_league'};
 const data=pregameAiEvidence(league,game,snapshot);
 if(!data.sgps.length&&!(league==='nfl'&&data.anytimeTdModel?.length)&&!data.playerForecasts?.length)
  return{status:'SKIPPED',reason:'no_eligible_model_cards'};
 // Never use the model to repair incomplete or mismatched roster identities.
 try{
  const response=await fetcher(base+'/api/ai-analysis',{
   method:'POST',cache:'no-store',
   headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode:league==='nba'?'nbaPregame':
    !data.sgps.length?'tdReview':'parlay',data}),
   signal:AbortSignal.timeout(timeout)
  });
  if(!response.ok)return{status:'UNAVAILABLE',reason:'provider_http_'+response.status};
  const ans=await response.json();
  if(!ans.ok||!ans.analysis)return{status:'UNAVAILABLE',reason:'empty_review'};
  if(league==='nba'&&nbaAiMatchupIdentityConflict(ans.analysis,game))
   return{status:'UNAVAILABLE',reason:'ai_matchup_identity_conflict'};
  return{status:'REVIEWED',provider:ans.provider||'unknown',summary:short(ans.analysis),
   advisoryOnly:true,canAlterPicks:false,
   checkedAt:new Date().toISOString(),
   ...(league==='nfl'?{
    modelSelectionDigest:nflReviewedModelDigest(snapshot),
    injurySelectionDigest:nflReviewedInjuryDigest(snapshot.injuryEvidence)
   }:{} )};
 }catch{return{status:'UNAVAILABLE',reason:'provider_unreachable'}}
}
