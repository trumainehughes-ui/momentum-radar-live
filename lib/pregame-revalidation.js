// Shared NFL/NBA pregame revalidation contract. Other sports must register
// their own official schedule, roster, injury and matchup data adapters before
// claiming coverage. There is no wagering/bookmaker settlement automation.
import {createHash} from 'node:crypto';
export const PREGAME_LEAGUES=Object.freeze(['nfl','nba']);
export const PREGAME_REFRESH_VERSION='league-wide-v1';
export const PREGAME_DAY_AHEAD_HOURS=36;
export const PREGAME_PHASES=Object.freeze({
 DAY_AHEAD_BUILD:{maxSnapshotAgeMinutes:60},
 PREGAME_VALIDATION:{maxSnapshotAgeMinutes:15},
 FINAL_T_MINUS_30:{maxSnapshotAgeMinutes:10}
});
export function pregamePhase(game,{now=Date.now(),lookaheadHours=PREGAME_DAY_AHEAD_HOURS}={}){
 const remaining=Date.parse(String(game?.kickoff||''))-now;
 if(game?.status!=='SCHEDULED')return{due:false,stage:'CLOSED',remainingMinutes:null};
 if(!Number.isFinite(remaining)||remaining<=0)return{due:false,stage:'CLOSED',remainingMinutes:null};
 if(remaining>lookaheadHours*3600000)
  return{due:false,stage:'OUTSIDE_WINDOW',remainingMinutes:Math.ceil(remaining/60000)};
 const stage=remaining<=30*60000?'FINAL_T_MINUS_30':
  remaining<=90*60000?'PREGAME_VALIDATION':'DAY_AHEAD_BUILD';
 return{due:true,stage,remainingMinutes:Math.ceil(remaining/60000),
  maxSnapshotAgeMinutes:PREGAME_PHASES[stage].maxSnapshotAgeMinutes};
}
const str=x=>String(x??'');
const stable=x=>{
 if(Array.isArray(x))return x.map(stable);
 if(x&&typeof x==='object')return Object.fromEntries(Object.keys(x).filter(k=>!/^(checkedAt|fetchedAt|generatedAt|updatedAt|lastFetchedAt|timestamp)$/i.test(k)).sort().map(k=>[k,stable(x[k])]));
 return x??null;
};
const digest=x=>createHash('sha256').update(JSON.stringify(stable(x))).digest('hex').slice(0,20);
const aNum=x=>Number.isFinite(Number(x))?Number(x):null;
function legsOf(s){
 const rows=Array.isArray(s)?s:[];
 return rows.map(t=>({tier:t.risk||t.tier||null,status:t.status||t.tierAssessment?.status||null,
  legs:(Array.isArray(t.legs)?t.legs:[]).map(l=>({
   id:str(l.playerId||l.playerID),team:str(l.team),category:str(l.category||l.cat),
   threshold:l.analyticsThreshold??l.threshold??l.line??null,projection:aNum(l.projection)
  })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
 })).sort((a,b)=>str(a.tier).localeCompare(str(b.tier)));
}
// Sportbook offers are independent evidence. Comparing only model legs
// missed a source changing a line, delisting a prop or recovering a book
// after the T-30 recheck. Do not hash timestamps or unauthenticated prices.
export function pregameBookMarketFingerprint(verification){
 const tiers=Array.isArray(verification?.tiers)?verification.tiers:[];
 return ['Small','Medium','Nuke'].map(risk=>{
  const tier=tiers.find(t=>t?.risk===risk)||{};
  const books=Object.fromEntries(['DraftKings','FanDuel'].map(book=>{
   const x=tier.books?.[book]||{},missing=Array.isArray(x.missingLegs)?x.missingLegs:[];
   return[book,{
    status:str(x.status||'NO_VERIFIED_BOOK_MARKETS'),
    matchedLegs:Number.isInteger(x.matchedLegs)?x.matchedLegs:null,
    requiredLegs:Number.isInteger(x.requiredLegs)?x.requiredLegs:null,
    missing:missing.map(l=>({
     player:str(l.name),category:str(l.category),requested:l.requested??null,
     offers:(Array.isArray(l.listedOffers)?l.listedOffers:[]).map(o=>({
      minimumToWin:o.minimumToWin??null,display:str(o.display)
     })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))
    })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))),
    tierVerified:x.tierVerified===true,combinedOddsVerified:x.combinedOddsVerified===true
   }];
  }));
  return{risk,modelStatus:str(tier.modelStatus||'NOT_READY'),books};
 });
}
export function pregameEvidenceParts(source={},league){
 const isNFL=league==='nfl';
 const props=isNFL?(source.picks||[]):(source.playerProjections||[]);
 const tiers=isNFL?(source.sgps||[]):(source.sgps||[]);
 const injury=isNFL?(source.injuryEvidence||source.injuryChecks||{}):
  (source.verifiedInjuries||source.injuryEvidence||[]);
 const propRows=(Array.isArray(props)?props:[]).map(p=>({
  playerId:str(p.playerId||p.playerID),team:str(p.team),
  category:str(p.category||p.cat),threshold:p.threshold??p.analyticsThreshold??null,
  projection:aNum(p.projection??p.projectionAtLock),perGame:aNum(p.perGame),
  matchupAdjustment:aNum(p.matchupAdjustment?.factor??p.matchupAdjustmentFactor),
  availability:p.availability||null
 })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 return{
  PLAYER_PROPS:propRows,
  SGP_TIERS:legsOf(tiers),
  SPORTSBOOK_MARKETS:pregameBookMarketFingerprint(source.sgpVerification),
  INJURIES:{statuses:Array.isArray(injury)?injury.map(v=>({
   playerId:str(v.playerId),team:str(v.team),name:str(v.name),
   status:str(v.status)
  })).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))):stable(injury),
   checked:source.injuryReportStatus||source.injuryChecks?.rosterAndInjuryEligibilityChecked||null,
   // Feed time is not medical evidence. Do not make every 15m refresh look
   // like a changed injury just because fetchedAt/checkedAt differs.
   officialInactivesVerified:false},
  MATCHUP:{home:source.home?.abbr||source.game?.home?.abbr||null,
   away:source.away?.abbr||source.game?.away?.abbr||null,
   offenseDefense:source.offenseDefense||source.matchupEvidence||source.matchupModel||null,
   outcomePrediction:source.outcomePrediction||null},
  MODEL_INPUTS:{gameId:str(source.gameId),modelVersion:source.modelVersion||null,
   historicalSeason:source.historicalSeason||null,
   sampleSource:source.sampleSource||null,seasonType:source.seasonType||null}
 };
}
export function pregameEvidenceAudit(prior,current,{league}={}){
 if(!PREGAME_LEAGUES.includes(league))throw Error('pregame_adapter_not_registered');
 const old=prior?.evidenceDigests||null,newParts=pregameEvidenceParts(current,league);
 const currentDigests=Object.fromEntries(Object.entries(newParts).map(([key,val])=>[key,digest(val)]));
 const changedFields=old?
  Object.keys(currentDigests).filter(key=>old[key]!==currentDigests[key]):
  ['FIRST_SNAPSHOT'];
 return{evidenceDigests:currentDigests,changedFields,
  changedFromPrior:Boolean(prior)&&changedFields.length>0,
  sourceAdjusted:changedFields.some(x=>['INJURIES','MATCHUP','PLAYER_PROPS',
   'SPORTSBOOK_MARKETS'].includes(x)),
  modelVersion:PREGAME_REFRESH_VERSION};
}
export function pregameNeedsAiReview({stage,changedFields=[],priorAiReviewed=false}={}){
 return stage==='FINAL_T_MINUS_30'&&(!priorAiReviewed||changedFields.length>0);
}
