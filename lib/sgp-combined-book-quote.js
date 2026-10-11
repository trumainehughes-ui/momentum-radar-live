// Authentication is an INTERNAL server-adapter attestation, NEVER a field
// supplied by a browser, screenshot, search result, AI or third-party snippet.
// SportsGameOdds and The Odds API return individual legs; multiplying them
// cannot serve as a correlated bookmaker-issued same-game-parlay quote.
import {LEAGUE_SGP_TARGETS} from './sgp-tier-contract.js';

const BOOKS=new Set(['FanDuel','DraftKings']);
const CATS={
 nfl:new Set(['td','passing','rushing','receiving','receptions']),
 nba:new Set(['points','rebounds','assists','threes','pra'])
};
const key=x=>String(x??'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const rawString=x=>String(x??'').trim();
const catOf=x=>String(x?.cat||x?.category||'').toLowerCase();
const lineOf=leg=>{
 const category=catOf(leg);
 if(category==='td')return 'ANYTIME TD';
 const raw=leg?.analyticsThreshold??leg?.threshold??leg?.line;
 if(raw===null||raw===undefined||raw==='')return null;
 const n=Number(raw);
 return Number.isFinite(n)&&n>0?String(n):null;
};
const signature=(leg,league,gameId)=>{
 if(!leg||!CATS[league]?.has(catOf(leg)))return null;
 const id=rawString(leg.playerID||leg.playerId);
 const game=rawString(leg.eventID||leg.gameId);
 const team=key(leg.team),name=key(leg.name),line=lineOf(leg);
 if(!id||!name||!team||!line||game!==rawString(gameId))return null;
 return [game,team,id,name,catOf(leg),line].join('|');
};

export function verifyLeagueBookCombinedQuote({
 league,book,gameId,risk,legs=[],quote=null,providerAuthenticated=false,
 now=Date.now(),maxAgeMs=15*60*1000
}={}){
 const fail=(reason)=>({verified:false,tierVerified:false,reason,
  actualCombinedOdds:null,actualNetProfit:null,actualTotalReturn:null,
  observedTier:null});
 if(!providerAuthenticated)return fail('NO_AUTHENTICATED_BOOK_QUOTE_ADAPTER');
 if(!CATS[league]||!BOOKS.has(book)||!LEAGUE_SGP_TARGETS[risk])
  return fail('INVALID_LEAGUE_BOOK_OR_TIER');
 if(!quote||quote.sourceType!=='BOOK_ISSUED_COMBINED_SGP'||
  quote.book!==book||quote.league!==league||!rawString(quote.providerQuoteId))
  return fail('NO_BOOK_ISSUED_COMBINED_QUOTE');
 if(!rawString(gameId)||rawString(quote.gameId)!==rawString(gameId))
  return fail('BOOK_QUOTE_WRONG_GAME');
 const at=Date.parse(String(quote.sourceQuoteAt||''));
 if(!Number.isFinite(at)||!Number.isFinite(now)||at>now||
  now-at>maxAgeMs||maxAgeMs<1||maxAgeMs>15*60*1000)
  return fail('BOOK_QUOTE_STALE');
 const odds=quote.americanOdds;
 if(!Number.isSafeInteger(odds)||odds<=0)return fail('BOOK_COMBINED_ODDS_INVALID');
 const before=Array.isArray(legs)?legs:[],after=Array.isArray(quote.legs)?quote.legs:[];
 if(!before.length||before.length!==after.length)return fail('BOOK_QUOTE_LEG_COUNT_MISMATCH');
 const requested=before.map(x=>signature(x,league,gameId));
 const priced=after.map(x=>signature(x,league,gameId));
 if([...requested,...priced].some(x=>!x))return fail('BOOK_QUOTE_LEG_IDENTITY_UNVERIFIED');
 if(new Set(requested).size!==requested.length||new Set(priced).size!==priced.length)
  return fail('BOOK_QUOTE_DUPLICATE_LEGS');
 if(requested.slice().sort().join('\n')!==priced.slice().sort().join('\n'))
  return fail('BOOK_QUOTE_EXACT_MARKETS_MISMATCH');
 const observedTier=Object.entries(LEAGUE_SGP_TARGETS)
  .find(([,band])=>odds>=band.minimum&&(band.maximum===null||odds<=band.maximum))?.[0]||
  'OUTSIDE_TIER_BANDS';
 const tierVerified=observedTier===risk;
 const actualNetProfit=Number((odds/10).toFixed(2));
 return{verified:true,tierVerified,
  reason:tierVerified?'AUTHENTICATED_BOOK_SGP_TIER_MATCH':
   'BOOK_COMBINED_PRICE_OUTSIDE_REQUESTED_TIER',
  league,book,gameId:rawString(gameId),sourceQuoteAt:new Date(at).toISOString(),
  actualCombinedOdds:odds,actualNetProfit,
  actualTotalReturn:Number((actualNetProfit+10).toFixed(2)),
  observedTier,notGuaranteedAtPlacement:true};
}
