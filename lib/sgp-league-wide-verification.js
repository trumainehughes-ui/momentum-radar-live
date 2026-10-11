// Every due NFL/NBA matchup receives the SAME per-tier readiness audit.
// This is intentionally read-only and cannot turn projected or independently
// multiplied odds into a bookmaker-issued correlated SGP quote.
import {LEAGUE_SGP_TIERS,LEAGUE_SGP_BOOKS,LEAGUE_SGP_TARGETS} from './sgp-tier-contract.js';
import {verifyLeagueBookCombinedQuote} from './sgp-combined-book-quote.js';
export {LEAGUE_SGP_TIERS,LEAGUE_SGP_BOOKS,LEAGUE_SGP_TARGETS} from './sgp-tier-contract.js';
const isGameId=x=>/^\d{7,12}$/.test(String(x||''));
const TIER_LEG_BOUNDS=Object.freeze({
 nfl:{Small:[4,4],Medium:[5,5],Nuke:[5,7]},
 nba:{Small:[2,3],Medium:[3,5],Nuke:[5,7]}
});
export function auditLeagueSgpEvent({
 league,gameId,sgps,bookIssuedQuotes=null,quoteAdapterAuthenticated=false,now=Date.now()
}={}){
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
  const [minLegs,maxLegs]=TIER_LEG_BOUNDS[league]?.[risk]||[Infinity,-Infinity];
  const legCountOk=legs.length>=minLegs&&legs.length<=maxLegs;
  const modelOk=Boolean(card&&legCountOk&&legs.length===Number(card.requiredLegs||legs.length)&&
   unique.size===legs.length&&identityOk&&
   (league==='nfl'?card.tierAssessment?.compositionOk===true:card.status==='MODEL_CANDIDATE'));
  const books=Object.fromEntries(LEAGUE_SGP_BOOKS.map(book=>{
   const a=card?.bookMarketAudits?.[book];
   const matching=Boolean(a&&a.book===book&&a.requestedTier===risk&&
    String(a.gameId)===String(gameId)&&a.totalLegs===legs.length);
   const exact=modelOk&&matching&&a.allLegsMatched===true&&a.matchedLegs===legs.length;
   // Quotes are accepted ONLY from a future authenticated server-side
   // bookmaker-combined-quote adapter and ONLY if the exact individual
   // markets match first. Browser inputs cannot set this trust flag.
   const quoted=verifyLeagueBookCombinedQuote({
    league,book,gameId,risk,legs,quote:bookIssuedQuotes?.[book]?.[risk]||null,
    providerAuthenticated:quoteAdapterAuthenticated===true&&exact,now
   });
   const priceVerified=exact&&quoted.verified;
   const status=!modelOk?'MODEL_NOT_READY':!matching?'NO_VERIFIED_BOOK_MARKETS':
    !exact?'BOOK_LEG_MISMATCH':
    priceVerified?(quoted.tierVerified?'TIER_COMBINED_QUOTE_VERIFIED':
     'BOOK_COMBINED_PRICE_OUTSIDE_TIER'):
    'EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED';
   return[book,{status,matchedLegs:matching?a.matchedLegs:0,requiredLegs:legs.length,
    missingLegs:matching?a.missingLegs.map(x=>({
     name:x.name,category:x.category,requested:x.requested,listed:x.listed,listedOffers:x.listedOffers||[]
    })):[],
    combinedOddsVerified:priceVerified,
    tierVerified:priceVerified&&quoted.tierVerified,
    actualCombinedOdds:priceVerified?quoted.actualCombinedOdds:null,
    actualNetProfit:priceVerified?quoted.actualNetProfit:null,
    actualTotalReturn:priceVerified?quoted.actualTotalReturn:null,
    observedTier:priceVerified?quoted.observedTier:null,
    quoteCheckedAt:priceVerified?quoted.sourceQuoteAt:null,
    quoteReason:exact?quoted.reason:'EXACT_BOOK_MARKETS_NOT_CONFIRMED'}];
  }));
  const anyExact=Object.values(books).some(b=>b.status==='EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED');
  const anyTier=Object.values(books).some(b=>b.tierVerified);
  const anyQuote=Object.values(books).some(b=>b.combinedOddsVerified);
  return{risk,modelStatus:modelOk?'MODEL_CANDIDATE':'NOT_READY',
   sportsbookStatus:!modelOk?'MODEL_NOT_READY':anyTier?'TIER_COMBINED_QUOTE_VERIFIED':
    anyQuote?'BOOK_COMBINED_PRICE_OUTSIDE_TIER':anyExact?
    'EXACT_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED':'SPORTSBOOK_VERIFICATION_PENDING',
   combinedOddsVerified:anyQuote,tierVerified:anyTier,actualCombinedOdds:null,
   targetOdds:LEAGUE_SGP_TARGETS[risk],legCount:legs.length,books,
   reason:!modelOk?String(card?.reason||'No complete, game-matched model tier was produced.').slice(0,180):
    'Actual sportsbook-issued combined odds and tier remain unverified.'};
 });
 return{status:tiers.some(t=>t.modelStatus==='MODEL_CANDIDATE')?'MODEL_ONLY':'NOT_READY',
  league,gameId:String(gameId),tiers,
  modelReadyCount:tiers.filter(t=>t.modelStatus==='MODEL_CANDIDATE').length,
  sportsbookVerifiedCount:tiers.reduce((n,t)=>n+Object.values(t.books).filter(b=>b.tierVerified).length,0),
  allThreeBookmakerVerified:tiers.every(t=>LEAGUE_SGP_BOOKS.every(book=>t.books[book].tierVerified)),
  note:'Every event and every risk tier is audited. Model candidates and exact individual-book selections are never bookmaker-issued combined quotes.'};
}
