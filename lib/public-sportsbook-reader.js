// Optional read-only public-page inspector. This deliberately does NOT
// impersonate a sportsbook customer, defeat a block, automate navigation,
// replay hidden APIs, or feed unverified scraped content into active SGPs.
// Official odds-provider prices are preferred; page content is research.
import {officialSportsbookPublicPage} from './sportsbook-public-links.js';

const entity=x=>String(x).replace(/&(amp|quot|apos|nbsp|lt|gt|#39|#x27|#0*39);/gi,
 (v,k)=>({'amp':'&','quot':'"','apos':"'",'nbsp':' ','lt':'<','gt':'>','#39':"'",'#x27':"'",}[k.toLowerCase()]||v));
const textOf=html=>entity(String(html)
 .replace(/<(script|style|svg|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/gi,' ')
 .replace(/<!--[^]*?-->/g,' ')
 .replace(/<\s*br\b[^>]*>/gi,' ')
 .replace(/<\/\s*(?:tr|td|th|h[1-6]|p|div|section|li)\s*>/gi,' ')
 .replace(/<[^>]+>/g,' ')
 .replace(/[\s\u00a0]+/g,' ').trim());
const american=value=>{
 const raw=String(value||'').replace(/\u2212/g,'-').trim();
 return /^[+-]\d{2,6}$/.test(raw)&&Number(raw)!==0?raw:null;
};
const displayMin=(raw,category)=>{
 const n=Number(raw);
 if(!Number.isFinite(n)||n<=0)return null;
 // An Over x.5 line is a whole-number victory threshold; 55.0 can push.
 return n%1===.5?Math.ceil(n):null;
};
const result=(book,url,player,category,raw,odds)=>({
 book,sourceUrl:url,player:String(player).trim().slice(0,90),
 market:category,rawLine:raw,
 winningMinimum:category==='td'?'Anytime TD':displayMin(raw,category),
 americanOdds:american(odds),scope:'PUBLIC_WEBPAGE_UNMATCHED_EVENT',
 modelEligible:false,combinedSgpQuoteVerified:false
});
export function parsePublishedSportsbookHtml(page,html){
 const info=typeof page==='string'?officialSportsbookPublicPage(page):page;
 if(!info||typeof html!=='string')return[];
 const raw=html.slice(0,2400000),out=[],seen=new Set();
 const add=x=>{
  if(!x?.player||!x.americanOdds||out.length>=120)return;
  const key=[x.player.toLowerCase(),x.market,x.rawLine,x.americanOdds].join('|');
  if(!seen.has(key)){seen.add(key);out.push(x)}
 };
 if(info.pageType==='FANDUEL_TEAM_PROPS'){
  // Official published team props pages group questions under "Will NAME...".
  const text=textOf(raw),pat=/\bWill\s+([A-Za-z][A-Za-z .'-]{2,80}?)\s*\.{2,}\s*/gi;
  const players=[...text.matchAll(pat)].slice(0,80);
  for(let i=0;i<players.length;i++){
   const player=players[i][1],from=players[i].index+players[i][0].length;
   const until=i+1<players.length?players[i+1].index:Math.min(text.length,from+1900);
   const segment=text.slice(from,Math.min(until,from+1900));
   for(const m of segment.matchAll(/have at least\s+(\d+(?:\.\d+)?)\s+(passing|rushing|receiving)\s+yards\?\s*Yes\s*([+\-\u2212]\d{2,6})/gi))
    add(result(info.book,info.url,player,m[2].toLowerCase(),m[1],m[3]));
   for(const m of segment.matchAll(/have at least\s+(\d+(?:\.\d+)?)\s+receptions\?\s*Yes\s*([+\-\u2212]\d{2,6})/gi))
    add(result(info.book,info.url,player,'receptions',m[1],m[2]));
   const td=segment.match(/\bscore a touchdown\?\s*([+\-\u2212]\d{2,6})/i);
   if(td)add(result(info.book,info.url,player,'td','Anytime TD',td[1]));
  }
 }else if(info.pageType==='DRAFTKINGS_NETWORK_PUBLIC_PROPS'){
  // This official public table covers its MOST-BET markets, not the whole
  // sportsbook prop catalogue. Do not extrapolate missing alt lines.
  for(const match of raw.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
   const cells=[...match[1].matchAll(/<t[dh]\b[^>]*>([\s\S]*?)<\/t[dh]>/gi)]
    .map(x=>textOf(x[1]));
   if(cells.length<5)continue;
   const category=/anytime\s+td\s+scorer|anytime\s+touchdown/i.test(cells[2])?'td':null;
   if(category)add(result(info.book,info.url,cells[3],category,'Anytime TD',cells[4]));
  }
 }
 // DraftKings' main sportsbook page is an interactive market catalogue. Do
 // not guess which plus/minus number belongs to a player from flat text.
 return out;
}
export async function inspectPublishedSportsbookPage(url,{
 fetchImpl=fetch,timeoutMs=7500,maxBytes=2400000
}={}){
 const page=officialSportsbookPublicPage(url);
 if(!page)return{ok:false,status:'UNSUPPORTED_OR_UNSAFE_URL',
  quotes:[],noAutomaticSgpChanges:true};
 let response;
 try{
  response=await fetchImpl(page.url,{method:'GET',redirect:'error',
   credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(timeoutMs),
   headers:{Accept:'text/html'}});
 }catch(e){return{ok:false,status:'PUBLIC_PAGE_UNREACHABLE_OR_BLOCKED',
  book:page.book,url:page.url,quotes:[],noAutomaticSgpChanges:true}};
 if(!response.ok)return{ok:false,status:'PUBLIC_PAGE_HTTP_'+response.status,
  book:page.book,url:page.url,quotes:[],noAutomaticSgpChanges:true};
 const type=String(response.headers?.get?.('content-type')||'');
 if(type&&!/^text\/html\b/i.test(type))return{ok:false,
  status:'NON_HTML_PAGE',book:page.book,url:page.url,quotes:[],
  noAutomaticSgpChanges:true};
 let html='';
 try{
  if(response.body?.getReader){
   const reader=response.body.getReader(),decoder=new TextDecoder();
   let bytes=0;
   while(true){
    const chunk=await reader.read();if(chunk.done)break;
    bytes+=chunk.value.length;
    if(bytes>maxBytes){await reader.cancel();throw Error('PAGE_TOO_LARGE')}
    html+=decoder.decode(chunk.value,{stream:true});
   }
   html+=decoder.decode();
  }else{
   html=await response.text();if(html.length>maxBytes)throw Error('PAGE_TOO_LARGE');
  }
 }catch{return{ok:false,status:'PAGE_TOO_LARGE_OR_INCOMPLETE',
  book:page.book,url:page.url,quotes:[],noAutomaticSgpChanges:true}}
 const quotes=parsePublishedSportsbookHtml(page,html);
 return{ok:true,status:quotes.length?
  'PUBLIC_PAGE_QUOTES_OBSERVED_UNTIMED':'PUBLIC_PAGE_NO_RELIABLE_QUOTE_PAIRS',
  book:page.book,url:page.url,checkedAt:new Date().toISOString(),
  sourceOddsTimestamp:null,quotes,partialCoverage:true,
  sportsbookPricingVerified:false,eventIdentityVerified:false,
  combinedSgpQuoteVerified:false,canUpdateSgpLegs:false,
  noAutomaticSgpChanges:true,
  note:'Read-only public research, not an authenticated current sportsbook feed. Dynamic site pages, login/geo restrictions or missing line/price pairings fail closed.'};
}
