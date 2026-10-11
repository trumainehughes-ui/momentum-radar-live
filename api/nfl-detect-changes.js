import {put,list} from '@vercel/blob';
import {aiChangeImpact} from '../lib/ai-mechanics/nfl-change-impact.js';
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl/summary?event=';
const PREFIX='momentum-nfl-change-snapshots/v1/';
const status=s=>String(s||'').trim().toLowerCase();
function extract(data){
 const out=[];
 for(const team of data?.injuries||[]){
  const teamName=team.team?.displayName||team.team?.name||'';
  for(const p of team.injuries||[]){
   const athlete=p.athlete||{},name=athlete.displayName||p.displayName||'';
   const id=String(athlete.id||p.id||'');
   const state=status(p.status||p.type?.description||p.details?.type||'unknown');
   if(!name||!id||state==='unknown')continue;
   out.push({id,name,team:teamName,position:athlete.position?.abbreviation||null,status:state});
  }
 }
 return out.sort((a,b)=>a.id.localeCompare(b.id));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(403).json({ok:false,error:'unauthorized'});
 const gameId=String(req.body?.gameId||'');
 if(!/^\d{8,12}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_game_id'});
 try{
  const r=await fetch(ESPN+encodeURIComponent(gameId),{signal:AbortSignal.timeout(5500)});
  if(!r.ok)return res.status(502).json({ok:false,error:'injury_source_unavailable'});
  const data=await r.json(),current=extract(data);
  if(!Array.isArray(data?.injuries)||!current.length)return res.status(200).json({ok:true,gameId,status:'insufficient_injury_evidence',creditsUsed:0,changes:[]});
  const path=PREFIX+gameId+'.json';
  let prior=null;
  const found=await list({prefix:path,limit:10});
  const item=found.blobs?.find(b=>b.pathname===path);
  if(item){const old=await fetch(item.url,{signal:AbortSignal.timeout(3500)});if(old.ok)prior=await old.json()}
  const previous=new Map((prior?.players||[]).map(p=>[p.id,p]));
  const changes=[];
  if(prior){
   for(const player of current){
    const old=previous.get(player.id);
    if(!old||old.status===player.status||old.team!==player.team)continue;
    changes.push({type:player.status.includes('out')||player.status.includes('inactive')?'player_inactive':'player_injury',gameId,playerId:player.id,playerName:player.name,position:player.position,unit:'offense_or_defense',before:old.status,after:player.status,source:'ESPN NFL injury summary',observedAt:new Date().toISOString()});
   }
  }
  // A snapshot write must succeed before claiming change detection is persisted.
  await put(path,JSON.stringify({players:current,updatedAt:new Date().toISOString()}),{access:'public',addRandomSuffix:false,allowOverwrite:true});
  // Only compare confirmed changes. The detector never spends PropLine credits.
  const assessed=[];
  for(const change of changes.slice(0,4))assessed.push({change,ai:await aiChangeImpact(change)});
  return res.status(200).json({ok:true,gameId,status:prior?'compared':'baseline_created',playersObserved:current.length,changes:assessed,moreChanges:Math.max(0,changes.length-assessed.length),creditsUsed:0,propLineRefreshAuthorized:false,dvpRecalculationSuggested:assessed.some(x=>x.ai.dvpRecheck),sgpRebuildSuggested:assessed.some(x=>x.ai.sgpRebuild)});
 }catch(e){console.error('nfl_change_detector_error',String(e?.message||e));return res.status(503).json({ok:false,error:'change_detection_unavailable',creditsUsed:0})}
}
