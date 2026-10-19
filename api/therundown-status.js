// TheRundown connection probe. Catalog lookup only (zero data points).
// Never place the API key in client output or logs.
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store, max-age=0');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const key=process.env.THERUNDOWN_API_KEY;
 if(!key)return res.status(503).json({ok:false,provider:'TheRundown',reason:'THERUNDOWN_API_KEY_not_configured'});
 try{
  const response=await fetch('https://therundown.io/api/v2/sports',{
   headers:{'X-TheRundown-Key':key,Accept:'application/json'},
   cache:'no-store',signal:AbortSignal.timeout(9000)});
  if(!response.ok)return res.status(200).json({ok:false,provider:'TheRundown',
   authenticated:false,httpStatus:response.status,
   reason:response.status===401?'key_rejected':response.status===403?'plan_or_access_restricted':'provider_error'});
  const body=await response.json().catch(()=>null);
  const sports=Array.isArray(body)?body:Array.isArray(body?.sports)?body.sports:[];
  const names=sports.map(s=>String(s.name||s.sport_name||'').toLowerCase());
  return res.status(200).json({ok:true,provider:'TheRundown',authenticated:true,
   catalogEntries:sports.length,nflCatalogListed:names.some(n=>n.includes('nfl')),
   nbaCatalogListed:names.some(n=>n.includes('nba')),
   playerPropsVerified:false,combinedSgpQuotesVerified:false,
   paidDataPointsUsed:0,sourceRole:'SECONDARY_RESEARCH'});
 }catch{return res.status(503).json({ok:false,provider:'TheRundown',reason:'connection_failed'});}
}
