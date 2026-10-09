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
   const gameId=String(selected?.gameId||'');
   if(!gameId){out.textContent='Choose an NFL game first.';return}
   const game=(typeof nflData!=='undefined'?nflData?.games:[])?.find(g=>String(g.gameId)===gameId);
   if(!game){out.textContent='Selected game data is unavailable. Refresh the NFL feed.';return}
   const data={gameId,game:{home:game.home,away:game.away,kickoff:game.kickoff,injuries:(game.injuries||[]).slice(0,12),picks:(game.picks||[]).slice(0,12),sgps:(game.sgps||[]).slice(0,3),dvp:game.dvp||null},selected:{gameId}};
   button.disabled=true;out.textContent='Analyzing available application data…';
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
