// Display a compact, read-only matchup research panel for an already selected game.
// No ESPN IDs or date inputs are exposed to customers.
(function(root){
 const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 function render(box,rows){
  if(!box)return;
  const verified=(rows||[]).filter(r=>r?.comparison?.ok&&r.sampleQuality!=='insufficient');
  box.innerHTML='<div class="rank">Player vs. opposing defense — historical evidence</div>'+
   (verified.length?verified.map(r=>'<div class="nflMarketLine"><b>'+esc(r.playerName)+' • '+esc(r.statLabel)+'</b>'+
    '<div class="meta">Player average: '+esc(r.comparison.playerAverage)+' ('+esc(r.comparison.playerGames)+' games) • Opponent allowance: '+esc(r.comparison.defenseAllowed)+' ('+esc(r.comparison.defenseGames)+' games)</div>'+
    '<div class="note">'+(r.sampleQuality==='limited'?'Limited sample • ':'')+'Historical comparison only; not a projection or sportsbook line.</div></div>').join(''):
    '<div class="note">No independent historical player-versus-defense comparison is available for this game yet. No advantage or probability is being inferred.</div>');
 }
 root.momentumAutomaticMatchupResearch={render};
})(window);
