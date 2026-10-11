// On-demand read-only inspector for a few official, publicly published
// sportsbook pages. NOT a login API, web crawler or authenticated odds feed.
// No cookies, tokens, geo bypass, browser automation, redirects or odds writes.
import {inspectPublishedSportsbookPage} from '../lib/public-sportsbook-reader.js';
import {officialSportsbookPublicPage} from '../lib/sportsbook-public-links.js';
const CACHE=new Map(),TTL=90*1000;
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET_ONLY'});
 const input=String(req.query?.url||'');
 const page=officialSportsbookPublicPage(input);
 if(!page)return res.status(400).json({ok:false,error:'OFFICIAL_PUBLIC_PROPS_URL_REQUIRED',
  supported:['DraftKings public NFL/NBA player props','DraftKings Network player props',
   'FanDuel NFL/NBA team odds pages']});
 const cache=CACHE.get(page.url),now=Date.now();
 if(cache&&now-cache.time<TTL)return res.status(200).json({...cache.value,fromCache:true});
 const result=await inspectPublishedSportsbookPage(page.url);
 if(result.ok)CACHE.set(page.url,{time:Date.now(),value:result});
 if(CACHE.size>30)CACHE.delete(CACHE.keys().next().value);
 return res.status(result.ok?200:422).json(result);
}
