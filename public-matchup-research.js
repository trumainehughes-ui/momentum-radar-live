// Customer-facing research view. Uses the actual matchup endpoint; never invents data.
(function(){
 const options={NBA:[['points','Points'],['rebounds','Rebounds'],['assists','Assists']],
 NFL:[['passingYards','Passing yards'],['rushingYards','Rushing yards'],['receivingYards','Receiving yards']],
 MLB:[['hits','Hits'],['homeRuns','Home runs']]};
 const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 for(const league of Object.keys(options)){
  const host=document.getElementById(league.toLowerCase());if(!host)continue;
  const section=document.createElement('section');section.className='panel';section.dataset.researchLeague=league;
  section.innerHTML='<h3>Player vs. Opponent — Historical Research</h3><p class="note">Compare verified player averages with opponent defensive allowances. Enter ESPN player and opponent team IDs and up to four historical dates. Research only; no sportsbook lines or betting probabilities.</p>'+
  '<form class="matchupResearchForm" style="display:flex;flex-wrap:wrap;gap:8px;align-items:center">'+
  '<input aria-label="ESPN player ID" name="playerId" placeholder="ESPN player ID" inputmode="numeric" required pattern="[0-9]+">'+
  '<input aria-label="ESPN opponent team ID" name="opponentId" placeholder="Opponent team ID" inputmode="numeric" required pattern="[0-9]+">'+
  '<select aria-label="Stat category" name="stat">'+options[league].map(([v,label])=>'<option value="'+v+'">'+label+'</option>').join('')+'</select>'+
  '<input aria-label="Historical dates" name="dates" placeholder="Dates: YYYYMMDD,YYYYMMDD" required>'+
  '<button type="submit">Compare</button></form><div class="matchupResearchResult note" aria-live="polite">Enter identifiers and dates to load real matchup evidence.</div>';
  host.insertBefore(section,host.firstChild);
  const form=section.querySelector('form'),output=section.querySelector('.matchupResearchResult');
  form.addEventListener('submit',async event=>{
   event.preventDefault();const data=new FormData(form);
   const params=new URLSearchParams({league,playerId:String(data.get('playerId')||''),
    opponentId:String(data.get('opponentId')||''),stat:String(data.get('stat')||''),
    dates:String(data.get('dates')||'').replace(/\s+/g,'')});
   output.textContent='Checking completed games and player statistics…';
   try{
    const response=await fetch('/api/matchup-research?'+params,{signal:AbortSignal.timeout(25000)});
    const result=await response.json();
    if(!response.ok||!result.ok)throw Error(result.error||'Research unavailable');
    if(!result.comparison?.ok){output.textContent='Insufficient completed-game evidence for this player, opponent and date selection. '+result.gamesExamined+' games examined.';return;}
    const c=result.comparison;
    output.innerHTML='<strong>'+esc(form.elements.stat.selectedOptions[0].textContent)+'</strong>: player average <strong>'+esc(c.playerAverage)+'</strong> ('+esc(c.playerGames)+' games); opposing defense allows <strong>'+esc(c.defenseAllowed)+'</strong> ('+esc(c.defenseGames)+' games). Historical difference: <strong>'+esc(c.delta>0?'+':'')+esc(c.delta)+'</strong>. <span class="note">Not a player projection or sportsbook offer. '+esc(result.gamesExamined)+' games examined.</span>';
   }catch(e){output.textContent='Matchup research unavailable: '+String(e.message||'unknown');}
  });
 }
})();
