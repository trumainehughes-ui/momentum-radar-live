const ESPN="https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_STATS="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete";
const noStore={"Cache-Control":"no-store, max-age=0","Pragma":"no-cache"};
async function json(url){const r=await fetch(url,{headers:{"accept":"application/json"}});if(!r.ok)throw new Error("upstream_"+r.status);return r.json()}
async function projections(summary,competitors){
 const allowed=new Set(competitors.map(c=>String(c.team?.abbreviation||'').toUpperCase()));
 const roster=[]; for(const t of (summary.rosters||[])){const team=String(t.team?.abbreviation||'').toUpperCase();if(!allowed.has(team))continue;for(const row of (t.roster||t.athletes||[])){const a=row.athlete||row,id=String(a.id||'');if(id)roster.push({playerId:id,name:a.displayName||a.fullName||a.name||'Unknown',team,position:a.position?.abbreviation||row.position?.abbreviation||null})}}
 const skill=roster.filter(x=>['QB','RB','WR','TE'].includes(x.position)).slice(0,24),out=[];
 for(const p of skill){try{const d=await json('https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/athletes/'+p.playerId+'/stats?season=2026&seasontype=2');const cats=d?.splits?.categories||d?.categories||[];const stats=[];for(const cat of cats)for(const s of (cat.stats||[])){if(['passingYards','rushingYards','receivingYards','receptions','touchdowns','passingTouchdowns','rushingTouchdowns','receivingTouchdowns'].includes(s.name))stats.push({name:s.name,value:s.value??null,displayValue:s.displayValue??null})}out.push({...p,stats,source:'ESPN 2026 season statistics'})}catch{out.push({...p,stats:[],source:'ESPN roster'})}}
 return out;
}
const statusMap=s=>{const x=String(s||"").toLowerCase();if(x.includes("out"))return"OUT";if(x.includes("doubt"))return"DOUBTFUL";if(x.includes("question"))return"QUESTIONABLE";return x?"ACTIVE":"UNKNOWN"};
export default async function handler(req,res){
 Object.entries(noStore).forEach(([k,v])=>res.setHeader(k,v));
 const gameId=String(req.query.gameId||""); if(!gameId)return res.status(400).json({ok:false,error:"gameId_required"});
 try{
  const summary=await json(`${ESPN}/summary?event=${encodeURIComponent(gameId)}`);
  const comp=summary.header?.competitions?.[0]||{}; const competitors=comp.competitors||[];
  const allowedIds=new Set(competitors.map(c=>String(c.team?.id||"")).filter(Boolean)); const allowedAbbr=new Set(competitors.map(c=>String(c.team?.abbreviation||"").toUpperCase()).filter(Boolean));
  const injuries=(summary.injuries||[]).filter(team=>allowedIds.has(String(team.team?.id||""))||allowedAbbr.has(String(team.team?.abbreviation||"").toUpperCase())).flatMap(team=>(team.injuries||[]).map(i=>({
    team:team.team?.abbreviation||team.team?.displayName||null,playerId:String(i.athlete?.id||""),name:i.athlete?.displayName||i.athlete?.fullName||"Unknown",
    position:i.athlete?.position?.abbreviation||null,injury:i.details?.type||i.type?.description||i.details?.detail||null,
    status:statusMap(i.status||i.details?.status),rawStatus:i.status||i.details?.status||null,source:"ESPN game summary"
  })));
  const athleteTeam=new Map(); for(const t of (summary.rosters||[])){const ta=String(t.team?.abbreviation||"").toUpperCase();for(const a of (t.roster||t.athletes||[])){const id=String(a.athlete?.id||a.id||"");if(id)athleteTeam.set(id,ta)}}
  const scopedInjuries=injuries.filter(x=>{const rosterTeam=athleteTeam.get(x.playerId);return rosterTeam?allowedAbbr.has(rosterTeam):false});
  const blockers=scopedInjuries.filter(x=>["OUT","DOUBTFUL"].includes(x.status));
  const teams=competitors.map(c=>({id:String(c.team?.id||""),abbr:c.team?.abbreviation,name:c.team?.displayName,homeAway:c.homeAway}));
  const playerProjections=await projections(summary,competitors);
  return res.status(200).json({ok:true,gameId,teams,injuries:scopedInjuries,blockers,playerProjections,eligibility:{ready:false,state:"VALIDATING",reason:"Official roster/inactive validation is still required before recommendations."},fetchedAt:new Date().toISOString(),source:"ESPN cross-check; NFL/team authority remains required for final eligibility"});
 }catch(e){return res.status(502).json({ok:false,gameId,error:e.message,fetchedAt:new Date().toISOString()})}
}