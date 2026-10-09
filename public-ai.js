// Momentum Radar AI explanation panel. Never silently edits model selections.
(() => {
 const ready=()=>{
  const root=document.getElementById('nfl');if(!root||document.getElementById('momentumAiPanel'))return;
  const panel=document.createElement('section');panel.id='momentumAiPanel';panel.className='panel';
  panel.innerHTML='<h3 style="margin:0 0 8px;color:#4df0a2">Momentum Radar AI <small style="font-size:11px;color:#9ee7ff">Beta</small></h3><p class="note">AI explains existing model data; it does not verify injuries, set probabilities, or change picks.</p><select id="momentumAiMode" style="padding:10px;background:#14222e;color:#fff;border:1px solid #31586d;border-radius:8px"><option value="matchup">Matchup analysis</option><option value="injury">Injury / lineup impact</option><option value="parlay">SGP review</option><option value="results">Results review</option></select> <button id="momentumAiRun" class="analysis" style="width:auto">Analyze selected game</button><div id="momentumAiOutput" class="msg" style="margin-top:10px;white-space:pre-wrap" aria-live="polite">Select an NFL game, then request AI analysis.</div>';
  root.prepend(panel);
  document.getElementById('momentumAiRun').onclick=async()=>{
   const out=document.getElementById('momentumAiOutput'),button=document.getElementById('momentumAiRun');
   const selected=typeof nflSelected!=='undefined'?nflSelected:null;
   const gameId=String(selected?.gameId||selected?.id||'');
   if(!gameId){out.textContent='Choose an NFL game first.';return}
   const game=(typeof nflData!=='undefined'?nflData?.games:[])?.find(g=>String(g.gameId||g.id)===gameId);
   if(!game){out.textContent='Selected game data is unavailable. Refresh the NFL feed.';return}
   button.disabled=true;out.textContent='Loading current game data…';
   let markets=null;try{markets=await getNFLMarkets(gameId)}catch{}
   if(!markets?.categories){out.textContent='Current player markets are unavailable. AI analysis is paused rather than using incomplete game data.';button.disabled=false;return}
   const categories={};for(const cat of ['td','passing','rushing','receiving','receptions'])categories[cat]=(markets?.categories?.[cat]||[]).slice(0,3).map(p=>({name:p.name,team:p.team,modelProjection:p.edgeAnalytics?.modelProjection,modelRating:p.momentumScore,sportsbookLine:p.edgeAnalytics?.sportsbookLine,book:p.bestBook?.book,odds:p.bestBook?.odds}));
   const sgps=markets?.sgps?.Analytics||markets?.sgps?.DraftKings||markets?.sgps?.FanDuel||[];
   const data={gameId,game:{home:game.home?.name,away:game.away?.name,kickoff:game.kickoff,readiness:game.readiness,marketFeed:game.marketFeed},categories,sgps:sgps.slice(0,3).map(s=>({risk:s.risk,legs:(s.legs||[]).slice(0,7).map(l=>({name:l.name,cat:l.cat,threshold:l.threshold})),payoutTarget:s.payoutTarget})),note:'Absent fields are unavailable, not zero. Sportsbook odds and injury statuses require independent verification.'};
   out.textContent='Analyzing available application data…';
   try{
    const response=await fetch('/api/ai-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:document.getElementById('momentumAiMode').value,data})});
    const result=await response.json();
    out.textContent=result.ok?result.analysis:'AI unavailable: '+(result.error||'unknown_error')+'. Existing projections are unchanged.';
   }catch{out.textContent='AI connection failed. Existing projections are unchanged.'}
   finally{button.disabled=false}
  };
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();
