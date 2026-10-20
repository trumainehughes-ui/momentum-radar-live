// Read-only 30-team roster audit. Never treats a depth chart as confirmed starters.
const ROOT='https://site.api.espn.com/apis/site/v2/sports/basketball/nba';
const fetchJson=async url=>{
 const r=await fetch(url,{signal:AbortSignal.timeout(12000),headers:{accept:'application/json'}});
 if(!r.ok)throw Error('HTTP '+r.status+' '+url);
 return r.json();
};
const clean=x=>String(x??'').trim();
const athletes=data=>(Array.isArray(data?.athletes)?data.athletes:[])
 .flatMap(g=>Array.isArray(g.items)?g.items:Array.isArray(g.athletes)?g.athletes:[g])
 .map(a=>({id:clean(a.id||a.athlete?.id),name:clean(a.displayName||a.fullName||a.athlete?.displayName),
  status:clean(a.status?.name||a.status?.type||'UNKNOWN'),
  injuries:(a.injuries||[]).map(x=>clean(x.status||x.type?.description)).filter(Boolean)}))
 .filter(a=>/^\d+$/.test(a.id)&&a.name);
const all=await fetchJson(ROOT+'/teams?limit=100');
const entries=all?.sports?.[0]?.leagues?.[0]?.teams||[];
const teams=entries.map(x=>x.team||x).filter(x=>/^\d+$/.test(clean(x.id)));
if(teams.length!==30)throw Error('NBA_TEAMS_INCOMPLETE: expected 30, got '+teams.length);
const result=await Promise.all(teams.map(async t=>{
 try{
  const data=await fetchJson(ROOT+'/teams/'+encodeURIComponent(t.id)+'/roster');
  return {team:t.abbreviation,teamId:clean(t.id),players:athletes(data),error:null};
 }catch(e){return{team:t.abbreviation,teamId:clean(t.id),players:[],error:clean(e.message)}}
}));
const owners=new Map(),duplicates=[];
for(const t of result)for(const p of t.players){
 const prior=owners.get(p.id);
 if(prior&&prior!==t.team)duplicates.push({id:p.id,name:p.name,teams:[prior,t.team]});
 owners.set(p.id,t.team);
}
const failed=result.filter(t=>t.error||t.players.length<10);
const report={checkedAt:new Date().toISOString(),source:'ESPN NBA team rosters',
 teamsChecked:result.length,playersChecked:result.reduce((a,t)=>a+t.players.length,0),
 failedTeams:failed.map(t=>({team:t.team,error:t.error||'INSUFFICIENT_ROSTER'})),
 conflictingPlayerIds:duplicates,teams:result.map(t=>({team:t.team,count:t.players.length,
  players:t.players}))};
console.log(JSON.stringify(report,null,2));
if(failed.length||duplicates.length)process.exitCode=1;
