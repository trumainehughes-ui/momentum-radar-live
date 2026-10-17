// Sanitization contract for ADMIN-published, user-observed first-party
// sportsbook odds. A published observation is NOT a bookmaker-issued quote.
import {validateBookPageUrl,CAPTURE_MAX_AGE_MS} from './public-book-text-capture.js';
export const CENTRAL_BOOK_PREFIX='momentum-public-book-observations/v1/nfl';
export const CAPTURE_MAX_ROWS=220;
export const ALLOWED_CATEGORIES=new Set(['td','passing','rushing','receiving','receptions']);
export function validObservationScope(date,gameId){
 return /^\d{4}-\d{2}-\d{2}$/.test(String(date||''))&&
  !Number.isNaN(Date.parse(date+'T12:00:00Z'))&&
  /^\d{7,12}$/.test(String(gameId||''));
}
export function bookObservationPath(date,gameId,book){
 if(!validObservationScope(date,gameId)||!['FanDuel','DraftKings'].includes(book))return null;
 return CENTRAL_BOOK_PREFIX+'/'+date+'/'+gameId+'/'+book.toLowerCase()+'.json';
}
export function sanitizePublishedBookObservations({
 date,gameId,book,offers,observedAt,now=Date.now(),allowedPlayers=null
}={}){
 if(!bookObservationPath(date,gameId,book))return {ok:false,error:'invalid_game_date_or_book'};
 if(!Array.isArray(offers)||!offers.length||offers.length>CAPTURE_MAX_ROWS)
  return {ok:false,error:'invalid_offer_count'};
 const approved=allowedPlayers instanceof Set?allowedPlayers:null;
 const valid=[],dedupe=new Set();
 for(const o of offers){
  if(!o||typeof o!=='object'||Array.isArray(o))return {ok:false,error:'malformed_offer'};
  const player=String(o.player||''),category=String(o.category||''),
   sourceUrl=String(o.sourceUrl||''),timestamp=String(o.observedAt||observedAt||'');
  const at=Date.parse(timestamp),age=now-at;
  const numOdds=Number(o.odds),line=o.line===null?null:Number(o.line);
  if(player.length<5||player.length>70||!/^[a-zA-ZÀ-ž .'’-]+$/.test(player)||
   !ALLOWED_CATEGORIES.has(category)||
   !validateBookPageUrl(sourceUrl,book)||
   String(o.book)!==book||String(o.gameId)!==String(gameId)||
   String(o.date)!==date||!Number.isFinite(age)||age< -60000||age>CAPTURE_MAX_AGE_MS||
   !Number.isInteger(numOdds)||!(numOdds>=100&&numOdds<=100000||numOdds<=-100&&numOdds>=-100000)||
   (category==='td'?line!==null:!Number.isFinite(line)||line<=0||line>1500||
    !Number.isInteger(line*2))||
   !['VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY','PUBLIC_PAGE_OBSERVATION_ONLY'].includes(String(o.verification||''))||
   !['USER_PASTED_TEXT','USER_SCREENSHOT_OCR','USER_BROWSER_DOM_OBSERVATION'].includes(String(o.captureMethod||'')))
   return {ok:false,error:'offer_source_or_market_not_validated'};
  if(approved&&!approved.has(player.toLowerCase().replace(/[^a-z0-9]/g,'')))
   return {ok:false,error:'player_not_in_official_game_roster'};
  const key=player.toLowerCase().replace(/[^a-z0-9]/g,'')+'|'+category+'|'+line;
  if(dedupe.has(key))continue;
  dedupe.add(key);
  valid.push({book,gameId:String(gameId),date,player,category,line,odds:numOdds,
   sourceUrl,observedAt:timestamp,captureMethod:o.captureMethod,
   verification:'VISIBLE_BOOK_PAGE_USER_OBSERVATION_ONLY',
   publication:'AUTHORIZED_USER_OBSERVATION_NOT_SERVER_VERIFIED'});
 }
 return valid.length?
  {ok:true,offers:valid,observedAt:new Date(Math.max(...valid.map(o=>Date.parse(o.observedAt)))).toISOString()}:
  {ok:false,error:'no_unique_exact_offers'};
}
export function keepCurrentPublishedBookRows(snapshot,{now=Date.now(),date,gameId,book}={}){
 if(!snapshot||snapshot.publisherStatus!=='USER_OBSERVED_NOT_BOOK_VERIFIED'||
  snapshot.date!==date||String(snapshot.gameId)!==String(gameId)||snapshot.book!==book)
  return [];
 const v=sanitizePublishedBookObservations({
  date,gameId,book,offers:snapshot.offers,now
 });
 return v.ok?v.offers:[];
}
