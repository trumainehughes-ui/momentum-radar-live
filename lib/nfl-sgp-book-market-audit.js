// Book-specific market audit for model-only SGP cards. A published model
// threshold is NOT proof that a book actually lists that exact alternate.
// Market availability and the correlated BOOK-ISSUED combined price are
// independent checks; never infer the second from the first.
import {nflCanonTeam} from './nfl-official-injury-feed.js';

const normalize=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const validOdds=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))&&Number(x)!==0;
const CATS=new Set(['passing','rushing','receiving','receptions','td']);
const normalizedCat=x=>String(x?.cat||x?.category||'').toLowerCase();

// Return the MINIMUM whole-number result implied by an explicitly offered
// threshold. 59.5 OVER means 60+; 60.0 OVER does NOT mean 60+ (it can push).
// A numeric alternate line with unspecified settling is not verified.
export function exactNflBookThreshold(offer,market){
 const cat=normalizedCat(market);
 if(cat==='td')return validOdds(offer?.odds)?'Anytime TD':null;
 const raw=offer?.line??market?.line;
 if(typeof raw==='string'&&/^\s*\d+(?:\.\d+)?\+\s*$/.test(raw)){
  return Number(raw.replace('+',''));
 }
 const value=Number(raw);
 if(!Number.isFinite(value)||value<=0)return null;
 const mode=String(offer?.lineType||offer?.thresholdType||market?.lineType||'').toUpperCase();
 if(['AT_LEAST','PLUS','ALTERNATE_AT_LEAST'].includes(mode))return value;
 if((mode==='OVER'||String(market?.sideID||'').toLowerCase()==='over')&&value%1===.5)
  return Math.ceil(value);
 // Failing closed is preferable to inventing an available 55+ alt line.
 return null;
}

export function auditNflBookSgpMarkets({sgp,book,gameId,markets=[]}={}){
 const legs=Array.isArray(sgp?.legs)?sgp.legs:[];
 const marketRows=Array.isArray(markets)?markets:[];
 const results=legs.map(leg=>{
  const cat=normalizedCat(leg);
  const id=String(leg.playerID||leg.playerId||'').trim(),name=normalize(leg.name);
  const team=nflCanonTeam(leg.team),event=String(leg.eventID||leg.gameId||'');
  const raw=cat==='td'?'Anytime TD':Number(leg.analyticsThreshold??leg.threshold);
  const valid=Boolean(name&&id&&team&&event&&String(gameId)===event&&CATS.has(cat)&&
   (cat==='td'||Number.isFinite(raw)&&raw>0&&(cat==='receptions'||raw%5===0)));
  const identity={playerID:id,team,eventID:event};
  if(!valid)return{...identity,name:leg.name||'',category:cat,requested:raw,matched:false,reason:'INVALID_MODEL_LEG'};
  const candidates=marketRows.filter(m=>{
   if(normalizedCat(m)!==cat||String(m.eventID||m.gameId||'')!==event)return false;
   if(nflCanonTeam(m.team)!==team||normalize(m.name)!==name)return false;
   const marketId=String(m.playerID||m.playerId||'').trim();
   return marketId===id;
  });
  const lines=[],listedOffers=[];
  let matched=false;
  for(const m of candidates)for(const offer of m.books||[]){
   if(offer?.book!==book||offer.available===false||!validOdds(offer.odds))continue;
   const value=exactNflBookThreshold(offer,m);
   if(value===null)continue;
   if(!lines.includes(value))lines.push(value);
   const sourceLine=String(offer.line??m.line??'');
   const isOver=/^(OVER)$/i.test(String(offer.lineType||offer.thresholdType||''))||
     String(m.sideID||'').toLowerCase()==='over'&&!sourceLine.includes('+');
   const display=isOver?'Over '+sourceLine:sourceLine.includes('+')?sourceLine:
     String(offer.lineType||'').toUpperCase().includes('AT_LEAST')?value+'+':sourceLine;
   if(!listedOffers.some(x=>x.display===display))listedOffers.push({display,minimumToWin:value});
   if(value===raw)matched=true;
  }
  return{...identity,name:leg.name,category:cat,requested:raw,matched,
   listed:lines.sort((a,b)=>Number(a)-Number(b)),listedOffers,
   reason:matched?'EXACT_BOOK_LINE_MATCHED':candidates.length?'REQUESTED_LINE_NOT_OFFERED':'NO_PLAYER_MARKET'};
 });
 const matchedLegs=results.filter(x=>x.matched).length;
 return {book,requestedTier:String(sgp?.risk||''),gameId:String(gameId||''),
  totalLegs:legs.length,matchedLegs,missingLegs:results.filter(x=>!x.matched),
  legs:results,allLegsMatched:legs.length>0&&matchedLegs===legs.length,
  // Never manufacture a correlated combined SGP quote from single-leg data.
  combinedBookQuoteVerified:false,bookPriceTierVerified:false,actualCombinedOdds:null,
  status:!legs.length?'MODEL_NOT_READY':!marketRows.length?'NO_LIVE_MARKETS':
   matchedLegs===legs.length?'ALL_LEGS_LISTED_COMBINED_ODDS_UNVERIFIED':
    'MODEL_LINES_NOT_FULLY_LISTED'};
}
