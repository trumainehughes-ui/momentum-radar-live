import {put,list} from '@vercel/blob';
import {timingSafeEqual} from 'node:crypto';

const PREFIX='momentum-model-ingest/v1/';
const risks=['Small','Medium','Large','Nuke'];
const markets={nfl:new Set(['passing','rushing','receiving','receptions','td']),
 nba:new Set(['points','rebounds','assists','threes','pra'])};
const same=(a,b)=>{const x=Buffer.from(String(a||'')),y=Buffer.from(String(b||''));return x.length===y.length&&timingSafeEqual(x,y)};
const clean=s=>String(s||'').trim().slice(0,100);
const key=(league,gameId)=>PREFIX+league+'-'+gameId+'/';
export async function latestModelSgpIngest(league,gameId){
 if(!markets[league]||!/^[0-9]{7,12}$/.test(String(gameId)))return null;
 const hits=await list({prefix:key(league,gameId),limit:20});
 const b=(hits.blobs||[]).sort((a,b)=>b.pathname.localeCompare(a.pathname))[0];
 if(!b)return null;
 const r=await fetch(b.url,{cache:'no-store',signal:AbortSignal.timeout(7000)});
 return r.ok?await r.json():null;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||!same(req.headers.authorization,'Bearer '+process.env.CRON_SECRET))
  return res.status(401).json({error:'unauthorized'});
 try{
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  const league=clean(body?.league).toLowerCase(),gameId=clean(body?.gameId);
  if(!markets[league]||!/^[0-9]{7,12}$/.test(gameId))return res.status(400).json({error:'invalid_game'});
  if(!Array.isArray(body.tiers)||body.tiers.length!==4)return res.status(400).json({error:'four_tiers_required'});
  const teams=new Set((body.teams||[]).map(x=>clean(x).toUpperCase()));
  if(teams.size!==2)return res.status(400).json({error:'two_teams_required'});
  const tiers=[];
  const signatures=new Set();
  for(const risk of risks){
   const t=body.tiers.find(x=>x.risk===risk);
   const min=risk==='Small'?3:risk==='Medium'?4:risk==='Large'?5:5,
    max=risk==='Small'?5:risk==='Medium'?6:risk==='Large'?7:10;
   if(!t||!Array.isArray(t.legs)||t.legs.length<min||t.legs.length>max)
    return res.status(400).json({error:'invalid_tier_'+risk});
   const seen=new Set(),legs=[];
   for(const leg of t.legs){
    const player=clean(leg.player),team=clean(leg.team).toUpperCase();
    const category=clean(leg.category).toLowerCase(),target=Number(leg.modelTarget);
    const playerId=clean(leg.playerId);
    if(!player||!teams.has(team)||!markets[league].has(category)||
      !Number.isFinite(target)||target<=0||!playerId)
     return res.status(400).json({error:'invalid_leg_'+risk});
    const unique=playerId+'|'+category;
    if(seen.has(unique))return res.status(400).json({error:'duplicate_leg'});
    seen.add(unique);
    legs.push({player,playerId,team,category,modelTarget:target,gameId,
     source:clean(leg.source),explanation:clean(leg.explanation),
     target:null,sportsbookVerified:false,marketSelectionStatus:'MODEL_ONLY_NOT_BOOK_VERIFIED'});
   }
   const signature=JSON.stringify(legs.map(l=>[l.playerId,l.category,l.modelTarget]).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
   if(signatures.has(signature))return res.status(400).json({error:'duplicate_tier_'+risk});
   signatures.add(signature);
   tiers.push({risk,legs,requiredLegs:legs.length,mode:'MODEL_ONLY',publishable:false,
    combinedBookQuoteVerified:false,actualSgpOdds:null,estimatedOdds:null,
    explanation:clean(t.explanation),source:'CHATGPT_PLUGIN_MODEL_RESEARCH'});
  }
  const data={league,gameId,teams:[...teams],tiers,checkedAt:new Date().toISOString(),
   rosterVerification:'PENDING_SERVER_VALIDATION',source:'CHATGPT_PLUGIN_MODEL_RESEARCH'};
  const stamp=String(9999999999999-Date.now()).padStart(13,'0');
  await put(key(league,gameId)+stamp+'.json',JSON.stringify(data),{
   access:'public',addRandomSuffix:false,contentType:'application/json'});
  return res.status(201).json({stored:true,gameId,tiers:tiers.map(t=>({risk:t.risk,legs:t.legs.length})),
   publicationStatus:'AWAITING_GAME_ROSTER_VALIDATION'});
 }catch(e){return res.status(500).json({error:'ingest_failed'});}
}
