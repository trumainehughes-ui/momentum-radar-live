// NBA UI is intentionally independent of the NFL predictor and sportsbook credits.
(()=>{
 const qs=s=>document.querySelector(s);
 const safe=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 const cats={points:'Points',rebounds:'Rebounds',assists:'Assists',threes:'3-Pointers',pra:'PRA'};
 const dateET=()=>{
  const p=Object.fromEntries(new Intl.DateTimeFormat('en-US',{timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date()).filter(p=>p.type!=='literal').map(p=>[p.type,p.value]));
  return p.year+'-'+p.month+'-'+p.day;
 };
 let data=null,selected=null,tab='gameday',loading=false,token=0;
 const gameCache=new Map();
 async function json(path){
  const res=await fetch(path,{cache:'no-store'});
  const d=await res.json().catch(()=>({ok:false,error:'invalid_source_response'}));
  if(!res.ok||!d.ok)throw Error(d.error||'nba_source_unavailable');
  return d;
 }
 function time(value){
  const d=new Date(value);
  return Number.isFinite(d.getTime())?new Intl.DateTimeFormat('en-US',{weekday:'short',hour:'numeric',minute:'2-digit',timeZoneName:'short'}).format(d):'Tipoff TBD';
 }
 function renderGames(){
  const box=qs('#nbaBoard');if(!box)return;
  const games=data?.games||[];
  if(!games.length){box.innerHTML='<div class="msg">No NBA games listed for this date. Select another date.</div>';return}
  box.innerHTML=games.map(g=>{
   const result=['LIVE','FINAL'].includes(g.status)?' • '+(g.away.score??'—')+' - '+(g.home.score??'—'):'';
   const readiness=g.coverage;
   const sgpState=readiness?(readiness.status==='MODEL_ONLY'?
     'MODEL ONLY • '+readiness.tierCount+' candidate tier(s)':
     readiness.status==='WINDOW_NOT_STARTED'?'SGP build begins 36h before tipoff':
     readiness.status==='NOT_READY'?'SGP model NOT READY':
     readiness.status==='STALE'?'SGP model refresh pending':
     readiness.status==='PENDING'?'SGP model pending':
     readiness.status==='SNAPSHOT_UNAVAILABLE'?'Pregame snapshot unavailable':
     readiness.status==='IDENTITY_MISMATCH'?'Pregame identity review needed':
     readiness.status):'';
   return '<button type="button" data-nba-game="'+safe(g.gameId)+'" class="card" style="width:100%;text-align:left;margin:7px 0;cursor:pointer">'+
    '<div class="rank">'+safe(g.stage)+' • '+safe(g.status)+'</div>'+
    '<div class="name" style="color:#f4f7fb!important;font-weight:800!important;text-shadow:none!important">'+safe(g.away.abbr)+' @ '+safe(g.home.abbr)+safe(result)+'</div>'+
    '<div class="meta">'+safe(time(g.kickoff))+'</div>'+
    (sgpState&&g.status==='SCHEDULED'?'<div class="refresh">'+safe(sgpState)+'</div>':'')+
    '<div class="refresh">View NBA game details →</div></button>';
  }).join('');
  box.querySelectorAll('[data-nba-game]').forEach(button=>button.addEventListener('click',()=>openGame(button.dataset.nbaGame)));
 }
 async function detail(gameId){
  const cached=gameCache.get(gameId);
  if(cached&&Date.now()-cached.at<(cached.data.status==='FINAL'?5*60*1000:60*1000))return cached.data;
  const d=await json('/api/nba-game?gameId='+encodeURIComponent(gameId));
  gameCache.set(gameId,{at:Date.now(),data:d});
  return d;
 }
 function renderInjuries(d){
  const box=qs('#nbaInjuries');if(!box)return;
  box.innerHTML=d.injuries?.length?d.injuries.slice(0,16).map(x=>
    '<div class="nflMarketLine"><b>'+safe(x.name)+' • '+safe(x.team)+'</b>'+
    '<div class="meta">'+safe(x.status)+'</div><div class="note">'+safe(x.detail||'No detail supplied')+'</div></div>'
   ).join('')+'<div class="refresh">ESPN-reported injuries; confirmed game-day inactives not verified.</div>':
   '<div class="note">No usable injury entries were returned for this matchup. This does NOT confirm a healthy or active roster.</div>';
 }
 function sgps(d){
  const rows=d?.sgps||[],readiness=d?.pregameReadiness;
  const stage=readiness?.stage?String(readiness.stage).replaceAll('_',' '):'AWAITING FIRST PREGAME BUILD';
  const freshness=readiness?.checkedAt?new Date(readiness.checkedAt).toLocaleString():'Not collected';
  const injury=readiness?.injuryCheckedAt?new Date(readiness.injuryCheckedAt).toLocaleString():'Pending';
  const basis=readiness?.sampleSource==='PRIOR_SEASON'?
   ' • Historical baseline: '+safe((readiness?.historicalSeason||2026)-1)+'–'+safe(String(readiness?.historicalSeason||2026).slice(-2))+' (NOT current-season results)':
   readiness?.sampleSource==='NO_COMPLETED_GAMES'?' • No eligible completed game samples':'';
  const stale=readiness?.status==='STALE'?
   '<div class="note"><b>STALE NBA MODEL — new pregame injury/roster check required.</b> '+safe(readiness.reason||'')+'</div>':'';
  const summaryPending=d?.pregameSourceMode==='SCOREBOARD_VERIFIED_FALLBACK'?
   '<div class="note">ESPN detailed game preview is not yet available. This matchup was rechecked against the ESPN scoreboard; reported injuries and starters may still be unverified.</div>':'';
  const source=summaryPending+stale+'<div class="refresh">Pregame model: '+safe(stage)+basis+' • AI review: '+safe(readiness?.aiReviewStatus||'PENDING')+' • Last model/injury check: '+safe(freshness)+
   ' • Injury evidence: '+safe(injury)+' ('+safe(readiness?.injuryReportStatus||'UNVERIFIED')+')</div>';
  return source+rows.map(s=>{
   const ready=s.status==='MODEL_CANDIDATE'&&Array.isArray(s.legs)&&s.legs.length>0;
   const list=ready?s.legs.map((l,i)=>
    '<div class="nflMarketLine"><b>'+(i+1)+'. '+safe(l.name)+' • '+safe(l.team)+'</b>'+
    '<div class="meta">'+safe(l.threshold)+'+ '+safe(l.category)+' • historical mean '+safe(l.projection)+
    ' • '+safe(l.sampleGames)+' completed games • '+(l.starterVerified===true?'GAME STARTER VERIFIED':'STARTER UNCONFIRMED')+'</div></div>').join(''):'';
   return '<div class="nflSgpMini" style="margin-bottom:12px">'+
    '<b>'+safe(s.risk)+' SGP</b>'+
    '<div class="meta">'+(ready?'MODEL-ONLY CANDIDATE':'NOT READY')+
    ' • Combined sportsbook odds NOT VERIFIED</div>'+list+
    '<div class="note">'+safe(s.reason||'No verified model data.')+'</div>'+
    (s.requires?'<div class="refresh">'+safe(s.requires)+'</div>':'')+'</div>';
  }).join('')+
   '<div class="note">Automatically rebuilt when eligible evidence changes. ESPN roster listing does not verify a starter, and these projected alternate thresholds are NOT sportsbook offers. AI review cannot override eligibility or invent odds.</div>';
 }
 async function openGame(id){
  const game=data?.games?.find(x=>x.gameId===id);if(!game)return;
  selected=id;qs('#nbaHome').style.display='none';qs('#nbaDetail').style.display='block';
  const head=qs('#nbaGameHead');
  head.innerHTML='<div class="card"><div class="rank">'+safe(game.stage)+' • '+safe(game.status)+'</div>'+
   '<div class="name" style="color:#f4f7fb!important;font-weight:800!important">'+safe(game.away.name||game.away.abbr)+' @ '+safe(game.home.name||game.home.abbr)+'</div>'+
   '<div class="meta">'+safe(time(game.kickoff))+'</div></div>';
  qs('#nbaPlayers').innerHTML='<div class="msg">Retrieving ESPN game box score…</div>';
  const matchupBox=document.createElement('div');matchupBox.className='panel';matchupBox.dataset.automaticMatchup='NBA';
  qs('#nbaPlayers').before(matchupBox);
  qs('#nbaDetail').querySelectorAll('[data-automatic-matchup="NBA"]').forEach((el)=>{if(el!==matchupBox)el.remove()});
  matchupBox.innerHTML='<div class="refresh">Loading NBA offense vs. defense and DVP matchup…</div>';
  (async()=>{
   try{
    const url='/api/nba-team-matchups?days=10&homeId='+encodeURIComponent(game.home.id)+'&awayId='+encodeURIComponent(game.away.id);
    const report=await json(url);
    if(selected!==id||!matchupBox.isConnected)return;
    const matchups=report.matchups;
    if(!matchups){matchupBox.innerHTML='<div class="note">NBA matchup data is not yet available for these two teams.</div>';return}
    const metric=(value)=>Number.isFinite(Number(value))?Number(value).toFixed(1):'—';
    const side=(entry,opponent)=>'<div class="nflSgpMini" style="margin:10px 0;padding:12px">'+
     '<b>'+safe(entry.team)+' offense vs '+safe(opponent)+' defense</b>'+
     '<div class="meta">Team points/game '+metric(entry.offense.points)+' • Opponent allows '+metric(entry.opponentDefense.points)+' points/game</div>'+
     '<div class="refresh">Opponent DVP • '+safe(entry.defenseGames)+' completed defensive games • team totals by position</div>'+
     '<div style="overflow-x:auto"><table style="width:100%;font-size:13px;text-align:left;border-collapse:collapse">'+
     '<thead><tr><th>Position</th><th>PTS</th><th>REB</th><th>AST</th><th>3PM</th></tr></thead><tbody>'+
     Object.entries(entry.opponentPositionAllowances||{}).map(([pos,v])=>
      '<tr><td>'+safe(pos==='G'?'Guards':pos==='F'?'Forwards':pos==='C'?'Centers':pos)+' ('+safe(v.games)+' games)</td><td>'+metric(v.points)+'</td><td>'+metric(v.rebounds)+'</td><td>'+metric(v.assists)+'</td><td>'+metric(v.threes)+'</td></tr>').join('')+
     '</tbody></table></div></div>';
    matchupBox.innerHTML='<h3>NBA Matchup Intelligence • Defense vs Position (DVP)</h3>'+
     '<div class="note">Rolling '+safe(report.windowDays)+'-day ESPN completed-game sample • '+safe(matchups.sampleQuality)+
     ' • matchup adjustment '+safe(matchups.projectionAdjustmentStatus||'UNAVAILABLE')+' • positional totals represent all opposing players at each position, not an individual player projection.</div>'+
     side(matchups.home,game.away.name||game.away.abbr)+side(matchups.away,game.home.name||game.home.abbr)+
     '<div class="note">Research only. Early-season samples are limited; official starters and sportsbook offers are separate checks.</div>';
   }catch{
    if(selected===id&&matchupBox.isConnected)matchupBox.innerHTML='<div class="note">NBA matchup DVP feed temporarily unavailable.</div>';
   }
  })();
  qs('#nbaInjuries').textContent='Checking available ESPN injury evidence…';
  qs('#nbaSgps').textContent='Checking SGP readiness…';
  const request=++token;
  try{
   const d=await detail(id);if(request!==token||selected!==id)return;
   // Explain game-specific model forecasts separately from completed box scores.
   const forecastBox=document.createElement('div');
   forecastBox.className='panel';
   forecastBox.dataset.nbaForecast='true';
   qs('#nbaDetail').querySelectorAll('[data-nba-forecast]').forEach(el=>el.remove());
   matchupBox.after(forecastBox);
   const projections=(Array.isArray(d.playerProjections)?d.playerProjections:[])
    .filter(p=>['points','rebounds','assists','threes'].includes(p.category)&&Number.isFinite(Number(p.projection))&&Number(p.projection)>0)
    .sort((a,b)=>Number(b.projection)-Number(a.projection));
   const categories=[['points','Points'],['rebounds','Rebounds'],['assists','Assists'],['threes','3-Pointers']];
   forecastBox.innerHTML='<h3>Matchup Player Projections • AI Research</h3>'+
    '<div class="note">Player forecasts incorporate historical performance and available matchup adjustments. These are not verified sportsbook lines. Starter status must be checked before betting.</div>'+
    (projections.length?categories.map(([key,label])=>{
     const leaders=projections.filter(p=>p.category===key).slice(0,5);
     return '<div class="nflSgpMini" style="margin:10px 0;padding:12px"><b>'+label+' — projected leaders</b>'+
      (leaders.length?leaders.map(p=>
       '<div class="nflMarketLine"><b>'+safe(p.name||p.playerName)+' • '+safe(p.team)+'</b>'+
       '<div class="pick">Projected '+safe(Number(p.projection).toFixed(1))+'</div>'+
       '<div class="meta">Base '+safe(p.baseProjection??'—')+' • matchup factor '+safe(Number.isFinite(Number(p.matchupAdjustment?.factor))?Number(p.matchupAdjustment.factor).toFixed(3)+'x':'not quantified')+
       ' • '+safe(p.sampleGames??0)+' completed games • '+safe(p.projectionReliability||'reliability unverified')+' • '+(p.starterVerified===true?'starter confirmed':'starter unconfirmed')+'</div></div>').join(''):
       '<div class="note">No eligible player forecast available.</div>')+'</div>';
    }).join(''):'<div class="note">Player projections have not been collected for this matchup.</div>');
   qs('#nbaSgps').innerHTML=sgps(d);
   renderInjuries(d);
   if(!d.players?.length){
    qs('#nbaPlayers').innerHTML='<div class="msg">'+
     (d.status==='SCHEDULED'?'Game has not started. See the separate SGP section for any current model-only historical candidates; player box-score RESULTS will appear after tip-off.':'No verified player box-score statistics yet.')+
     '</div>';return;
   }
   // Automatic historical evidence for selected players; never use the selected game's result
   // as its own defensive baseline. Missing history remains explicitly unavailable.
   const candidatePlayers=[...d.players].filter(x=>/^[0-9]+$/.test(String(x.playerId||''))&&Number.isFinite(Number(x.points)))
    .sort((a,b)=>Number(b.points)-Number(a.points)).slice(0,3);
   const kickoffDay=String(game.kickoff||'').slice(0,10);
   const priorDates=Array.from({length:4},(_,i)=>{
    const day=new Date(kickoffDay+'T12:00:00Z');day.setUTCDate(day.getUTCDate()-(i+1)*7);
    return day.toISOString().slice(0,10).replace(/-/g,'');
   }).join(',');
   Promise.allSettled(candidatePlayers.map(async p=>{
    const teamAbbr=String(p.team||'').toUpperCase();
    const opponent=teamAbbr===String(game.home.abbr).toUpperCase()?game.away:
     teamAbbr===String(game.away.abbr).toUpperCase()?game.home:null;
    if(!opponent?.id)return null;
    const params=new URLSearchParams({league:'NBA',playerId:String(p.playerId),
     opponentId:String(opponent.id),stat:'points',dates:priorDates});
    const response=await fetch('/api/matchup-research?'+params,{signal:AbortSignal.timeout(20000)});
    if(!response.ok)return null;
    const result=await response.json();
    return {...result,playerName:p.name,statLabel:'Points'};
   })).then(results=>{
    if(request!==token||selected!==id)return;
    window.momentumAutomaticMatchupResearch?.render(matchupBox,
     results.filter(x=>x.status==='fulfilled'&&x.value).map(x=>x.value));
   });
   const ranked=[...d.players].filter(x=>Number.isFinite(Number(x.points))).sort((a,b)=>b.points-a.points);
   qs('#nbaPlayers').innerHTML='<div class="refresh">ACTUAL '+safe(d.status)+' GAME BOX SCORE — not betting projections</div>'+
    ranked.map(p=>'<div class="nflMarketLine"><b>'+safe(p.name)+' • '+safe(p.team)+'</b>'+
      '<div class="meta">Points '+safe(p.points??'—')+' • Rebounds '+safe(p.rebounds??'—')+
      ' • Assists '+safe(p.assists??'—')+' • 3PM '+safe(p.threes??'—')+' • PRA '+safe(p.pra??'—')+'</div></div>').join('');
  }catch{
   if(request!==token||selected!==id)return;
   qs('#nbaPlayers').innerHTML='<div class="msg">Game details could not be verified. No player statistics have been substituted.</div>';
   qs('#nbaInjuries').textContent='Injury evidence unavailable; do not assume players are active.';
   qs('#nbaSgps').textContent='Small, Medium and Nuke unavailable until the game data source recovers.';
  }
 }
 async function renderLeaders(){
  if(tab==='gameday'){
   qs('#nbaTopTitle').textContent='Matchup Center';
   qs('#nbaTopBoard').innerHTML='<div class="msg">Choose any listed game to view NBA player box scores, injury evidence, and SGP readiness.</div>';
   return;
  }
  if(tab==='edgehunter'){
   qs('#nbaTopTitle').textContent='NBA Edge Hunter — Four-Leg Research';
   qs('#nbaTopBoard').innerHTML='<div class="msg">Checking NBA slate, player evidence and sportsbook verification…</div>';
   try{
    const d=await json('/api/nba-edge-hunter?date='+encodeURIComponent(qs('#nbaDate').value));
    if(tab!=='edgehunter')return;
    const s=d.selection||{},legs=Array.isArray(s.legs)?s.legs:[];
    qs('#nbaTopBoard').innerHTML='<div class="note"><b>'+safe(s.status||'NOT_READY')+'</b> • '+safe(d.slateGames??0)+' scheduled games • '+safe(d.snapshotProjectionCount??0)+' historical projections<br>'+
     'Research only; no sportsbook prices or publishable parlays are implied.</div>'+
     (legs.length===4?legs.map(p=>'<div class="nflMarketLine"><b>'+safe(p.name)+' • '+safe(p.category)+'</b><div class="pick">Over '+safe(p.line)+'</div>'+
      '<div class="meta">Last 10 hit rate '+safe(Math.round(p.hitRate*100))+'% • projection edge '+safe(Math.round(p.edge*100))+'%</div></div>').join(''):
      '<div class="msg">No verified four-leg Edge Hunter selection is ready. '+safe(s.reason||'Required evidence unavailable.')+'</div>')+
     '<div class="note">Still needed: '+safe((d.missingInputs||[]).join(', ').replaceAll('_',' '))+'</div>';
   }catch{
    if(tab==='edgehunter')qs('#nbaTopBoard').innerHTML='<div class="msg">Edge Hunter source unavailable. No unverified picks displayed.</div>';
   }
   return;
  }
  if(tab==='sgp'){
   qs('#nbaTopTitle').textContent='NBA Same Game Parlays';
   qs('#nbaTopBoard').innerHTML='<div class="note"><b>Small • Medium • Nuke</b><br>'+
    'NBA SGPs require verified pregame player averages/projections, injury and rotation clearance, available alternate props, and sportsbook-quoted combined odds. Select a game to review the readiness status. No fictional prices or picks will be shown.</div>';
   return;
  }
  const thisTab=tab,stamp=token;
  qs('#nbaTopTitle').textContent='Top 10 — '+(cats[tab]||'NBA')+' (game results)';
  qs('#nbaTopBoard').innerHTML='<div class="msg">Checking completed and live game box scores…</div>';
  // Pregame ranking source: verified-current model snapshots, not future box scores.
  if(!(data?.games||[]).some(g=>['LIVE','FINAL'].includes(g.status))){
   try{
    const pre=await json('/api/nba-best-edge?date='+encodeURIComponent(qs('#nbaDate').value));
    if(thisTab!==tab||stamp!==token)return;
    const rows=(Array.isArray(pre.research)?pre.research:[])
     .filter(p=>p.category===thisTab&&Number.isFinite(Number(p.projection))&&Number(p.projection)>0)
     .sort((a,b)=>Number(b.projection)-Number(a.projection)).slice(0,10);
    qs('#nbaTopTitle').textContent='Top 10 — '+(cats[tab]||'NBA')+' (pregame projections)';
    qs('#nbaTopBoard').innerHTML=rows.length?rows.map((p,i)=>
     '<div class="nflMarketLine"><b>#'+(i+1)+' '+safe(p.name)+'</b> <span class="meta">'+safe(p.team)+'</span>'+
     '<div class="pick">Projected '+safe(Number(p.projection).toFixed(1))+' '+safe(cats[thisTab])+'</div>'+
     '<div class="meta">'+safe(p.sampleGames)+' historical games • '+(p.starterVerified?'starter verified':'starter not yet confirmed')+
     ' • '+safe(p.sampleSource||'historical data')+'</div>'+
     '<div class="refresh">AI research projection — not a sportsbook line</div></div>').join(''):
     '<div class="msg">Pregame Top 10 unavailable: '+safe((pre.readinessBlockers||[]).join(', ')||pre.reason||'Current player projections have not been collected')+'. Game schedule is available, but player forecasts are not verified yet.</div>';
   }catch{
    if(thisTab===tab&&stamp===token)qs('#nbaTopBoard').innerHTML='<div class="msg">Pregame projection feed unavailable. Game results will appear after tipoff.</div>';
   }
   return;
  }
  const games=(data?.games||[]).filter(g=>['LIVE','FINAL'].includes(g.status)).slice(0,16);
  if(!games.length){qs('#nbaTopBoard').innerHTML='<div class="msg">No completed or live NBA box scores on this date. Pregame projected Top 10 rankings are not yet published.</div>';return}
  const available=[];
  // Bound fanout and keep ESPN summary calls out of automatic page load.
  for(let i=0;i<games.length;i+=3){
   const settled=await Promise.allSettled(games.slice(i,i+3).map(g=>detail(g.gameId)));
   for(const x of settled)if(x.status==='fulfilled')available.push(...(x.value.players||[]));
   if(thisTab!==tab||stamp!==token)return;
  }
  const rows=available.filter(x=>Number.isFinite(x[thisTab])&&x[thisTab]!==null)
   .sort((a,b)=>b[thisTab]-a[thisTab]).slice(0,10);
  qs('#nbaTopBoard').innerHTML=rows.length?rows.map((p,i)=>
   '<div class="nflMarketLine"><b>#'+(i+1)+' '+safe(p.name)+'</b> <span class="meta">'+safe(p.team)+'</span>'+
   '<div class="pick">'+safe(p[thisTab])+' '+safe(cats[thisTab])+'</div>'+
   '<div class="refresh">Observed box-score result, not a projected betting line</div></div>').join(''):
   '<div class="msg">No source-verified '+safe(cats[thisTab])+' results are available for these games yet.</div>';
 }
 async function loadCoverage(date,slateRef){
  try{
   const coverage=await json('/api/nba-coverage?date='+encodeURIComponent(date));
   if(data!==slateRef||qs('#nbaDate')?.value!==date)return;
   const lookup=new Map((coverage.games||[]).map(g=>[g.gameId,g]));
   // Read-only status, never copy inferred lines or unofficial odds.
   data.games=data.games.map(g=>({...g,coverage:lookup.get(g.gameId)||null}));
   renderGames();
  }catch{
   // Coverage is optional: never hide the working ESPN game slate because
   // Vercel Blob or a second scoreboard request failed.
  }
 }
 async function load(){
  if(loading)return;
  loading=true;selected=null;++token;
  qs('#nbaDetail').style.display='none';qs('#nbaHome').style.display='block';
  const date=qs('#nbaDate').value;
  qs('#nbaFresh').textContent='Loading NBA games…';
  try{
   data=await json('/api/nba-slate?date='+encodeURIComponent(date));
   qs('#nbaFresh').textContent=data.games.length+' games • ESPN checked '+new Date(data.fetchedAt).toLocaleTimeString()+' • BDL Free: '+(data.ballDontLieFree?.state||'PENDING')+(data.ballDontLieFree?.gameCrosscheck?' ('+data.ballDontLieFree.gameCrosscheck.matched+'/'+data.ballDontLieFree.gameCrosscheck.checked+' ESPN matchups cross-checked)':'')+' • refresh on demand';
   renderGames();
   // Independently load a per-game readiness diagnostic in the background;
   // the normal slate and selected game view remain available immediately.
   void loadCoverage(date,data);
   await renderLeaders();
  }catch{
   data=null;qs('#nbaFresh').textContent='NBA source temporarily unavailable';
   qs('#nbaBoard').innerHTML='<div class="msg">ESPN NBA schedule could not be verified. Please try Refresh NBA.</div>';
   qs('#nbaTopBoard').textContent='No unverified NBA data will be displayed.';
  }finally{loading=false}
 }
 function switchTab(next){
  if(!['gameday','points','rebounds','assists','threes','pra','sgp','edgehunter'].includes(next))return;
  tab=next;++token;
  document.querySelectorAll('[data-nbatab]').forEach(b=>b.classList.toggle('active',b.dataset.nbatab===tab));
  selected=null;qs('#nbaDetail').style.display='none';qs('#nbaHome').style.display='block';
  renderLeaders().catch(()=>{qs('#nbaTopBoard').textContent='Statistics are temporarily unavailable.'});
 }
 function init(){
  if(!qs('#nbaDate'))return;
  qs('#nbaDate').value=dateET();
  qs('#nbaReload').addEventListener('click',load);
  qs('#nbaDate').addEventListener('change',load);
  qs('#nbaBack').addEventListener('click',()=>{selected=null;++token;qs('#nbaDetail').style.display='none';qs('#nbaHome').style.display='block'});
  document.querySelectorAll('[data-nbatab]').forEach(b=>b.addEventListener('click',()=>switchTab(b.dataset.nbatab)));
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
 window.momentumNbaOpen=()=>{if(!data&&!loading)load();};
})();
