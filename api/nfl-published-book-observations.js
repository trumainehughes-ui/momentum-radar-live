// Admin-approved, user-observed first-party sportsbook markets shared by /
// and /picks. Neither GET nor POST claims bookmaker acceptance of an SGP quote.
import {list,put} from '@vercel/blob';
import {timingSafeEqual} from 'node:crypto';
import {nflPublicBookTrustedOrigin} from './nfl-public-book-research.js';
import {
 bookObservationPath,validObservationScope,
 sanitizePublishedBookObservations,keepCurrentPublishedBookRows
} from '../lib/central-official-book-observations.js';
const NO_STORE='private, no-store, max-age=0';
function secureAuth(actual,secret){
 if(!secret||typeof secret!=='string'||secret.length<24)return false;
 const a=Buffer.from(String(actual||'')),b=Buffer.from('Bearer '+secret);
 return a.length===b.length&&timingSafeEqual(a,b);
}
async function jsonFromApp(path,env,fetcher){
 const origin=nflPublicBookTrustedOrigin(env);
 if(!origin)throw Error('published_observation_deployment_identity_unverified');
 const r=await fetcher(origin+path,{
  cache:'no-store',signal:AbortSignal.timeout(12000)
 });
 if(!r.ok)throw Error('official_app_check_http_'+r.status);
 return r.json();
}
async function validateActualGameAndRoster({date,gameId,offers,env,fetcher}){
 const q=new URLSearchParams({date,gameId});
 const schedule=await jsonFromApp('/api/nfl-schedule?date='+encodeURIComponent(date),env,fetcher);
 const game=(schedule.games||[]).find(g=>String(g.gameId)===String(gameId));
 if(!game||!['SCHEDULED','LIVE'].includes(game.status))
  return {ok:false,error:'event_missing_or_not_open'};
 const roster=await jsonFromApp('/api/public-nfl-game?'+q,env,fetcher);
 const names=new Set(Object.values(roster.categories||{}).flatMap(rows=>
  (Array.isArray(rows)?rows:[]).map(p=>String(p.name||'').toLowerCase().replace(/[^a-z0-9]/g,''))).filter(Boolean));
 if(!names.size)return {ok:false,error:'game_roster_unavailable'};
 const missing=offers.find(o=>!names.has(String(o.player).toLowerCase().replace(/[^a-z0-9]/g,'')));
 return missing?{ok:false,error:'player_not_in_game_roster'}:{ok:true,game,rosterCount:names.size,allowedPlayers:names};
}
export function makeOfficialBookFeedHandler({
 storageList=list,storagePut=put,fetcher=fetch,
 env=process.env,now=()=>Date.now()
}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control',NO_STORE);
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))
   return res.status(405).json({ok:false,error:'method_not_allowed'});
  const body=req.method==='POST'?(req.body||{}):{};
  const date=String((req.method==='POST'?body.date:req.query?.date)||''),
   gameId=String((req.method==='POST'?body.gameId:req.query?.gameId)||'');
  if(!validObservationScope(date,gameId))
   return res.status(400).json({ok:false,error:'invalid_game_or_date'});
  const nowTime=now(),today=new Date(nowTime).toISOString().slice(0,10),
   days=(Date.parse(date+'T12:00:00Z')-Date.parse(today+'T12:00:00Z'))/86400000;
  if(days< -1||days>30)return res.status(400).json({ok:false,error:'game_date_outside_allowed_window'});
  if(req.method==='GET'){
   try{
    let offers=[],sourceStates={};
    for(const book of ['FanDuel','DraftKings']){
     const pathname=bookObservationPath(date,gameId,book);
     const blobs=await storageList({prefix:pathname,limit:4});
     const found=(blobs.blobs||[]).find(x=>x.pathname===pathname);
     if(!found){sourceStates[book]='NO_PUBLISHED_OBSERVATION';continue}
     const response=await fetcher(found.url,{cache:'no-store',signal:AbortSignal.timeout(8000)});
     if(!response.ok)throw Error('blob_read_http_'+response.status);
     const rows=keepCurrentPublishedBookRows(await response.json(),{
      date,gameId,book,now:nowTime
     });
     offers.push(...rows);
     sourceStates[book]=rows.length?'USER_OBSERVED_NOT_BOOK_VERIFIED':'EXPIRED_OR_INVALID';
    }
    return res.status(200).json({ok:true,date,gameId,offers,sourceStates,
     status:offers.length?'USER_OBSERVED_NOT_BOOK_VERIFIED':'NO_FRESH_PUBLISHED_OBSERVATIONS',
     bookmakerSgpQuoteVerified:false,automatedSportsbookExtraction:false,
     note:'Published from an authorized first-party-page observation, not independently rechecked or priced as a correlated sportsbook SGP.'});
   }catch(e){
    return res.status(503).json({ok:false,error:'published_observation_storage_unavailable'});
   }
  }
  // Publishing real-money betting selections to all viewers is privileged.
  // A normal public browser may READ, never write; do not reuse CRON_SECRET.
  if(!env.MOMENTUM_BOOK_PUBLISH_KEY||env.MOMENTUM_BOOK_PUBLISH_KEY.length<24)
   return res.status(503).json({ok:false,error:'dedicated_publishing_key_not_configured'});
  if(!secureAuth(req.headers?.authorization,env.MOMENTUM_BOOK_PUBLISH_KEY))
   return res.status(401).json({ok:false,error:'publish_authorization_required'});
  if(JSON.stringify(body).length>180000)
   return res.status(413).json({ok:false,error:'payload_too_large'});
  const book=String(body.book||'');
  const scrubbed=sanitizePublishedBookObservations({
   date,gameId,book,offers:body.offers,now:nowTime
  });
  if(!scrubbed.ok)return res.status(422).json({ok:false,error:scrubbed.error});
  let approved;
  try{approved=await validateActualGameAndRoster({
   date,gameId,offers:scrubbed.offers,env,fetcher
  })}catch{return res.status(503).json({ok:false,error:'official_game_check_unavailable'})}
  if(!approved.ok)return res.status(422).json({ok:false,error:approved.error});
  const validated=sanitizePublishedBookObservations({
   date,gameId,book,offers:scrubbed.offers,now:nowTime,
   allowedPlayers:approved.allowedPlayers
  });
  if(!validated.ok)return res.status(422).json({ok:false,error:validated.error});
  const snapshot={schemaVersion:1,date,gameId,book,
   publisherStatus:'USER_OBSERVED_NOT_BOOK_VERIFIED',
   bookmakerSgpQuoteVerified:false,publishedAt:new Date(nowTime).toISOString(),
   observedAt:validated.observedAt,offers:validated.offers};
  try{
   await storagePut(bookObservationPath(date,gameId,book),JSON.stringify(snapshot),{
    access:'public',contentType:'application/json',addRandomSuffix:false,
    allowOverwrite:true
   });
   return res.status(201).json({ok:true,date,gameId,book,
    published:validated.offers.length,status:snapshot.publisherStatus,
    bookmakerSgpQuoteVerified:false,publishedAt:snapshot.publishedAt});
  }catch{return res.status(503).json({ok:false,error:'observation_publish_storage_unavailable'})}
 };
}
export default makeOfficialBookFeedHandler();
