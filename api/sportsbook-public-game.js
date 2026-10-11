// Automatic (not user-paste-only) pregame research using the ESPN event's
// official team names. Never routes arbitrary URLs, logs in, bypasses geo,
// publishes wagers, or claims pages prove current bookmaker-priced SGPs.
// Read-only; cached by exact event to cap public requests.
import {researchOfficialGamePages,eligiblePublicGameResearch}
 from '../lib/sportsbook-public-game.js';
const GAME_TIMEOUT=6500,CACHE_TTL=8*60*1000;
const CACHE=new Map();
export function verifiedESPNPublicGame(raw,requestedId,league){
 const c=raw?.header?.competitions?.[0],id=String(c?.id||raw?.header?.id||'');
 if(id!==String(requestedId))return null;
 const sides=c?.competitors||[],home=sides.find(x=>x.homeAway==='home'),
  away=sides.find(x=>x.homeAway==='away');
 const kickoff=c?.date||raw?.header?.competitions?.[0]?.date||'';
 const status=String(c?.status?.type?.state||raw?.header?.competitions?.[0]?.status?.type?.state||'pre').toLowerCase();
 if(!home?.team?.displayName||!away?.team?.displayName||status!=='pre')return null;
 return{gameId:id,league,home:home.team.displayName,away:away.team.displayName,
  kickoff};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=300, stale-while-revalidate=60');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'GET_ONLY'});
 const league=String(req.query?.league||'nfl').toLowerCase(),
  gameId=String(req.query?.gameId||'');
 if(!['nfl','nba'].includes(league)||!/^[0-9]{7,12}$/.test(gameId))
  return res.status(400).json({ok:false,error:'INVALID_LEAGUE_OR_ESPN_GAME'});
 const key=league+'|'+gameId,prior=CACHE.get(key);
 if(prior&&Date.now()-prior.at<CACHE_TTL)
  return res.status(200).json({...prior.value,fromCache:true});
 const source=league==='nfl'?'football/nfl':'basketball/nba';
 let official=null;
 try{
  const url='https://site.api.espn.com/apis/site/v2/sports/'+source+
   '/summary?event='+gameId;
  const r=await fetch(url,{cache:'no-store',redirect:'error',
   signal:AbortSignal.timeout(GAME_TIMEOUT)});
  if(!r.ok)throw Error('ESPN_'+r.status);
  official=verifiedESPNPublicGame(await r.json(),gameId,league);
 }catch{
  return res.status(503).json({ok:false,status:'ESPN_GAME_UNVERIFIABLE',
   gameId,booksChecked:[],pages:[],quotes:[],
   canChangeSgp:false,verifiedCombinedBookPrice:false});
 }
 if(!eligiblePublicGameResearch(official))
  return res.status(200).json({ok:false,status:'NOT_ELIGIBLE_PREGAME_WINDOW',
   gameId,booksChecked:[],pages:[],quotes:[],
   canChangeSgp:false,verifiedCombinedBookPrice:false});
 const output=await researchOfficialGamePages(official);
 CACHE.set(key,{at:Date.now(),value:output});
 if(CACHE.size>50)CACHE.delete(CACHE.keys().next().value);
 return res.status(200).json(output);
}
