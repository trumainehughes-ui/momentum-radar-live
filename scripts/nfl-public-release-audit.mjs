// Read-only external audit: zero calls to owner /api/nfl-markets, sportsbook,
// AI generation, cron refresh, private endpoints or mutation routes.
import {nflPublicInjuryReadiness} from '../lib/nfl-public-injury-release-guard.js';
const origin=new URL(process.env.MOMENTUM_AUDIT_ORIGIN||
 'https://momentum-radar-live.vercel.app');
if(origin.protocol!=='https:')throw Error('HTTPS required');
const now=Date.now();
const dateNY=ms=>new Intl.DateTimeFormat('en-CA',{
 timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
}).format(new Date(ms));
const ymd=date=>date.replaceAll('-','');
const days=[0,1,2].map(i=>dateNY(now+i*86400000));
const fetchJson=async(url)=>{
 const r=await fetch(url,{headers:{accept:'application/json'},cache:'no-store',
  signal:AbortSignal.timeout(16000)});
 if(!r.ok)throw Error('HTTP_'+r.status);
 const d=await r.json();if(!d||typeof d!=='object')throw Error('BAD_JSON');
 return d;
};
const ESPN='https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard';
let events=[];
for(const day of [...new Set(days)]){
 const board=await fetchJson(ESPN+'?dates='+ymd(day)+'&limit=100');
 const rows=Array.isArray(board.events)?board.events:[];
 events.push(...rows);
}
const uniq=new Map();
for(const game of events){
 const kickoff=Date.parse(game.date||'');
 const status=String(game.status?.type?.name||game.status?.type?.description||'');
 if(!/^[0-9]{7,12}$/.test(String(game.id||''))||
    !Number.isFinite(kickoff)||kickoff<now-30*60000||
    kickoff>now+48*3600000||/final|post/i.test(status))continue;
 uniq.set(String(game.id),{gameId:String(game.id),date:dateNY(kickoff),
  kickoff:new Date(kickoff).toISOString(),
  teams:(game.competitions?.[0]?.competitors||[]).map(x=>x.team?.abbreviation).filter(Boolean),
  week:Number(game.week?.number)||null});
}
const target=[...uniq.values()].sort((a,b)=>a.kickoff.localeCompare(b.kickoff));
const categoryNames=['passing','rushing','receiving'];
function inspect(g,p){
 const blockers=[];
 if(p.ok!==true||p.date!==g.date||String(p.gameId)!==g.gameId)
  blockers.push('GAME_SNAPSHOT_IDENTITY_MISMATCH');
 if(p.status!=='CURRENT'||p.updatedDataCurrent!==true)
  blockers.push('NO_CURRENT_PUBLISHED_SNAPSHOT');
 const age=now-Date.parse(p.updatedAt||'');
 if(!Number.isFinite(age)||age< -60000||age>15*60000)
  blockers.push('SNAPSHOT_STALE_OR_UNDATED');
 const sides=Array.isArray(p.matchup?.sides)?p.matchup.sides:[];
 const teams=new Set(g.teams);
 if(teams.size!==2||sides.length!==2||
    !sides.every(s=>teams.has(s.offense)&&teams.has(s.defense)&&s.offense!==s.defense)||
    new Set(sides.map(s=>s.offense)).size!==2)
  blockers.push('BILATERAL_MATCHUP_NOT_VERIFIED');
 for(const side of sides){
  const positions=Array.isArray(side.positions)?side.positions:[];
  for(const position of ['QB','RB','WR']){
   const metric=position==='QB'?'passYards':position==='RB'?'rushYards':'recYards';
   const row=positions.find(x=>x.position===position)?.metrics?.find(x=>x.metric===metric);
   if(!Number.isFinite(Number(row?.offensePerGame))||
      row?.offensePerGame===null||!Number.isFinite(Number(row?.defenseAllowedPerGame))||
      row?.defenseAllowedPerGame===null)
    blockers.push('POSITION_EVIDENCE_MISSING_'+side.offense+'_'+position);
  }
 }
 const starterCounts={};
 for(const team of g.teams){
  starterCounts[team]={};
  for(const cat of categoryNames){
   const pos=cat==='passing'?'QB':cat==='rushing'?'RB':'WR';
   const count=(Array.isArray(p.categories?.[cat])?p.categories[cat]:[])
    .filter(x=>x.team===team&&x.position===pos&&x.starterVerified===true&&
      Number(x.gameSample)>=2&&Number(x.avgPerGame)>0).length;
   starterCounts[team][cat]=count;
   if(count===0)blockers.push('VERIFIED_'+team+'_'+pos+'_MISSING');
  }
 }
 const tiers=Object.fromEntries(['Small','Medium','Nuke'].map(risk=>{
  const row=(Array.isArray(p.modelResearchTiers)?p.modelResearchTiers:[]).find(x=>x.risk===risk);
  if(row?.complete!==true)blockers.push('MODEL_'+risk.toUpperCase()+'_INCOMPLETE');
  return[risk,row?.complete===true?'COMPLETE':'INCOMPLETE'];
 }));
 const quotes=Array.isArray(p.verifiedBookParlays)?p.verifiedBookParlays:[];
 const books=Object.fromEntries(['DraftKings','FanDuel'].map(b=>[b,
  quotes.filter(q=>q.book===b&&q.combinedOddsVerified===true).map(q=>q.risk)]));
 if(!quotes.some(q=>q.combinedOddsVerified===true))
  blockers.push('NO_VERIFIED_COMBINED_BOOK_SGP');
 if(Date.parse(g.kickoff)-now<=90*60000&&p.pregameChecks?.officialInactivesVerified!==true)
  blockers.push('GAME_DAY_INACTIVES_UNCONFIRMED');
 return{gameId:g.gameId,date:g.date,teams:g.teams,kickoff:g.kickoff,
  publication:p.status||'UNKNOWN',updatedAt:p.updatedAt||null,
  starterCounts,tiers,verifiedBooks:books,
  blockers:[...new Set(blockers)],releaseReady:blockers.length===0};
}
const results=[];
for(let i=0;i<target.length;i+=3){
 const batch=target.slice(i,i+3);
 results.push(...await Promise.all(batch.map(async game=>{
  try{
   const url=new URL('/api/public-nfl-game',origin);
   url.searchParams.set('date',game.date);url.searchParams.set('gameId',game.gameId);
   const pub=await fetchJson(url.href);
   const published=inspect(game,pub);
   const injuryUrl=new URL('/api/nfl-injuries',origin);
   injuryUrl.searchParams.set('gameId',game.gameId);
   let report;
   try{report=await fetchJson(injuryUrl.href)}
   catch(e){
    return {...published,releaseReady:false,
     blockers:[...new Set([...published.blockers,'CURRENT_INJURY_ENDPOINT_UNAVAILABLE'])],
     injuryAudit:{ok:false,error:String(e.message||e).slice(0,80)}};
   }
   const injuryAudit=nflPublicInjuryReadiness(game,pub,report,{now});
   const blockers=[...new Set([...published.blockers,...injuryAudit.blockers])];
   return {...published,releaseReady:blockers.length===0,blockers,injuryAudit};
  }catch(e){
   return{...game,releaseReady:false,blockers:['PUBLIC_SNAPSHOT_HTTP_OR_JSON_ERROR'],
    error:String(e.message||e).slice(0,80)};
  }
 })));
}
const summary={audit:'NFL_READ_ONLY_PUBLIC_RELEASE_AUDIT',
 origin:origin.origin,at:new Date(now).toISOString(),
 dates:[...new Set(days)],scheduledUpcomingGames:target.length,
 ready:results.filter(x=>x.releaseReady).length,
 notReady:results.filter(x=>!x.releaseReady).length,
 note:'Read-only diagnostics. A model forecast never proves a bookmaker offered line or correlated SGP price.',
 games:results};
console.log(JSON.stringify(summary,null,2));
if(results.some(x=>!x.releaseReady))process.exitCode=1;
if(!target.length)console.log('NO_UPCOMING_GAME_IN_48H: no release-readiness conclusion.');
