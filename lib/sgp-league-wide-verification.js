// Every due NFL/NBA matchup receives the SAME per-tier readiness audit.
// This is intentionally read-only and cannot turn projected or independently
// multiplied odds into a bookmaker-issued correlated SGP quote.
export const LEAGUE_SGP_TIERS=Object.freeze(['Small','Medium','Nuke']);
export const LEAGUE_SGP_BOOKS=Object.freeze(['DraftKings','FanDuel']);
export const LEAGUE_SGP_TARGETS=Object.freeze({
 Small:Object.freeze({minimum:2000,maximum:3000,netProfitOnTen:[200,300]}),
 Medium:Object.freeze({minimum:3001,maximum:8000,netProfitOnTen:[300.10,800]}),
 Nuke:Object.freeze({minimum:10000,maximum:null,netProfitOnTen:[1000,null]})
});
const isGameId=x=>/^\d{7,12}$/.test(String(x||''));
export function auditLeagueSgpEvent({league,gameId,sgps}={}){
 if(!['nfl','nba'].includes(league)||!isGameId(gameId))
  return{status:'INVALID_EVENT',league,gameId:String(gameId||''),tiers:[]};
 const cards=league==='nfl'?sgps?.Analytics:sgps;
 const candidateCards=Array.isArray(cards)?cards:[];
 const tiers=LEAGUE_SGP_TIERS.map(risk=>{
  const card=candidateCards.find(x=>x?.risk===risk);
  const legs=Array.isArray(card?.legs)?card.legs:[];
  const unique=new Set(legs.map(x=>String(x?.playerID||x?.playerId||'').trim()));
  const identityOk=legs.length>0&&legs.every(x=>String(x?.eventID||x?.gameId||'')===String(gameId)&&
   String(x?.playerID||x?.playerId||'').trim()&&String(x?.team||'').trim());
  const modelOk=Boolean(card&&legs.length>0&&legs.length===Number(card.requiredLegs||legs.length)&&
   unique.size===legs.length&&identityOk&&
   (league==='nfl'?card.tierAssessment?.compositionOk===true:card.status==='MODEL_CANDIDATE'));
  const books=Object.fromEntries(LEAGUE_SGP_BOOKS.map(book=>{
   const a=card?.bookMarketAudits?.[book];
   const matching=Boolean(a&&a.book===book&&a.requestedTier===risk&&
    String(a.gameId)===String(gameId)&&a.totalLegs===legs.length);
   const exact=modelOk&&matching&&a.allLegsMatched===true&&a.matchedLegs===legs.length;
   return[book,{status:!modelOk?'MODEL_NOT_READY':!matching?'NO_VERIFIED_BOOK_MARKETS':
     exact?'EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED':'BOOK_LEG_MISMATCH',
    matchedLegs:matching?a.matchedLegs:0,requiredLegs:legs.length,
    missingLegs:matching?a.missingLegs.map(x=>({
     name:x.name,category:x.category,requested:x.requested,listed:x.listed
    })):[],
    combinedOddsVerified:false}];
  }));
  const anyExact=Object.values(books).some(b=>b.status==='EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED');
  return{risk,modelStatus:modelOk?'MODEL_CANDIDATE':'NOT_READY',
   sportsbookStatus:!modelOk?'MODEL_NOT_READY':anyExact?
    'EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED':'SPORTSBOOK_VERIFICATION_PENDING',
   combinedOddsVerified:false,actualCombinedOdds:null,
   targetOdds:LEAGUE_SGP_TARGETS[risk],legCount:legs.length,books,
   reason:!modelOk?String(card?.reason||'No complete, game-matched model tier was produced.').slice(0,180):
    'Actual sportsbook-issued combined odds and tier remain unverified.'};
 });
 return{status:tiers.some(t=>t.modelStatus==='MODEL_CANDIDATE')?'MODEL_ONLY':'NOT_READY',
  league,gameId:String(gameId),tiers,
  modelReadyCount:tiers.filter(t=>t.modelStatus==='MODEL_CANDIDATE').length,
  sportsbookVerifiedCount:0,
  allThreeBookmakerVerified:false,
  note:'Every event and every risk tier is audited. Model candidates and exact individual-book selections are never bookmaker-issued combined quotes.'};
}
