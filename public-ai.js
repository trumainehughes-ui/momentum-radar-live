// Evidence-bound Momentum Radar AI. Read-only: never edits projections or bet slips.
(() => {
 const CATS=['td','passing','rushing','receiving','receptions'];
 const POS={QB:['passYards','rushYards','passTD'],RB:['rushYards','recYards','receptions'],WR:['recYards','receptions','targets'],TE:['recYards','receptions','targets']};
 const RISKS=['Small','Medium','Nuke'];
 // Keep provider prompts bounded; the detailed app data still stays in the ordinary NFL tabs.
 const FOCUS={QB:['passYards','rushYards'],RB:['rushYards','recYards'],WR:['recYards','receptions'],TE:['recYards']};
 let aiCooldownUntil=0;
 let analysisEpoch=0,lastCompletedKey='',analyzingKey='';
 function conciseMatchup(m){
  if(!m)return null;
  return {...m,statUnit:'TEAM_POSITION_GROUP_PER_GAME (not individual player averages)',sides:(m.sides||[]).map(s=>({...s,positions:(s.positions||[]).map(p=>({...p,positionGroup:p.position,groupScope:'combined production by '+p.position+' players; never attribute as individual average',metrics:(p.metrics||[]).filter(x=>(FOCUS[p.position]||[]).includes(x.metric)).map(x=>({...x,statScope:p.position+' position group, per game',metricLabel:p.position+' '+(x.metric==='passYards'?'passing yards':x.metric==='rushYards'?'rushing yards':x.metric==='recYards'?'receiving yards':x.metric==='receptions'?'receptions':x.metric)}))})).filter(p=>p.metrics.length)}))};
 }
 function conciseRoster(r,mode){
  if(!r)return null;
  const n=mode==='injury'?15:8;
  const relevant=new Set((r.playerChecks||[]).slice(0,n).map(x=>norm(x.name)));
  const priority=x=>(relevant.has(norm(x.name))?100:0)+(['QB','RB','WR','TE'].includes(x.position)?50:0)+(['OUT','IR'].includes(x.status)?20:0)+(x.status==='QUESTIONABLE'||x.status==='DOUBTFUL'?10:0);
  const injuries=(r.injuries||[]).filter(x=>relevant.has(norm(x.name))||['OUT','IR','DOUBTFUL','QUESTIONABLE'].includes(x.status)).sort((a,b)=>priority(b)-priority(a)).slice(0,mode==='injury'?15:8);
  const skillPositionAlerts=injuries.filter(x=>['QB','RB','WR','TE'].includes(x.position)&&['OUT','IR','DOUBTFUL','QUESTIONABLE'].includes(x.status)).map(x=>({name:x.name,team:x.team,position:x.position,status:x.status,source:x.source}));
  return {source:r.source,fetchedAt:r.fetchedAt,reportedInjuryEntries:r.injuries?.length||0,injuries,skillPositionAlerts,blocked:(r.blocked||[]).slice(0,4),roles:(r.roles||[]).slice(0,mode==='injury'?8:4),playerChecks:(r.playerChecks||[]).slice(0,n),roleVerificationRequired:true,officialInactivesVerified:false};
 }
 function dataOnlySummary(mode,d,reason){
  const out=['AI explanation temporarily unavailable ('+reason+').','Data-only summary from available application feeds (not AI-generated):'];
  const m=d.matchup;
  if(m?.sides?.length){
   for(const side of m.sides.slice(0,2)){
    const qb=(side.positions||[]).find(x=>x.position==='QB')?.metrics?.find(x=>x.metric==='passYards');
    const rb=(side.positions||[]).find(x=>x.position==='RB')?.metrics?.find(x=>x.metric==='rushYards');
    const sample=side.defenseSampleGames;
    const sampleText=sample==null?'unverified sample':sample+' defensive games'+(sample<5?' (limited sample)':'');
    const describe=(x,label)=>x&&x.defenseAllowedPerGame!=null?label+' '+x.defenseAllowedPerGame+' allowed/game'+(x.defenseRankMost!=null?' (rank #'+x.defenseRankMost+' most allowed)':''):null;
    const measures=[describe(qb,'QB passing'),describe(rb,'RB rushing')].filter(Boolean);
    out.push(side.offense+' vs '+side.opponentDefense+' defense: '+sampleText+(measures.length?' • '+measures.join(' • '):''));
   }
  }
  if(mode==='research'){
   const q=d.research?.queue||[];
   out.push('Player & market research queue — suggested lookups only, NOT verified sportsbook prices:');
   for(const p of q.slice(0,6))out.push(p.player+' ('+p.team+') '+p.market+' — '+p.issues.join(', ')+'. DraftKings lookup: '+p.lookups.draftKings+'. FanDuel lookup: '+p.lookups.fanDuel+'.');
  }else if(mode==='parlay'){
   for(const s of (d.sgps||[]).filter(x=>x.source==='Analytics').slice(0,3)){
    out.push(s.risk+' model: '+s.legs.map(x=>x.name+' '+(x.modelThreshold??'threshold pending')).join('; ')+(s.combinedBookQuoteVerified===true?' • bookmaker-issued combined quote verified':' • model candidate; combined sportsbook quote unverified'));
   }
  }else{
   const selected=['passing','rushing','receiving'].flatMap(cat=>(d.categories?.[cat]||[]).slice(0,1).map(p=>p.name+' '+p.projection+' projected '+cat+' yards'));
   if(selected.length)out.push('Model projections: '+selected.join('; ')+'.');
  }
  const injuryAlerts=d.playerAvailability?.skillPositionAlerts||[];
  if(injuryAlerts.length)out.push('ESPN-reported injury statuses (not official game-day inactives): '+injuryAlerts.slice(0,4).map(x=>x.name+' '+x.team+' '+x.status).join('; ')+'.');
  const problems=d.playerAvailability?.playerChecks?.filter(x=>x.status==='TEAM_MISMATCH'||x.injuryStatus==='OUT'||x.injuryStatus==='IR')||[];
  if(problems.length)out.push('Player verification flags: '+problems.slice(0,3).map(x=>x.name+' ('+(x.injuryStatus||x.status)+')').join('; ')+'.');
  out.push('Official starters, inactives, and current sportsbook prices still require independent verification. Existing picks are unchanged.');
  return out.join('\n\n');
 }
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
   const offenseSampleGames=number(d.offense?.[off]?.games);
   const defenseSampleGames=number(d.defense?.[def]?.games);
   return{offense:off,opponentDefense:def,offenseSampleGames,defenseSampleGames,limitedSample:!defenseSampleGames||defenseSampleGames<5||!offenseSampleGames||offenseSampleGames<5,positions};
  });
  return{source:'ESPN completed-game box scores (position splits); NFL.com totals reference',season:d.season,week:d.week,leagueCompletedGames:number(d.completedGames),sampleInterpretation:'leagueCompletedGames is an NFL-wide total; never describe it as the sample size for either opponent. Each side has its own offenseSampleGames and defenseSampleGames. Samples below five games are limited and must not be called robust.',generatedAt:compact(d.generatedAt),rankDirection:'rankMost 1 = most yards/count allowed (favorable for opposing offensive production)',sides};
 }
 function roster(d,id,candidates=[]){
  if(!d?.ok||String(d.gameId||'')!==id)return null;
  const all=(d.playerProjections||[]).filter(p=>['QB','RB','WR','TE'].includes(p.position));
  const activeGameRoster=new Map(all.map(p=>[norm(p.name),p]));
  const watched=new Map();
  for(const c of candidates){
   if(!c?.name||watched.has(norm(c.name)))continue;
   const match=activeGameRoster.get(norm(c.name)),reportedTeam=norm(c.team),rosterTeam=norm(match?.team);
   const status=!match?'NOT_CONFIRMED_IN_ROSTER_SNAPSHOT':reportedTeam&&reportedTeam!==rosterTeam?'TEAM_MISMATCH':match.starterVerified?'ROLE_EVIDENCE_REPORTED':'ROSTER_MEMBER_STARTER_UNVERIFIED';
   const injury=(d.blockers||[]).find(x=>norm(x.name)===norm(c.name))||(d.injuries||[]).find(x=>norm(x.name)===norm(c.name));
   watched.set(norm(c.name),{name:c.name,playerId:match?.playerId||null,marketTeam:c.team||null,rosterTeam:match?.team||null,position:match?.position||null,status,injuryStatus:injury?.status||null,starterEvidenceSource:match?.verification?.role?.source||null});
   if(watched.size>=30)break;
  }
  const priorities=new Set(watched.keys());
  const players=[...all].sort((a,b)=>Number(priorities.has(norm(b.name)))-Number(priorities.has(norm(a.name)))).slice(0,24);
  return{source:compact(d.source),fetchedAt:compact(d.fetchedAt),injuries:(d.injuries||[]).slice(0,20).map(x=>({name:x.name,team:x.team,position:x.position,status:x.status,injury:x.injury,source:x.source})),blocked:(d.blockers||[]).slice(0,20).map(x=>({name:x.name,team:x.team,status:x.status,source:x.source})),roles:(d.roleSignals||[]).slice(0,20).map(x=>({name:x.name,team:x.team,status:x.status,source:x.source,checkedAt:x.checkedAt})),players:players.map(p=>({name:p.name,playerId:p.playerId,team:p.team,position:p.position,availability:p.availability,starterStatus:p.starterStatus,starterVerified:!!p.starterVerified,roleEvidence:p.verification?.role?.source||null})),playerChecks:[...watched.values()],roleVerificationRequired:true,note:'Not found in the current roster snapshot does not prove ineligible; independent official starter and injury verification is still required.'};
 }
 function player(x){
  return{name:x.name,playerId:x.playerID||x.playerId||null,team:x.team,position:x.position,projection:number(x.edgeAnalytics?.modelProjection??x.predictiveProjection??x.projection),perGame:number(x.perGame),modelScore:number(x.momentumScore),confidence:number(x.confidence),estimatedRushingPercent:number(x.rushingChance?.estimatedPercent),gamesPlayed:number(x.gamesPlayed),matchup:x.matchup?{opponent:x.matchup.opponent,position:x.matchup.position,metric:x.matchup.metric,rankMost:number(x.matchup.rankMost),allowedPerGame:number(x.matchup.allowedPerGame),label:x.matchup.label}:null,book:x.bestBook?.book||null,marketLine:number(x.edgeAnalytics?.sportsbookLine??x.bestBook?.line),bookOdds:number(x.bestBook?.odds),recentHitRates:x.recentHitRates||null};
 }
 function leg(x){return{name:x.name,team:x.team,category:x.cat||x.category,projection:number(x.projection),modelThreshold:x.analyticsThreshold??x.threshold??null,bookLine:number(x.bookOffer?.line),bookOdds:number(x.bookOffer?.odds),sportsbookVerified:x.sportsbookVerified===true};}
 function packSgps(m){
  const result=[];for(const source of ['Analytics','DraftKings','FanDuel'])for(const risk of RISKS){
   const s=(m?.sgps?.[source]||[]).find(x=>x.risk===risk);
   if(!s)continue;
   result.push({source,risk,book:s.book||null,payoutTarget:s.payoutTarget||null,estimatedOdds:number(s.estimatedOdds),actualSgpOdds:number(s.actualSgpOdds),payoutBandVerified:s.payoutBandVerified===true,combinedBookQuoteVerified:s.combinedBookQuoteVerified===true,combinedPriceType:s.combinedPriceType||'not_available',eligibleBookLegs:Number(s.eligibleBookLegs||0),verifiedLegs:Number(s.verifiedLegs||0),bookVerificationPending:s.bookVerificationPending===true,sourcePolicy:s.sourcePolicy?.rule||null,legs:(s.legs||[]).slice(0,10).map(leg)});
  }return result;
 }
 function displayAnalysis(out,value){
  const clean=String(value||'').replace(/\*\*/g,'').replace(/^#{1,6}\s*/gm,'');
  if(typeof out.replaceChildren!=='function'||typeof out.appendChild!=='function'){out.textContent=clean;return}
  out.replaceChildren();
  const lines=clean.split('\n');
  const titles=/^(?:\d+\.\s*)?(?:ESPN injury|injury|workload implications|blocked candidates|role uncertainty|missing verification|sportsbook uncertainties|sportsbook uncertainty|offense.vs.defense|offense vs defense|matchup|player projections|reported injuries|data.only summary|model projections)/i;
  for(const line of lines){
   const n=document.createElement('div');const t=line.trim();
   n.className=!t?'momentumAiSpacer':titles.test(t)&&!/^\d+\.\s+.*\b(?:yards|allowed|averaged|projected)\b/i.test(t)?'momentumAiHeading':'momentumAiText';
   n.textContent=line;out.appendChild(n);
  }
 }
 const ready=()=>{
  const root=document.getElementById('nflAiMount');if(!root||document.getElementById('momentumAiPanel'))return;
  const panel=document.createElement('section');panel.id='momentumAiPanel';panel.className='momentumAiPanel';
  panel.innerHTML='<h3>Momentum Radar AI <small style="font-size:11px;color:#b3edff">Beta</small></h3><p class="momentumAiNote">The analysis follows the game you opened. NFL model data and ESPN injury reports are described separately from sportsbook-verified odds.</p><div id="momentumAiGameName" class="momentumAiGameName" aria-live="polite">Open a matchup to view analysis</div><div class="momentumAiActions"><select id="momentumAiMode" aria-label="Analysis type"><option value="matchup">Matchup analysis</option><option value="injury">Injury / lineup impact</option><option value="parlay">SGP review</option><option value="research">Player &amp; market research</option><option value="results">Results review</option></select><button id="momentumAiRun" type="button">Refresh analysis</button></div><div id="momentumAiOutput" role="status" aria-live="polite">Tap AI Analysis above to analyze this matchup.</div>';
  root.prepend(panel);
  const marketSearchPanel=document.createElement('section');
  marketSearchPanel.id='momentumAiSearchTools';
  marketSearchPanel.hidden=true;
  const researchHeading=document.createElement('p');
  researchHeading.className='momentumAiNote';
  researchHeading.textContent='Search official sportsbook pages for research. Search-index links are not current book odds; open each page to confirm the player, stat, state and price.';
  const researchPlayer=document.createElement('select');
  researchPlayer.setAttribute('aria-label','Player and prop to research');
  const researchBook=document.createElement('select');
  researchBook.setAttribute('aria-label','Sportsbook to research');
  for(const book of ['DraftKings','FanDuel']){
    const o=document.createElement('option');o.value=book;o.textContent=book;
    researchBook.appendChild(o);
  }
  const researchButton=document.createElement('button');
  researchButton.type='button';researchButton.textContent='Search official sportsbook pages';
  const researchResults=document.createElement('div');
  researchResults.setAttribute('role','status');
  researchResults.setAttribute('aria-live','polite');
  marketSearchPanel.append(researchHeading,researchPlayer,researchBook,researchButton,researchResults);
  panel.appendChild(marketSearchPanel);
  let researchQueue=[],researchGameId='';
  function setResearchQueue(queue,id){
    researchQueue=Array.isArray(queue)?queue.slice(0,10):[];
    researchGameId=id||'';
    researchPlayer.replaceChildren();
    researchResults.textContent='';
    researchButton.disabled=true;
    marketSearchPanel.hidden=!researchQueue.length;
    for(let i=0;i<researchQueue.length;i++){
      const p=researchQueue[i],o=document.createElement('option');
      o.value=String(i);
      o.textContent=p.player+' • '+p.team+' • '+p.market;
      researchPlayer.appendChild(o);
    }
  }
  async function refreshSearchConnection(epoch,gameId){
    try{
      const response=await fetch('/api/nfl-public-market-status');
      const status=await response.json();
      if(epoch!==analysisEpoch||researchGameId!==gameId)return;
      researchButton.disabled=!status?.ready;
      researchResults.textContent=status?.ready
        ?'Official-page search connected. Indexed links are not verified odds.'
        :'Search not connected yet. Set the Brave key, Preview flag, and shared Upstash rate-limit credentials in Vercel. The player research checklist still works.';
    }catch{
      if(epoch!==analysisEpoch||researchGameId!==gameId)return;
      researchButton.disabled=true;
      researchResults.textContent='Search connection status unavailable. Research checklist only.';
    }
  }
  researchButton.onclick=async()=>{
    const pick=researchQueue[Number(researchPlayer.value)];
    if(!pick||!researchGameId||researchButton.disabled)return;
    const requestedGame=researchGameId,epoch=analysisEpoch;
    researchButton.disabled=true;
    researchResults.textContent='Searching indexed official sportsbook pages (not live odds)…';
    try{
      const response=await fetch('/api/nfl-public-market-search',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({gameId:researchGameId,player:pick.player,
          team:pick.team,market:pick.category,book:researchBook.value})
      });
      const result=await response.json();
      if(epoch!==analysisEpoch||requestedGame!==researchGameId)return;
      researchResults.replaceChildren();
      if(!result.ok){
        researchResults.textContent=result.error==='search_disabled'||
          result.error==='search_not_configured'||result.error==='search_budget_unconfigured'
          ?'Automatic web discovery is not enabled yet. Use the suggested official-book lookup phrases above until a server-side search key is connected.'
          :'Search temporarily unavailable ('+(result.error||'source_error')+'). Shared rate limits can block searches; no sportsbook odds were verified.';
        return;
      }
      const p=document.createElement('p');
      p.textContent='Found '+Number(result.playerMatchedResults||0)+' indexed player-page leads; '+Number(result.marketMentionedResults||0)+' mention the requested stat. Game identity and live line, plus/minus odds or SGP combined price are NOT verified.';
      researchResults.appendChild(p);
      if(!result.results?.length){
        const empty=document.createElement('p');
        empty.textContent='No matching official sportsbook pages found. The market may still be available in the app.';
        researchResults.appendChild(empty);
      }
      for(const row of (result.results||[]).slice(0,5)){
        const wrapper=document.createElement('div'),link=document.createElement('a');
        link.href=row.url;link.target='_blank';link.rel='noopener noreferrer';
        link.textContent=row.title||'Official sportsbook page';
        wrapper.appendChild(link);
        const reason=document.createElement('p');
        reason.textContent=row.matchLevel==='PLAYER_AND_MARKET_INDEX_MENTION'
          ?'Indexed player + prop mention only; exact matchup, offered line and current price still unverified.'
          :'Indexed player mention only; the requested prop market, game and current price are unverified.';
        wrapper.appendChild(reason);
        if(row.description){
          const snippet=document.createElement('p');
          snippet.textContent=row.description;
          wrapper.appendChild(snippet);
        }
        researchResults.appendChild(wrapper);
      }
    }catch{
      if(epoch===analysisEpoch)researchResults.textContent=
       'Search connection failed. No sportsbook odds were verified.';
    }finally{if(epoch===analysisEpoch&&requestedGame===researchGameId)void refreshSearchConnection(epoch,requestedGame)}
  };
  document.getElementById('momentumAiRun').onclick=async()=>{
   const out=document.getElementById('momentumAiOutput'),button=document.getElementById('momentumAiRun');
   if(button.disabled)return;
   const requestEpoch=++analysisEpoch;
   const selected=typeof nflSelected!=='undefined'?nflSelected:null;
   const gameId=String(selected?.gameId||selected?.id||'');
   const selectionKey=gameId+'|'+String(document.getElementById('momentumAiMode')?.value||'matchup');
   analyzingKey=selectionKey;
   setResearchQueue([],null);
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
    if(requestEpoch!==analysisEpoch)return;
    const candidates=CATS.flatMap(cat=>(m?.categories?.[cat]||[]).slice(0,4).map(x=>({name:x.name,team:x.team})));
    for(const s of packSgps(m))for(const l of s.legs)candidates.push({name:l.name,team:l.team});
    const defensive=matchups(d,game),availability=roster(g,gameId,candidates);
    if(!m?.categories&&!defensive&&!availability){out.textContent='Matchup, player, and market sources are currently unavailable. Existing picks remain unchanged.';return}
    const mode=document.getElementById('momentumAiMode').value;
    const categories={};for(const cat of CATS)categories[cat]=(m?.categories?.[cat]||[]).slice(0,mode==='injury'?2:3).map(player);
    const selectedSgps=mode==='parlay'?packSgps(m).map(s=>({...s,legs:s.legs.slice(0,7)})):[];
    const sources={model:m?.categories?'available':'unavailable',sportsbook:m?.validation?.sportsbookVerificationAvailable===true&&!m.stale?'market evidence present; independently verify book prices':'not verified or currently unavailable',roster:availability?'ESPN current-game cross-check':'unavailable',defense:defensive?'ESPN completed-game box-score splits':'unavailable'};
    const modelTierCount=(m?.sgps?.Analytics||[]).filter(x=>['Small','Medium','Nuke'].includes(x.risk)).length;
    const canonicalPlayers=new Map();
    for(const group of Object.values(categories))for(const row of group){if(row?.name&&row.position&&['QB','RB','WR','TE'].includes(row.position))canonicalPlayers.set(norm(row.name),{name:row.name,team:row.team,position:row.position})}
    for(const check of availability?.playerChecks||[]){
      if(check.position&&check.rosterTeam&&check.status!=='TEAM_MISMATCH'&&['QB','RB','WR','TE'].includes(check.position))canonicalPlayers.set(norm(check.name),{name:check.name,team:check.rosterTeam,position:check.position});
    }
    const playerRoleFacts=[...canonicalPlayers.values()].slice(0,25);
    const identityConflicts=(availability?.playerChecks||[]).filter(x=>x.status==='TEAM_MISMATCH').map(x=>({name:x.name,marketTeam:x.marketTeam,rosterTeam:x.rosterTeam,position:x.position}));
    const data={
     gameId,game:{home:game.home?.name,homeAbbr:game.home?.abbr,away:game.away?.name,awayAbbr:game.away?.abbr,kickoff:game.kickoff,status:game.status,week:game.week},
     sources,model:{fetchedAt:compact(m?.fetchedAt),stale:m?.stale===true,degraded:m?.degraded===true,analyticsAvailable:m?.analyticsAvailable===true,modelSgpTierCount:modelTierCount,sportsbookMarketRows:number(m?.marketRows)??0,modelAvailabilityNote:modelTierCount?'Model-generated SGPs exist but are not verified sportsbook offers or actual payout odds.':'Model SGP tiers unavailable for this game.',validation:m?.validation?{injuryEligibilityChecked:m.validation.injuryEligibilityChecked,starterRoleRequired:m.validation.sgpChecks?.starterRoleRequired,sportsbookVerificationAvailable:m.validation.sportsbookVerificationAvailable}:null},
     categories,playerRoleFacts,identityConflicts,matchup:mode==='injury'?null:conciseMatchup(defensive),playerAvailability:conciseRoster(availability,mode),sgps:selectedSgps,
     instruction:'Explain only evidence actually available. Report opponent-specific sample games, never leaguewide count as individual sample; under five games is limited. IMPORTANT: before generic role warnings, mention any playerAvailability.skillPositionAlerts such as ESPN-reported OUT/IR/Q statuses and potential impact without inventing revised projections; these are NOT confirmed official game-day inactives. Do not imply an unreported injury status means confirmed healthy. Use playerChecks for wrong-team flags. Model SGP tiers exist separately from unverified sportsbook offers and prices. Do not say ALL betting information is unavailable if model tiers and projections are present. Critically, defenseRankMost and offenseRankMost must come from exactly the SAME position and metric as their yards value; for example, RB rushYards 47.5 rank 32 is different from QB rushYards 17.5 rank 13. The offenseProducedPerGame was achieved against earlier opponents, NOT the upcoming defense. Keep missing-verification cautions short. Each playerRoleFacts position is the player actual position; QB rushing yards are compared to QB defense rushYards, not RB defense rushYards. Position-group team averages are not individual player averages. Never identify Jalen Hurts or any QB as an RB, or Chris Rodriguez Jr. or any RB as a QB. Never attach a team-group metric to an individual player. RankMost 1 means most allowed, not strongest defense. Roster membership does not prove starting.'
    };
    if(mode==='research'){
      out.textContent='Checking player identity, roster, injuries and market-source gaps…';
      const researchResponse=await fetch('/api/nfl-player-research',{
       method:'POST',headers:{'Content-Type':'application/json'},
       body:JSON.stringify({
        game:{gameId,homeAbbr:game.home?.abbr,awayAbbr:game.away?.abbr},
        categories,playerAvailability:availability,marketEvidence:m?.marketEvidence
       })
      });
      const research=await researchResponse.json();
      if(!researchResponse.ok||!research.ok){
       displayAnalysis(out,dataOnlySummary(mode,data,'research checklist temporarily unavailable'));
       return;
      }
      if(requestEpoch!==analysisEpoch)return;
      setResearchQueue(research.queue,gameId);
      if(research.queue?.length)void refreshSearchConnection(requestEpoch,gameId);
      data.research={queue:research.queue.slice(0,8),
       researchMessage:research.message,
       quotedBookPricesVerified:0,combinedSgpQuotesVerified:0,
       evidenceBasis:research.evidenceBasis};
    }
    if(Date.now()<aiCooldownUntil){displayAnalysis(out,dataOnlySummary(mode,data,'provider capacity limit; retry later'));if(requestEpoch===analysisEpoch)lastCompletedKey=selectionKey;return}
    out.textContent='Analyzing available evidence…';
    const response=await fetch('/api/ai-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,data})});
    const result=await response.json();
    if(requestEpoch!==analysisEpoch)return;
    if(result.ok){
     displayAnalysis(out,mode==='research'?dataOnlySummary(mode,data,'structured lookup plan')+'\n\nAI research guidance:\n'+(result.analysis||'No explanation returned.'):result.analysis||'No explanation returned.');
    }else{
     if(result.error==='ai_capacity_limited'||result.error==='provider_rate_limited')aiCooldownUntil=Date.now()+Math.max(60,Number(result.retryAfterSeconds)||90)*1000;
     displayAnalysis(out,dataOnlySummary(mode,data,result.error||'unknown_error'));
    }
    lastCompletedKey=selectionKey;
   }catch{if(requestEpoch===analysisEpoch)out.textContent='AI connection failed. Existing projections are unchanged. Retry shortly.'}
   finally{if(requestEpoch===analysisEpoch){button.disabled=false;analyzingKey=''}}
  };
  window.momentumAiGameChanged=game=>{
   analysisEpoch++;analyzingKey='';lastCompletedKey='';
   setResearchQueue([],null);
   const button=document.getElementById('momentumAiRun'),out=document.getElementById('momentumAiOutput'),name=document.getElementById('momentumAiGameName');
   if(button)button.disabled=false;
   if(name)name.textContent=game?(game.away?.name||game.away?.abbr||'Away')+' @ '+(game.home?.name||game.home?.abbr||'Home'):'Open a matchup to view analysis';
   if(out)out.textContent=game?'Select ✨ AI Analysis to load this game’s breakdown.':'Open a matchup to view analysis.';
  };
  window.momentumAiOpenSelected=()=>{
   const g=typeof nflSelected!=='undefined'?nflSelected:null;
   if(!g)return;
   const selectedKey=String(g.gameId||g.id||'')+'|'+String(document.getElementById('momentumAiMode')?.value||'matchup');
   if(lastCompletedKey===selectedKey||analyzingKey===selectedKey)return;
   return document.getElementById('momentumAiRun')?.onclick?.();
  };
  const select=document.getElementById('momentumAiMode');
  if(select)select.onchange=()=>{
   setResearchQueue([],null);
   lastCompletedKey='';
   if(root.style.display!=='none')window.momentumAiOpenSelected();
  };
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();