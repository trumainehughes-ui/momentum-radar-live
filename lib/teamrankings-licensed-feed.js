// Optional, permission-gated TeamRankings team-stat enrichment.
// Never scrape TeamRankings or infer a license from public page visibility.
// Configure a licensed JSON feed URL and explicitly enable only when usage rights permit.
const METRICS=new Set(['opponent-points-per-game','opponent-yards-per-play','opponent-rushing-yards-per-game','opponent-passing-yards-per-game','opponent-rushing-touchdowns-per-game','opponent-passing-touchdowns-per-game','opponent-red-zone-scoring-pct','points-per-game','yards-per-play','rushing-yards-per-game','passing-yards-per-game']);
const ALIAS={LA:'LAR',WAS:'WSH',JAC:'JAX'};
const team=v=>{const k=String(v||'').toUpperCase().replace(/[^A-Z]/g,'');return ALIAS[k]||k};
export async function licensedTeamRankings(season,{fetcher=fetch}={}){
 const url=process.env.TEAMRANKINGS_LICENSED_FEED_URL;
 if(process.env.TEAMRANKINGS_LICENSE_CONFIRMED!=='true'||!url)
  return {enabled:false,status:'NOT_LICENSED',source:'TeamRankings',teams:{},metrics:[]};
 try{
  const u=new URL(url);
  if(u.protocol!=='https:')throw Error('https_required');
  const r=await fetcher(u.toString(),{headers:{accept:'application/json'},signal:AbortSignal.timeout(4500),cache:'no-store'});
  if(!r.ok)throw Error('licensed_feed_'+r.status);
  const d=await r.json();
  if(Number(d.season)!==Number(season)||!Array.isArray(d.rows))throw Error('invalid_season_or_rows');
  const teams={};const metrics=new Set();
  for(const row of d.rows.slice(0,2000)){
   const t=team(row.team),m=String(row.metric||'').trim(),v=Number(row.value);
   if(!/^[A-Z]{2,4}$/.test(t)||!METRICS.has(m)||!Number.isFinite(v)||v<0)continue;
   (teams[t]??={})[m]=v;metrics.add(m);
  }
  const at=Date.parse(d.updatedAt||'');
  if(!Number.isFinite(at)||at>Date.now()+60000||Date.now()-at>7*86400000)throw Error('stale_or_invalid_timestamp');
  return {enabled:true,status:'READY',source:'TeamRankings (licensed feed)',updatedAt:d.updatedAt,teams,metrics:[...metrics]};
 }catch(e){return {enabled:true,status:'UNAVAILABLE',source:'TeamRankings',error:String(e.message||e),teams:{},metrics:[]}}
}
