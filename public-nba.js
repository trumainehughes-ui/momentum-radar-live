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
    '<div class="name">'+safe(g.away.abbr)+' @ '+safe(g.home.abbr)+safe(result)+'</div>'+
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
 function sportsbookGuard(d){
  const g=d?.sportsbookAiGuard,
   current=d?.status==='SCHEDULED'&&
    d?.pregameReadiness?.freshness==='CURRENT'&&
    String(g?.gameId||'')===String(d?.gameId||'')&&
    g?.league==='nba';
  if(!current)return '<div class="note"><b>Sportsbook Scout:</b> No fresh NBA bookmaker market audit available. Individual props and combined SGP odds are unverified.</div>';
  const failures=(g.flags||[]).slice(0,2)
   .map(f=>safe(f.detail||f.code)).join('; ');
  return '<div class="note"><b>AI Sportsbook Scout • NBA:</b> '+safe(g.status||'PENDING')+
   ' • DraftKings / FanDuel market check pending.'+
   (failures?' '+failures:'')+
   ' No AI-generated bookmaker prices or replacement legs. Combined SGP payout NOT VERIFIED.</div>';
 }
 function sgpRebuildStatus(d){
  const r=d?.sgpRebuildReport,valid=d?.status==='SCHEDULED'&&
   d?.pregameReadiness?.freshness==='CURRENT'&&r?.league==='nba'&&
   String(r.gameId||'')===String(d.gameId||'');
  if(!valid)return '<div class="note">NBA SGP rebuild • awaiting current game snapshot and sportsbook markets.</div>';
  const summary=(r.tiers||[]).slice(0,3).map(t=>
   safe(t.risk)+': '+(t.books||[]).slice(0,2)
    .map(b=>safe(b.book)+' '+(b.bookListedLegsVerified?'individual markets listed':'lines pending'))
    .join(' • ')).join(' | ');
  return '<div class="note"><b>NBA SGP rebuild:</b> '+summary+
   '<div class="refresh">Sportsbook prop lines and correlated combined odds remain unverified. The current NBA model alone cannot confirm target payouts.</div></div>';
 }
 function sgpAiNextSteps(d){
  const plan=d?.sgpAiPlan,match=d?.status==='SCHEDULED'&&
   d?.pregameReadiness?.freshness==='CURRENT'&&
   plan?.league==='nba'&&String(plan?.gameId||'')===String(d?.gameId||'');
  if(!match)return '<div class="note">AI Parlay Architect: NBA bookmaker market data pending. No priced or bookable Same Game Parlay is confirmed.</div>';
  const rows=(plan.tiers||[]).slice(0,3).map(t=>{
   const books=(t.bookActions||[]).filter(a=>['DraftKings','FanDuel'].includes(a.book))
    .slice(0,2).map(a=>safe(a.book)+': '+safe(String(a.action||'CHECK_DATA').replaceAll('_',' ').toLowerCase()));
   return '<div class="note"><b>'+safe(t.risk)+' SGP:</b> '+books.join(' • ')+'</div>';
  }).join('');
  return '<div class="note"><b>AI Parlay Architect • next checks:</b>'+
   rows+'<div class="refresh">Model candidates only. Actual bookmaker player markets and combined payout remain unverified.</div></div>';
 }
 function nbaPublicSportsbookPanel(){
  return '<div class="note" style="margin-top:10px"><b>Read public DraftKings / FanDuel player odds</b>'+
   '<div class="refresh">Published sportsbook page inspection only. Observations cannot be matched to this NBA game without verified roster, event and market evidence.</div>'+
   '<input id="nbaBookPageUrl" type="url" placeholder="Official NBA bookmaker public props URL" style="width:75%;min-width:170px">'+
   '<button type="button" id="nbaPublicOddsRead">Read public odds</button>'+
   '<div class="refresh"><a href="https://sportsbook.draftkings.com/page/nba-player-props" target="_blank" rel="noopener noreferrer">DraftKings NBA props page</a></div>'+
   '<div id="nbaPublicOddsReadout">Publicly visible odds may be partial. No combined SGP price verified.</div></div>';
 }
 async function nbaAutomaticBookResearch(gameId){
  const output=qs('#nbaPublicOddsReadout');
  if(!output)return;
  output.textContent='Automatically checking both official sportsbooks for this verified ESPN matchup…';
  try{
   const resp=await fetch('/api/sportsbook-public-game?league=nba&gameId='+
    encodeURIComponent(gameId),{cache:'no-store',credentials:'omit'});
   const report=await resp.json();
   if(selected!==gameId||!output.isConnected)return;
   if(!resp.ok||!report.ok){
    output.textContent='Automatic public-page check not available: '+
     String(report.status||report.error||'UNAVAILABLE')+
     '. No NBA sportsbook price was inferred.';
    return;
   }
   const rows=(report.pages||[]).map(p=>'<div>'+
    safe(p.book)+' • '+safe(p.label)+' • '+safe(p.status)+
    ' • '+safe(p.quotedSelectionCount||0)+' publicly observed player prices</div>').join('');
   output.innerHTML='<b>Both-book automatic research:</b> '+rows+
    '<div class="refresh">These publicly observed team-page prices might belong to another matchup and have no authenticated event/timestamp. NBA parlays stay model-only until current sportsbook market and combined price are separately verified.</div>';
  }catch{
   if(selected===gameId)output.textContent='Automatic sportsbook page check blocked or unavailable. No NBA price inferred.';
  }
 }
 function bindNbaPublicOdds(gameId){
  const button=qs('#nbaPublicOddsRead'),input=qs('#nbaBookPageUrl');
  if(!button||!input)return;
  button.onclick=async()=>{
   const out=qs('#nbaPublicOddsReadout'),entered=String(input.value||'').trim();
   if(!entered||!out)return;
   out.textContent='Checking the official public sportsbook page…';
   button.disabled=true;
   try{
    const r=await fetch('/api/sportsbook-public-odds?url='+encodeURIComponent(entered),
     {cache:'no-store',credentials:'omit'});
    const report=await r.json();
    if(selected!==gameId)return;
    if(!r.ok||!report.ok){
     out.textContent='Cannot reliably read this public page: '+
      String(report.status||report.error||'UNAVAILABLE');
     return;
    }
    const rows=(report.quotes||[]).slice(0,20).map(x=>
     '<div>'+safe(x.player)+' • '+safe(x.market)+' '+
      safe(x.rawLine)+' • '+safe(x.americanOdds)+'</div>').join('');
    out.innerHTML='<b>'+safe(report.book)+' research:</b> '+
     safe((report.quotes||[]).length)+' publicly observed selections.'+
     (rows||' No reliably paired player prices in this page.')+
     '<div class="refresh">UNMATCHED SOURCE ONLY — never inserted into an NBA SGP or counted as combined odds.</div>';
   }catch{
    if(selected===gameId)out.textContent='Page check unavailable; no odds inferred.';
   }finally{if(selected===gameId)button.disabled=false}
  };
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
  return source+sportsbookGuard(d)+sgpAiNextSteps(d)+sgpRebuildStatus(d)+rows.map(s=>{
   const ready=s.status==='MODEL_CANDIDATE'&&Array.isArray(s.legs)&&s.legs.length>0;
   const list=ready?s.legs.map((l,i)=>
    '<div class="nflMarketLine"><b>'+(i+1)+'. '+safe(l.name)+' • '+safe(l.team)+'</b>'+
    '<div class="meta">'+safe(l.threshold)+'+ '+safe(l.category)+' • historical mean '+safe(l.projection)+
    ' • '+safe(l.sampleGames)+' completed games</div></div>').join(''):'';
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
   '<div class="name">'+safe(game.away.name||game.away.abbr)+' @ '+safe(game.home.name||game.home.abbr)+'</div>'+
   '<div class="meta">'+safe(time(game.kickoff))+'</div></div>';
  qs('#nbaPlayers').innerHTML='<div class="msg">Retrieving ESPN game box score…</div>';
  qs('#nbaInjuries').textContent='Checking available ESPN injury evidence…';
  qs('#nbaSgps').textContent='Checking SGP readiness…';
  const request=++token;
  try{
   const d=await detail(id);if(request!==token||selected!==id)return;
   qs('#nbaSgps').innerHTML=sgps(d)+nbaPublicSportsbookPanel();
   bindNbaPublicOdds(id);
   void nbaAutomaticBookResearch(id);
   renderInjuries(d);
   if(!d.players?.length){
    qs('#nbaPlayers').innerHTML='<div class="msg">'+
     (d.status==='SCHEDULED'?'Game has not started. See the separate SGP section for any current model-only historical candidates; player box-score RESULTS will appear after tip-off.':'No verified player box-score statistics yet.')+
     '</div>';return;
   }
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
  if(tab==='sgp'){
   qs('#nbaTopTitle').textContent='NBA Same Game Parlays';
   qs('#nbaTopBoard').innerHTML='<div class="note"><b>Small • Medium • Nuke</b><br>'+
    'NBA SGPs require verified pregame player averages/projections, injury and rotation clearance, available alternate props, and sportsbook-quoted combined odds. Select a game to review the readiness status. No fictional prices or picks will be shown.</div>';
   return;
  }
  const thisTab=tab,stamp=token;
  qs('#nbaTopTitle').textContent='Top 10 — '+(cats[tab]||'NBA')+' (game results)';
  qs('#nbaTopBoard').innerHTML='<div class="msg">Checking completed and live game box scores…</div>';
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
  if(!['gameday','points','rebounds','assists','threes','pra','sgp'].includes(next))return;
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
