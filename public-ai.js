// Evidence-bound Momentum Radar AI. Read-only: never edits projections or bet slips.
(() => {
 const CATS=['td','passing','rushing','receiving','receptions'];
 const POS={QB:['passYards','rushYards','passTD'],RB:['rushYards','recYards','receptions'],WR:['recYards','receptions','targets'],TE:['recYards','receptions','targets']};
 const RISKS=['Small','Medium','Nuke'];
 const number=x=>x===null||x===undefined||x===''?null:(Number.isFinite(Number(x))?Number(x):null);
 const compact=(v,n=160)=>v==null?null:String(v).slice(0,n);
 const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
 async function getJson(url){
  const r=await fetch(url,{cache:'no-store'});if(r.ok===false)return null;
  const d=await r.json();return d?.ok===true?d:null;
 }
 function matchups(d,g){
  if(!d?.ok||!Number(d.completedGames)||!g.home?.abbr||!g.away?.abbr)return null;
  if(Number(d.season)!==new Date(g.kickoff).getUTCFullYear()||Number(d.week)!==Number(g.week||1))return null;
  const sides=[[g.away.abbr,g.home.abbr],[g.home.abbr,g.away.abbr]].map(([off,def])=>{
   const positions=[];
   for(const [position,metrics] of Object.entries(POS)){
    const values=[];
    for(const metric of metrics){
     const allowed=d.defense?.[def]?.[position]?.[metric],produced=d.offense?.[off]?.[position]?.[metric];
     const rankMost=number(d.defenseRanks?.[position]?.[def]?.[metric]?.rankMost);
     const offenseRankMost=number(d.offenseRanks?.[position]?.[off]?.[metric]?.rankMost);
     if(allowed==null&&produced==null&&rankMost==null)continue;
     values.push({metric,defenseAllowedPerGame:number(allowed),defenseRankMost:rankMost,offenseProducedPerGame:number(produced),offenseRankMost});
    }
    if(values.length)positions.push({position,metrics:values});
   }
   return{offense:off,opponentDefense:def,positions};
  });
  return{source:'ESPN completed-game box scores (position splits); NFL.com totals reference',season:d.season,week:d.week,completedGames:number(d.completedGames),generatedAt:compact(d.generatedAt),rankDirection:'rankMost 1 = most yards/count allowed (favorable for opposing offensive production)',sides};
 }
 function roster(d,id){
  if(!d?.ok||String(d.gameId||'')!==id)return null;
  return{source:compact(d.source),fetchedAt:compact(d.fetchedAt),injuries:(d.injuries||[]).slice(0,20).map(x=>({name:x.name,team:x.team,position:x.position,status:x.status,injury:x.injury,source:x.source})),blocked:(d.blockers||[]).slice(0,20).map(x=>({name:x.name,team:x.team,status:x.status,source:x.source})),roles:(d.roleSignals||[]).slice(0,20).map(x=>({name:x.name,team:x.team,status:x.status,source:x.source,checkedAt:x.checkedAt})),players:(d.playerProjections||[]).filter(p=>['QB','RB','WR','TE'].includes(p.position)).slice(0,20).map(p=>({name:p.name,team:p.team,position:p.position,availability:p.availability,starterStatus:p.starterStatus,starterVerified:!!p.starterVerified,roleEvidence:p.verification?.role?.source||null})),roleVerificationRequired:true};
 }
 function player(x){
  return{name:x.name,team:x.team,position:x.position,projection:number(x.edgeAnalytics?.modelProjection??x.predictiveProjection??x.projection),perGame:number(x.perGame),modelScore:number(x.momentumScore),confidence:number(x.confidence),estimatedRushingPercent:number(x.rushingChance?.estimatedPercent),gamesPlayed:number(x.gamesPlayed),matchup:x.matchup?{opponent:x.matchup.opponent,position:x.matchup.position,metric:x.matchup.metric,rankMost:number(x.matchup.rankMost),allowedPerGame:number(x.matchup.allowedPerGame),label:x.matchup.label}:null,book:x.bestBook?.book||null,marketLine:number(x.edgeAnalytics?.sportsbookLine??x.bestBook?.line),bookOdds:number(x.bestBook?.odds),recentHitRates:x.recentHitRates||null};
 }
 function leg(x){return{name:x.name,team:x.team,category:x.cat||x.category,projection:number(x.projection),modelThreshold:x.analyticsThreshold??x.threshold??null,bookLine:number(x.bookOffer?.line),bookOdds:number(x.bookOffer?.odds),sportsbookVerified:x.sportsbookVerified===true};}
 function packSgps(m){
  const result=[];for(const source of ['Analytics','DraftKings','FanDuel'])for(const risk of RISKS){
   const s=(m?.sgps?.[source]||[]).find(x=>x.risk===risk);
   if(!s)continue;
   result.push({source,risk,book:s.book||null,payoutTarget:s.payoutTarget||null,estimatedOdds:number(s.estimatedOdds),actualSgpOdds:number(s.actualSgpOdds),payoutBandVerified:s.payoutBandVerified===true,bookVerificationPending:s.bookVerificationPending===true,sourcePolicy:s.sourcePolicy?.rule||null,legs:(s.legs||[]).slice(0,10).map(leg)});
  }return result;
 }
 const ready=()=>{
  const root=document.getElementById('nfl');if(!root||document.getElementById('momentumAiPanel'))return;
  const panel=document.createElement('section');panel.id='momentumAiPanel';panel.className='panel';
  panel.innerHTML='<h3 style="margin:0 0 8px;color:#4df0a2">Momentum Radar AI <small style="font-size:11px;color:#9ee7ff">Beta</small></h3><p class="note">AI explains model projections alongside available NFL injury, roster, offense-vs-defense and sportsbook evidence. Unverified fields stay labeled.</p><select id="momentumAiMode" style="padding:10px;background:#14222e;color:#fff;border:1px solid #31586d;border-radius:8px"><option value="matchup">Matchup analysis</option><option value="injury">Injury / lineup impact</option><option value="parlay">SGP review</option><option value="results">Results review</option></select> <button id="momentumAiRun" class="analysis" style="width:auto">Analyze selected game</button><div id="momentumAiOutput" class="msg" style="margin-top:10px;white-space:pre-wrap" aria-live="polite">Select an NFL game, then request AI analysis.</div>';
  root.prepend(panel);
  document.getElementById('momentumAiRun').onclick=async()=>{
   const out=document.getElementById('momentumAiOutput'),button=document.getElementById('momentumAiRun');
   if(button.disabled)return;
   const selected=typeof nflSelected!=='undefined'?nflSelected:null;
   const gameId=String(selected?.gameId||selected?.id||'');
   if(!gameId){out.textContent='Choose an NFL game first.';return}
   const game=(typeof nflData!=='undefined'?nflData?.games:[])?.find(g=>String(g.gameId||g.id)===gameId);
   if(!game){out.textContent='Selected game data is unavailable. Refresh the NFL feed.';return}
   button.disabled=true;out.textContent='Loading projections, roster status and defensive matchups…';
   try {
    const season=new Date(game.kickoff).getUTCFullYear(),week=Number(game.week||1);
    const teamCodes=[game.away?.abbr,game.home?.abbr].filter(Boolean);
    const requests=[
     getNFLMarkets(gameId).catch(()=>null),
     getJson('/api/nfl-game?gameId='+encodeURIComponent(gameId)).catch(()=>null),
     teamCodes.length===2?getJson('/api/nfl-dvp?'+new URLSearchParams({season:String(season),week:String(week),teams:teamCodes.join(',')})).catch(()=>null):Promise.resolve(null)
    ];
    const [m,g,d]=await Promise.all(requests);
    const defensive=matchups(d,game),availability=roster(g,gameId);
    if(!m?.categories&&!defensive&&!availability){out.textContent='Matchup, player, and market sources are currently unavailable. Existing picks remain unchanged.';return}
    const categories={};for(const cat of CATS)categories[cat]=(m?.categories?.[cat]||[]).slice(0,4).map(player);
    const sources={model:m?.categories?'available':'unavailable',sportsbook:m?.validation?.sportsbookVerificationAvailable===true&&!m.stale?'market evidence present; independently verify book prices':'not verified or currently unavailable',roster:availability?'ESPN current-game cross-check':'unavailable',defense:defensive?'ESPN completed-game box-score splits':'unavailable'};
    const data={
     gameId,game:{home:game.home?.name,homeAbbr:game.home?.abbr,away:game.away?.name,awayAbbr:game.away?.abbr,kickoff:game.kickoff,status:game.status,week:game.week},
     sources,model:{fetchedAt:compact(m?.fetchedAt),stale:m?.stale===true,degraded:m?.degraded===true,analyticsAvailable:m?.analyticsAvailable===true,validation:m?.validation?{injuryEligibilityChecked:m.validation.injuryEligibilityChecked,starterRoleRequired:m.validation.sgpChecks?.starterRoleRequired,sportsbookVerificationAvailable:m.validation.sportsbookVerificationAvailable}:null},
     categories,matchup:defensive,playerAvailability:availability,sgps:packSgps(m),
     instruction:'Explain only evidence actually available. Missing odds must not be called verified; model SGP payout targets are not sportsbook payouts. Defense rankMost 1 means most allowed, not strongest defense. Injury absence is not confirmed health; roster membership does not prove starting.'
    };
    out.textContent='Analyzing available evidence…';
    const response=await fetch('/api/ai-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode:document.getElementById('momentumAiMode').value,data})});
    const result=await response.json();
    out.textContent=result.ok?String(result.analysis||'').replace(/\*\*/g,'').replace(/^#{1,6}\s*/gm,''):'AI unavailable: '+(result.error||'unknown_error')+'. Existing projections are unchanged.';
   }catch{out.textContent='AI connection failed. Existing projections are unchanged.'}
   finally{button.disabled=false}
  };
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();