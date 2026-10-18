// User-authorized Optimal projection snapshot bridge for Momentum Radar.
// This is not an Optimal API client: ChatGPT plugins cannot be called by
// Vercel serverless functions. No sportsbook odds, selection IDs or SGP quotes.
import {list,put} from '@vercel/blob';
import {timingSafeEqual} from 'node:crypto';
import {normalizeOptimalReference,OPTIMAL_REFERENCE_TTL_MS}
 from '../lib/optimal-projection-crosscheck.js';
const KEY='momentum-optimal-research/v1/';
const NO_STORE='private, no-store, max-age=0';
const scope=(league,date,gameId)=>['nfl','nba'].includes(league)&&
 /^\d{4}-\d{2}-\d{2}$/.test(date)&&/^\d{7,12}$/.test(gameId)?
 KEY+league+'/'+date+'/'+gameId+'/':null;
const compare=(received,secret)=>{
 if(typeof secret!=='string'||secret.length<32)return false;
 const left=Buffer.from(String(received||'')),right=Buffer.from('Bearer '+secret);
 return left.length===right.length&&timingSafeEqual(left,right);
};
export function makeOptimalProjectionReferenceHandler({
 blobList=list,blobPut=put,fetcher=fetch,env=process.env,now=()=>Date.now()
}={}){
 return async function handler(req,res){
  res.setHeader('Cache-Control',NO_STORE);
  res.setHeader('X-Content-Type-Options','nosniff');
  if(!['GET','POST'].includes(req.method))
   return res.status(405).json({ok:false,error:'method_not_allowed'});
  const source=req.method==='POST'?req.body||{}:req.query||{};
  const league=String(source.league||'').toLowerCase(),
   date=String(source.date||''),gameId=String(source.gameId||'');
  const prefix=scope(league,date,gameId);
  if(!prefix)return res.status(400).json({ok:false,error:'invalid_projection_scope'});
  const today=Math.floor(now()/86400000),
   day=Math.floor(Date.parse(date+'T12:00:00Z')/86400000);
  if(!Number.isFinite(day)||day<today-2||day>today+30)
   return res.status(400).json({ok:false,error:'date_outside_window'});
  if(req.method==='POST'){
   if(!env.MOMENTUM_OPTIMAL_IMPORT_KEY||env.MOMENTUM_OPTIMAL_IMPORT_KEY.length<32)
    return res.status(503).json({ok:false,error:'projection_import_not_configured'});
   if(!compare(req.headers?.authorization,env.MOMENTUM_OPTIMAL_IMPORT_KEY))
    return res.status(401).json({ok:false,error:'projection_import_not_authorized'});
   if(JSON.stringify(req.body||{}).length>200000)
    return res.status(413).json({ok:false,error:'projection_snapshot_too_large'});
   const validated=normalizeOptimalReference(source,{now:now()});
   if(!validated.ok)return res.status(422).json(validated);
   const timestamp=Date.parse(validated.observedAt);
   const rev=String(9999999999999-timestamp).padStart(13,'0');
   const suffix=Math.random().toString(36).slice(2,10);
   const pathname=prefix+rev+'-'+suffix+'.json';
   try{
    await blobPut(pathname,JSON.stringify(validated),{
     access:'public',contentType:'application/json',addRandomSuffix:false});
    return res.status(201).json({ok:true,status:'ADVISORY_REFERENCE_PUBLISHED',
     league,date,gameId,observedAt:validated.observedAt,
     referenceRows:validated.players.length,bookmakerSgpQuoteVerified:false});
   }catch{return res.status(503).json({ok:false,error:'projection_storage_unavailable'})}
  }
  try{
   const blobs=await blobList({prefix,limit:15});
   const exact=(blobs?.blobs||[]).filter(b=>b.pathname?.startsWith(prefix)&&
    /[0-9]{13}-[a-z0-9]{8}[.]json$/.test(b.pathname))
    .sort((a,b)=>a.pathname.localeCompare(b.pathname));
   for(const b of exact.slice(0,3)){
    const at=9999999999999-Number(b.pathname.slice(prefix.length,prefix.length+13));
    if(!Number.isFinite(at)||now()-at>OPTIMAL_REFERENCE_TTL_MS||at>now()+60000)continue;
    const response=await fetcher(b.url,{cache:'no-store',signal:AbortSignal.timeout(6500)});
    if(!response.ok)continue;
    const validated=normalizeOptimalReference(await response.json(),{now:now()});
    if(!validated.ok||validated.league!==league||validated.date!==date||
       validated.gameId!==gameId)continue;
    return res.status(200).json({...validated,advisoryOnly:true,
     note:'Authorized imported projections; source not independently fetched by this server. Not sportsbook offers, odds, or confirmed injury clearances.'});
   }
   return res.status(200).json({ok:true,league,date,gameId,
    status:'NO_CURRENT_OPTIMAL_REFERENCE',players:[],
    bookmakerSgpQuoteVerified:false,
    note:'ChatGPT connector data is not automatically available to this website.'});
  }catch{return res.status(503).json({ok:false,error:'projection_storage_unavailable'})}
 };
}
export default makeOptimalProjectionReferenceHandler();
