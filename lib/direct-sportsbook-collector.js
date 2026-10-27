import {DIRECT_PUBLIC_SPORTSBOOK_SOURCES} from './sportsbook-source-policy.js';

// Official sportsbook pages only. Never promote page text, SEO articles,
// projections, or search snippets into an executable player-prop offer.
const BOOKS=Object.entries(DIRECT_PUBLIC_SPORTSBOOK_SOURCES);
export async function collectDirectSportsbookEvidence({sport,gameId,fetchPage=fetch,now=Date.now()}={}){
 const attempts=await Promise.all(BOOKS.map(async([book,url])=>{
  try{
   const response=await fetchPage(url,{redirect:'follow',cache:'no-store',
    headers:{accept:'text/html'},signal:AbortSignal.timeout(6500)});
   if(!response?.ok)return {book,status:'UNAVAILABLE',reason:'OFFICIAL_PAGE_HTTP_'+(response?.status||'UNKNOWN'),sourceUrl:url};
   const finalUrl=String(response.url||url);
   const allowed=book==='DraftKings'?/^https:\/\/([a-z0-9-]+\.)*draftkings\.com\//i:
    /^https:\/\/([a-z0-9-]+\.)*fanduel\.com\//i;
   if(!allowed.test(finalUrl))return {book,status:'UNAVAILABLE',reason:'REDIRECT_OUTSIDE_OFFICIAL_BOOK',sourceUrl:url};
   const html=String(await response.text()).slice(0,500000);
   return {book,status:'PAGE_REACHABLE',reason:html.length?'NO_VERIFIED_GAME_SCOPED_PLAYER_OFFERS':'EMPTY_OFFICIAL_PAGE',
    sourceUrl:finalUrl,checkedAt:new Date(now).toISOString()};
  }catch{return {book,status:'UNAVAILABLE',reason:'OFFICIAL_PAGE_FETCH_FAILED',sourceUrl:url};}
 }));
 return {sport,gameId,attempts,offers:[],checkedAt:new Date(now).toISOString(),
  status:'NO_VERIFIED_PLAYER_OFFERS',sourcePolicy:'DIRECT_OFFICIAL_SPORTSBOOK_WEBSITE_FIRST'};
}
