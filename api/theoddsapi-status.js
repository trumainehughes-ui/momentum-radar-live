// Server-side TheOddsAPI connectivity check. Never expose credentials or raw errors.
const BASE='https://api.theoddsapi.com';
const NO_STORE='private, no-store, max-age=0';
async function check(path,key){
 const response=await fetch(BASE+path,{headers:{'x-api-key':key,Accept:'application/json'},cache:'no-store',signal:AbortSignal.timeout(9000)});
 const body=await response.json().catch(()=>null);
 return {status:response.status,ok:response.ok,body};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control',NO_STORE);
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const key=process.env.THEODDSAPI_API_KEY;
 if(!key)return res.status(503).json({ok:false,error:'theoddsapi_key_not_configured'});
 try{
  const account=await check('/me/',key);
  if(!account.ok)return res.status(200).json({ok:false,configured:true,authenticated:false,httpStatus:account.status,
   reason:account.status===401?'invalid_key':account.status===403?'access_denied':'provider_error'});
  const sports=await check('/sports/',key);
  const rows=Array.isArray(sports.body)?sports.body:Array.isArray(sports.body?.data)?sports.body.data:[];
  const sportsText=JSON.stringify(rows).toLowerCase();
  const accountInfo=account.body||{};
  return res.status(200).json({ok:true,configured:true,authenticated:true,provider:'TheOddsAPI',
   sportsEndpointOk:sports.ok,sportsHttpStatus:sports.status,
   nflListed:sportsText.includes('nfl'),nbaListed:sportsText.includes('nba'),
   accountTier:accountInfo.tier||accountInfo.plan||accountInfo.subscription?.tier||null,
   propsAccess:'NOT_TESTED',combinedSgpQuotes:'NOT_VERIFIED',
   note:'Supplementary data source only. Does not certify sportsbook SGP pricing.'});
 }catch(e){return res.status(503).json({ok:false,configured:true,error:'provider_connection_failed',
  reason:e?.name==='TimeoutError'?'timeout':'network_error'});}
}
