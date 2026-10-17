// BetBot-inspired LOCAL browser observation adapter for Momentum Radar.
//
// This module reads only visible, already-rendered content in manually opened,
// official sportsbook tabs. It neither launches automation against blocked
// pages nor bypasses consent, authentication, geographic or bot challenges.
// No raw page text, cookies, tokens or local Chrome debugging address is sent
// to Momentum Radar; only validated individual market observations can publish.
//
// Architectural inspiration: https://github.com/eric-barch/betbot (ISC package).
// Independent implementation; no BetBot source code copied.
import {parseVisibleBookCapture,validateBookPageUrl} from './public-book-text-capture.js';

export const COMPANION_BOOKS=Object.freeze({
 'co.sportsbook.fanduel.com':'FanDuel',
 'sportsbook.fanduel.com':'FanDuel',
 'sportsbook.draftkings.com':'DraftKings'
});
export function officialBrowserTab(url){
 try{
  const u=new URL(url);
  const book=COMPANION_BOOKS[u.hostname.toLowerCase()];
  if(!book||!validateBookPageUrl(url,book))return null;
  // Preserve the official page path for audit, never log a query parameter.
  return {book,sourceUrl:u.origin+u.pathname};
 }catch{return null}
}
export function validateLoopbackChromeAddress(input){
 try{
  const u=new URL(String(input||''));
  if(u.protocol!=='http:'||
   !['127.0.0.1','localhost','[::1]'].includes(u.hostname)||
   u.username||u.password||u.pathname!=='/'||u.search||u.hash||
   !Number.isInteger(Number(u.port))||Number(u.port)<1||Number(u.port)>65535)
   return null;
  return u.origin;
 }catch{return null}
}
export const challengeDetected=text=>/press\s*(?:&|and)\s*hold|access\s*denied|verify\s+you\s+are\s+human|captcha\s+challenge|automated\s+access\s+denied/i.test(String(text||''));

export async function collectVisibleBookObservations({
 pages,game,players,book=null,now=()=>Date.now()
}={}){
 if(!game||!/^\d{7,12}$/.test(String(game.gameId||''))||
  !/^\d{4}-\d{2}-\d{2}$/.test(String(game.date||''))||
  !game.homeName||!game.awayName||!game.homeAbbr||!game.awayAbbr||
  !Array.isArray(players)||players.length===0)
  return {ok:false,error:'game_roster_or_date_missing',offers:[],states:[]};
 const offers=[],states=[],byKey=new Map(),conflicts=new Set();
 for(const tab of Array.isArray(pages)?pages:[]){
  const source=officialBrowserTab(typeof tab.url==='function'?tab.url():tab.url);
  if(!source||book&&book!==source.book)continue;
  try{
   // page.evaluate invokes only a trivial read of visible text in an
   // existing user-opened tab. It cannot open new sites or change a wager.
   const text=await tab.evaluate(()=>
    String(document.body?.innerText||'').slice(0,190000));
   if(challengeDetected(text)){
    states.push({book:source.book,state:'HUMAN_VERIFICATION_OR_ACCESS_DENIED'});
    continue;
   }
   if(!text||text.length<30){
    states.push({book:source.book,state:'NO_VISIBLE_MARKET_TEXT'});
    continue;
   }
   const parsed=parseVisibleBookCapture({
    ...game,book:source.book,sourceUrl:source.sourceUrl,text,
    players,observedAt:new Date(now()).toISOString(),
    captureMethod:'USER_BROWSER_DOM_OBSERVATION'
   });
   if(!parsed.ok||!parsed.offers?.length){
    states.push({book:source.book,state:parsed.reason||'NO_MATCHED_MARKETS'});
    continue;
   }
   states.push({book:source.book,state:'OFFICIAL_VISIBLE_PLAYER_OFFERS',
    count:parsed.offers.length});
   for(const row of parsed.offers){
    const key=[row.book,row.gameId,row.player.toLowerCase().replace(/[^a-z0-9]/g,''),
     row.category,row.line].join('|');
    const existing=byKey.get(key);
    if(existing&&existing.odds!==row.odds){
     // Two tabs disagree on a price. Do not publish either as current.
     conflicts.add(key);
     continue;
    }
    if(!existing)byKey.set(key,row);
   }
  }catch{
   states.push({book:source.book,state:'VISIBLE_PAGE_READ_FAILED'});
  }
 }
 for(const [key,row] of byKey)if(!conflicts.has(key))offers.push(row);
 if(conflicts.size)states.push({state:'CONFLICTING_PRICES_WITHHELD',count:conflicts.size});
 return {ok:true,offers,states,bookmakerSgpQuoteVerified:false,
  status:offers.length?'USER_OBSERVED_FIRST_PARTY_SELECTIONS':'NO_VISIBLE_MATCHING_SPORTSBOOK_LINES'};
}
