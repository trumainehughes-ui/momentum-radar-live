import {apiSports,apiSportsStatus} from './_api-sports.js';
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  try{
    const status=apiSportsStatus();
    if(!status.configured)return res.status(503).json({ok:false,error:'missing_api_sports_key',...status});
    if(String(req.query.probe||'')!=='1')return res.status(200).json({ok:true,...status,note:'Key is configured. Add ?probe=1 for one quota-counted upstream validation request.'});
    const out=await apiSports({sport:'nba',path:'status',kind:'teams'});
    return res.status(200).json({ok:true,configured:true,cache:out.cache,remaining:out.remaining,budgetUsed:out.budgetUsed,fetchedAt:out.fetchedAt});
  }catch(e){return res.status(502).json({ok:false,error:String(e.message||e),...apiSportsStatus()})}
}
