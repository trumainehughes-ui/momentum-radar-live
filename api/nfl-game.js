const ESPN="https://site.api.espn.com/apis/site/v2/sports/football/nfl";
const ESPN_STATS="https://site.web.api.espn.com/apis/common/v3/sports/football/nfl/statistics/byathlete";
const noStore={"Cache-Control":"no-store, max-age=0","Pragma":"no-cache"};
async function json(url){const r=await fetch(url,{headers:{"accept":"application/json"}});if(!r.ok)throw new Error("upstream_"+r.status);return r.json()}
async function projections(competitors){
 const out=[];
 for(const c of competitors){const team=c.team||{},abbr=String(team.abbreviation||'').toUpperCase(),teamKey=abbr||String(team.id||'');if(!teamKey)continue;try{const d=await json(ESPN+'/teams/'+encodeURIComponent(teamKey)+'/roster');const groups=Array.isArray(d.athletes)?d.athletes:[];const rows=groups.flatMap(g=>Array.isArray(g.items)?g.items:Array.isArray(g.athletes)?g.athletes:[]);for(const a of rows){const pos=a.position?.abbreviation||a.position?.name||null;if(!['QB','RB','WR','TE'].includes(pos))continue;out.push({playerId:String(a.id||''),name:a.displayName||a.fullName||a.name||'Unknown',team:abbr,position:pos,stats:[],source:'ESPN current team roster'})}}catch(e){}}
 return out.slice(0,24);
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
  const playerProjections=await projections(competitors);
  return res.status(200).json({ok:true,gameId,teams,injuries:scopedInjuries,blockers,playerProjections,eligibility:{ready:false,state:"VALIDATING",reason:"Official roster/inactive validation is still required before recommendations."},fetchedAt:new Date().toISOString(),source:"ESPN cross-check; NFL/team authority remains required for final eligibility"});
 }catch(e){return res.status(502).json({ok:false,gameId,error:e.message,fetchedAt:new Date().toISOString()})}
}