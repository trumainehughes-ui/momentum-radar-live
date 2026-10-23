// Single fail-closed preflight shared by NFL, NBA, and future sport adapters.
// A model projection, roster membership, projected depth-chart starter, or
// sportsbook page *mention* is never proof of a confirmed lineup or an exact
// bettable selection. This adapter doesn't call providers or spend credits.
const NEVER_ACTIVE=/\b(?:OUT|DOUBTFUL|QUESTIONABLE|IR|INJURED RESERVE|INACTIVE|SUSPENDED|PUP|NFI|GTD|GAME TIME DECISION|UNKNOWN|REPORTED_OTHER)\b/i;
const norm=x=>String(x??'').trim().toUpperCase().replace(/[^A-Z0-9]/g,'');
const clean=x=>String(x??'').trim();
function fresh(timestamp,now,maxAgeMs){
 const at=Date.parse(timestamp||'');
 return Number.isFinite(at)&&at<=now+60_000&&now-at>=0&&now-at<=maxAgeMs;
}
const result=(status,reason,extra={})=>({ready:status==='READY',status,reason,...extra});
export function evaluateSportStarterReadiness(leg,role,{
 sport,gameId,now=Date.now(),maxAgeMs=30*60_000
}={}){
 const league=clean(sport).toLowerCase();
 if(!/^[a-z][a-z0-9_-]{1,20}$/.test(league)||!clean(gameId)||
  !clean(leg?.playerID||leg?.playerId)||!norm(leg?.team))
  return result('WAIT','MISSING_GAME_PLAYER_IDENTITY');
 if(clean(leg?.eventID||leg?.gameId)!==clean(gameId))
  return result('WAIT','CROSS_GAME_PLAYER_IDENTITY');
 if(!role||role.recommendationEligible!==true)
  return result('WAIT','CURRENT_ROLE_EVIDENCE_MISSING');
 if(clean(role.playerId||role.playerID)!==clean(leg.playerID||leg.playerId)||
  norm(role.team)!==norm(leg.team))
  return result('WAIT','PLAYER_TEAM_ROLE_MISMATCH');
 const status=[leg.injuryStatus,leg.availability,role.availability,role.injuryStatus]
  .filter(Boolean).join(' ');
 if(NEVER_ACTIVE.test(status))
  return result('WAIT','INJURY_OR_AVAILABILITY_HOLD');
 const roleStatus=clean(role.starterStatus).toUpperCase();
 // An "expected" or projected starter is not independently confirmed.
 // Keep such athletes in MODEL research only until the game lineup is real.
 if(roleStatus!=='CONFIRMED_STARTER'||
  role.starterVerified!==true||role.verification?.role?.verified!==true)
  return result('REVIEW','STARTER_NOT_CONFIRMED');
 if(!fresh(role.verification.role.checkedAt,now,maxAgeMs)||
  role.verification?.availability?.verified!==true||
  !fresh(role.verification.availability.checkedAt,now,maxAgeMs))
  return result('REVIEW','STARTER_OR_INJURY_CHECK_EXPIRED');
 if(role.verification?.availability?.officialInactivesVerified!==true)
  return result('REVIEW','OFFICIAL_GAME_DAY_INACTIVES_NOT_VERIFIED');
 return result('READY','CURRENT_CONFIRMED_STARTER_AND_INACTIVES_CHECKED',{
  starterConfirmed:true,verifiedAt:role.verification.role.checkedAt});
}
export function evaluateSportBookSgpLineup(legs,{
 sport,gameId,book,roleForLeg,now=Date.now(),maxAgeMs=30*60_000
}={}){
 if(!['DraftKings','FanDuel'].includes(book))return result('WAIT','UNSUPPORTED_SPORTSBOOK');
 if(!Array.isArray(legs)||legs.length<2||typeof roleForLeg!=='function')
  return result('WAIT','MISSING_PARLAY_OR_ROLE_CHECK');
 let count=0;
 for(const leg of legs){
  const role=roleForLeg(leg);
  const gate=evaluateSportStarterReadiness(leg,role,{
   sport,gameId,now,maxAgeMs});
  if(!gate.ready)return result(gate.status,gate.reason,{
   checkedCount:count,totalLegs:legs.length,allLegsConfirmed:false});
  count++;
 }
 return result('READY','ALL_PLAYERS_CONFIRMED_FOR_THIS_GAME',{
  checkedCount:count,totalLegs:legs.length,allLegsConfirmed:true});
}
export function sportResearchVerificationStatus({
 sport,gameId,injuryCheckedAt,injurySourceAvailable=false,
 officialInactivesVerified=false,startersConfirmed=false,
 bookOffers=[],now=Date.now()
}={}){
 const candidates=Array.isArray(bookOffers)?bookOffers:[];
 const checks=Object.fromEntries(['DraftKings','FanDuel'].map(book=>{
  const rows=candidates.filter(x=>x?.book===book);
  const current=rows.filter(x=>x.available===true&&
   fresh(x.checkedAt,now,15*60_000)&&
   clean(x.sport).toLowerCase()===clean(sport).toLowerCase()&&
   clean(x.gameId)===clean(gameId)&&clean(x.playerId)&&
   clean(x.market)&&clean(x.line)&&clean(x.side)&&clean(x.offerId)&&
   x.verifiedByServer===true&&
   /^[+-][1-9]\d{2,}$/.test(clean(x.americanOdds))&&
   typeof x.sourceUrl==='string'&&x.sourceUrl.startsWith('https://'));
  return [book,{status:current.length?'INDIVIDUAL_PROP_EVIDENCE_ONLY':'NO_VERIFIED_GAME_PROP',
   eligibleOfferCount:current.length,
   combinedSgpVerified:false}];
 }));
 return{sport:clean(sport).toLowerCase(),gameId:clean(gameId),
  injuryReportStatus:injurySourceAvailable&&
   fresh(injuryCheckedAt,now,30*60_000)?'RECENT':'RECHECK_REQUIRED',
  officialInactivesVerified:officialInactivesVerified===true,
  starterStatus:startersConfirmed===true?'CONFIRMED':'UNCONFIRMED',
  books:checks,
  playableSgp:false,
  reason:'A model parlay is not a book-issued ticket; confirmed starters, official inactives, exact player props at the chosen book and a fresh correlated combined quote are each required.'};
}

// Universal pre-prediction eligibility gate. Call before publishing any NFL/NBA
// player recommendation, ranking, SGP leg, or cross-game parlay selection.
// Historical forecasts may remain in internal research, never labeled bettable.
export function evaluateUniversalPlayerMarketGate({sport,gameId,leg,role,offers=[],
 now=Date.now(),maxAgeMs=30*60_000,minBooks=2}={}){
 const starter=evaluateSportStarterReadiness(leg,role,{sport,gameId,now,maxAgeMs});
 if(!starter.ready)return result(starter.status,'STARTER_GATE_'+starter.reason,{starter,marketVerified:false});
 const category=clean(leg?.category||leg?.market).toLowerCase();
 const matching=(Array.isArray(offers)?offers:[]).filter(o=>
  ['DraftKings','FanDuel'].includes(o.book)&&
  ((o.book==='DraftKings'&&/^https:\/\/([a-z0-9-]+\.)*(draftkings\.com|dknetwork\.draftkings\.com)\//i.test(clean(o.sourceUrl)))||
   (o.book==='FanDuel'&&/^https:\/\/([a-z0-9-]+\.)*fanduel\.com\//i.test(clean(o.sourceUrl))))&&
  o.verifiedByServer===true&&o.available===true&&
  clean(o.sport).toLowerCase()===clean(sport).toLowerCase()&&
  clean(o.gameId)===clean(gameId)&&
  clean(o.playerId)===clean(leg.playerID||leg.playerId)&&
  clean(o.market).toLowerCase()===category&&
  Number.isFinite(Number(o.line))&&Number(o.line)>0&&
  fresh(o.checkedAt,now,maxAgeMs)&&
  /^https:\/\//.test(clean(o.sourceUrl)));
 const distinct=[...new Map(matching.map(o=>[o.book,o])).values()];
 if(!distinct.some(o=>o.book==='DraftKings')||!distinct.some(o=>o.book==='FanDuel'))
  return result('WAIT','DRAFTKINGS_AND_FANDUEL_BOTH_REQUIRED',{
   starter,marketVerified:false,verifiedBooks:distinct.map(o=>o.book),requiredBooks:['DraftKings','FanDuel']});
 if(distinct.length<Math.max(2,minBooks))return result('WAIT','INSUFFICIENT_LIVE_SPORTSBOOK_LINES',{
  starter,marketVerified:false,verifiedBooks:distinct.map(o=>o.book),requiredBooks:minBooks});
 const lines=distinct.map(o=>Number(o.line)).sort((a,b)=>a-b);
 return result('READY','CONFIRMED_STARTER_AND_MULTIBOOK_MARKET',{
  starter,marketVerified:true,verifiedBooks:distinct.map(o=>o.book),
  consensusLine:lines[Math.floor((lines.length-1)/2)],
  offers:distinct.map(o=>({book:o.book,line:Number(o.line),checkedAt:o.checkedAt,sourceUrl:o.sourceUrl}))});
}
