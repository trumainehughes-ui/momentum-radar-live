// Rolling NFL offense/defense tendencies from completed ESPN games. Research only.
const BASE='https://site.api.espn.com/apis/site/v2/sports/football/nfl/';
const get=async path=>{const r=await fetch(BASE+path,{signal:AbortSignal.timeout(9000)});if(!r.ok)throw Error('ESPN_'+r.status);return r.json()};
const num=x=>{const v=Number(x);return Number.isFinite(v)?v:null};
const avg=(sum,count)=>count?Math.round(sum/count*100)/100:null;
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=1800, stale-while-revalidate=3600');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});
 const weeks=Math.min(8,Math.max(2,Number(req.query?.weeks)||5));
 const end=req.query?.date?new Date(String(req.query.date)+'T12:00:00Z'):new Date();
 if(!Number.isFinite(end.getTime()))return res.status(400).json({ok:false,error:'INVALID_DATE'});
 const dates=Array.from({length:weeks*7},(_,i)=>{const d=new Date(end);d.setUTCDate(d.getUTCDate()-i-1);return d.toISOString().slice(0,10).replaceAll('-','')});
 try{
  const boards=await Promise.allSettled(dates.map(d=>get('scoreboard?dates='+d+'&limit=100')));
  const events=[...new Map(boards.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.events||[]).filter(e=>e.status?.type?.completed===true).map(e=>[e.id,e])).values()];
  const profiles=new Map(),categories=['totalYards','netPassingYards','rushingYards','firstDowns','turnovers'];
  let analyzed=0;
  for(let i=0;i<events.length;i+=12){
   const batch=await Promise.allSettled(events.slice(i,i+12).map(async e=>{
    const data=await get('summary?event='+e.id);
    const sides=data.boxscore?.teams||[];
    if(sides.length!==2)return null;
    return sides.map(s=>({id:String(s.team?.id||''),name:s.team?.displayName,abbreviation:s.team?.abbreviation,
     stats:Object.fromEntries((s.statistics||[]).map(t=>[t.name,num(t.displayValue)]))}));
   }));
   for(const item of batch){
    if(item.status!=='fulfilled'||!item.value)continue;
    analyzed++;
    for(let j=0;j<2;j++){
     const team=item.value[j],opp=item.value[1-j];
     if(!team.id)continue;
     const p=profiles.get(team.id)||{teamId:team.id,team:team.name,abbreviation:team.abbreviation,games:0,offense:{},defenseAllowed:{},samples:{}};
     p.games++;
     for(const k of categories){
      const a=team.stats[k],b=opp.stats[k];
      if(a!==null&&a!==undefined){p.offense[k]=(p.offense[k]||0)+a;p.samples['offense_'+k]=(p.samples['offense_'+k]||0)+1}
      if(b!==null&&b!==undefined){p.defenseAllowed[k]=(p.defenseAllowed[k]||0)+b;p.samples['defense_'+k]=(p.samples['defense_'+k]||0)+1}
     }
     profiles.set(team.id,p);
    }
   }
  }
  const teams=[...profiles.values()].map(p=>({...p,
   offense:Object.fromEntries(categories.map(k=>[k,avg(p.offense[k],p.samples['offense_'+k])])),
   defenseAllowed:Object.fromEntries(categories.map(k=>[k,avg(p.defenseAllowed[k],p.samples['defense_'+k])]))
  })).sort((a,b)=>a.team.localeCompare(b.team));
  return res.status(200).json({ok:true,league:'NFL',source:'ESPN completed game box scores',researchOnly:true,generatedAt:new Date().toISOString(),windowDays:weeks*7,gamesAnalyzed:analyzed,teamsCount:teams.length,teams,limitations:'Team-level tendencies only. Injuries, starters, positional defensive allowances and NFL.com cross-check must be verified separately.'});
 }catch(e){return res.status(503).json({ok:false,error:'NFL_TENDENCY_SOURCE_UNAVAILABLE',detail:String(e.message).slice(0,120)})}
}