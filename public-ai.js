// Evidence-bound Momentum Radar AI. Read-only: never edits projections or bet slips.
// Six additional on-demand advisors use the existing Groq endpoint, not sportsbook credits.
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
  if(mode==='sportsbook'){
   const t=Date.parse(d.sportsbooks?.sourceCheckedAt||'');
   const valid=String(d.sportsbooks?.gameId||'')===String(d.gameId||'')&&
    d.sportsbooks?.marketFeedAvailable===true&&
    d.model?.validation?.sportsbookVerificationAvailable===true&&
    d.model?.stale!==true&&d.model?.degraded!==true&&
    Number.isFinite(t)&&t<=Date.now()&&Date.now()-t<=15*60000;
   if(!valid)out.push('Book-specific player prop offers are not source-verified and fresh for this selected game; cannot assess listed selections.');
   else for(const tier of (d.sportsbooks?.tiers||[])){
    for(const book of ['FanDuel','DraftKings']){
     const a=tier.books?.[book];
     out.push(tier.risk+' '+book+': '+(a?.matchedLegs??'?')+'/'+(a?.requiredLegs??'?')+
      ' individually listed selections; actual combined SGP odds not verified.');
     for(const l of (a?.missingLegs||[]).slice(0,3))
      out.push(l.name+' '+l.category+' requested '+l.requested+
       ' • offered alternatives for human recheck: '+
       (l.listedOffers||[]).map(x=>x.display).join(' or '));
    }
   }
  }else if(mode==='parlay'){
   for(const s of (d.sgps||[]).filter(x=>x.source==='Analytics').slice(0,3)){
    out.push(s.risk+' model: '+s.legs.map(x=>x.name+' '+(x.modelThreshold??'threshold pending')).join('; ')+(s.payoutBandVerified?' • book payout verified':' • sportsbook payout not verified'));
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
   watched.set(norm(c.name),{name:c.name,marketTeam:c.team||null,rosterTeam:match?.team||null,position:match?.position||null,status,injuryStatus:injury?.status||null,starterEvidenceSource:match?.verification?.role?.source||null});
   if(watched.size>=30)break;
  }
  const priorities=new Set(watched.keys());
  const players=[...all].sort((a,b)=>Number(priorities.has(norm(b.name)))-Number(priorities.has(norm(a.name)))).slice(0,24);
  return{source:compact(d.source),fetchedAt:compact(d.fetchedAt),injuries:(d.injuries||[]).slice(0,20).map(x=>({name:x.name,team:x.team,position:x.position,status:x.status,injury:x.injury,source:x.source})),blocked:(d.blockers||[]).slice(0,20).map(x=>({name:x.name,team:x.team,status:x.status,source:x.source})),roles:(d.roleSignals||[]).slice(0,20).map(x=>({name:x.name,team:x.team,status:x.status,source:x.source,checkedAt:x.checkedAt})),players:players.map(p=>({name:p.name,team:p.team,position:p.position,availability:p.availability,starterStatus:p.starterStatus,starterVerified:!!p.starterVerified,roleEvidence:p.verification?.role?.source||null})),playerChecks:[...watched.values()],roleVerificationRequired:true,note:'Not found in the current roster snapshot does not prove ineligible; independent official starter and injury verification is still required.'};
 }
 function player(x){
  return{name:x.name,team:x.team,playerID:x.playerID||x.playerId||null,eventID:x.eventID||null,position:x.position,projection:number(x.edgeAnalytics?.modelProjection??x.predictiveProjection??x.projection),perGame:number(x.perGame),modelScore:number(x.momentumScore),confidence:number(x.confidence),estimatedRushingPercent:number(x.rushingChance?.estimatedPercent),gamesPlayed:number(x.gamesPlayed),matchup:x.matchup?{opponent:x.matchup.opponent,position:x.matchup.position,metric:x.matchup.metric,rankMost:number(x.matchup.rankMost),allowedPerGame:number(x.matchup.allowedPerGame),label:x.matchup.label}:null,book:x.bestBook?.book||null,marketLine:number(x.edgeAnalytics?.sportsbookLine??x.bestBook?.line),bookOdds:number(x.bestBook?.odds),recentHitRates:x.recentHitRates||null};
 }
 function leg(x){return{name:x.name,team:x.team,playerID:x.playerID||x.playerId||null,
    eventID:x.eventID||x.gameId||null,position:x.position||null,
    category:x.cat||x.category,projection:number(x.predictiveProjection??x.projection),
    modelThreshold:x.analyticsThreshold??x.threshold??null,
    bookLine:number(x.bookOffer?.line),bookOdds:number(x.bookOffer?.odds),
    sportsbookVerified:x.sportsbookVerified===true};}
 function packSgps(m){
  const result=[];for(const source of ['Analytics','DraftKings','FanDuel'])for(const risk of RISKS){
   const s=(m?.sgps?.[source]||[]).find(x=>x.risk===risk);
   if(!s)continue;
   result.push({source,risk,book:s.book||null,payoutTarget:s.payoutTarget||null,estimatedOdds:number(s.estimatedOdds),actualSgpOdds:number(s.actualSgpOdds),payoutBandVerified:s.payoutBandVerified===true,bookVerificationPending:s.bookVerificationPending===true,sourcePolicy:s.sourcePolicy?.rule||null,legs:(s.legs||[]).slice(0,10).map(leg)});
  }return result;
 }
 // This payload is derived only from the CURRENT selected game's existing
 // sportsbook audits. It causes zero additional sportsbook requests.
 // A sportsbook's individual lines are never an executable combined SGP.
 // On-demand AI gets REAL per-player odds from the already-fetched
 // DraftKings/FanDuel market catalog; no extra API fetch or web scraping.
 // Never pass stale/wrong-game lines or let the AI issue correlated quotes.
 function bookmakerPriceContext(m,gameId){
  const observed=Date.parse(m?.fetchedAt||'');
  const valid=String(m?.gameId||'')===String(gameId)&&
   m?.stale!==true&&m?.degraded!==true&&
   m?.validation?.sportsbookVerificationAvailable===true&&
   Number.isFinite(observed)&&observed<=Date.now()&&
   Date.now()-observed<=15*60000;
  if(!valid)return{status:'NO_VERIFIED_CURRENT_PLAYER_PRICES',
   gameId,books:['DraftKings','FanDuel'],players:[],
   combinedQuoteVerified:false};
  const players=[];
  for(const cat of ['td','passing','rushing','receiving','receptions']){
   for(const x of (m?.categories?.[cat]||[]).slice(0,10)){
    if(players.length>=20)break;
    const key=x?.bookLineCatalog||{};
    const prices=Object.fromEntries(['DraftKings','FanDuel'].map(book=>[
     book,(Array.isArray(key[book])?key[book]:[]).slice(0,3)
      .filter(o=>o?.odds!==null&&o?.odds!==undefined&&
       Number.isFinite(Number(o.odds))&&Number(o.odds)!==0)
      .map(o=>({line:String(o.line),americanOdds:Number(o.odds),
       source:'PROVIDER_BOOK_OFFER',combinedQuoteVerified:false}))
    ]));
    if(prices.DraftKings.length||prices.FanDuel.length)
     players.push({name:String(x.name||'').slice(0,80),
      team:String(x.team||'').slice(0,10),category:cat,
      books:prices,allBooksListed:Boolean(prices.DraftKings.length&&prices.FanDuel.length)});
   }
  }
  return{status:'CURRENT_INDIVIDUAL_PROVIDER_PRICES',
   gameId,checkedAt:m.fetchedAt,
   books:['DraftKings','FanDuel'],
   players,priceSamplesOnly:true,combinedQuoteVerified:false,
   note:'Official per-book individual lines only; absence means unavailable or unobserved, not zero. AI must never manufacture sportsbook odds or a correlated SGP payout.'};
 }
 function sportsbookEvidence(m,gameId){
  const cards=(m?.sgps?.Analytics||[]),verification=m?.sgpVerification;
  const verifiedScope=String(m?.gameId||'')===String(gameId);
  const validAudit=String(verification?.gameId||'')===String(gameId)&&
   verification?.league==='nfl';
  return {gameId:verifiedScope?gameId:null,
   sourceCheckedAt:compact(m?.fetchedAt||m?.checkedAt),
   marketFeedAvailable:verifiedScope&&m?.validation?.sportsbookVerificationAvailable===true&&
    m?.stale!==true&&m?.degraded!==true,
   league:'nfl',combinedSgpQuoteAuthorized:false,
   tiers:RISKS.map(risk=>{
    const model=cards.find(x=>x?.risk===risk),
     audited=validAudit?verification.tiers?.find(x=>x?.risk===risk):null;
    return {risk,legCount:(model?.legs||[]).length,
     modelStatus:audited?.modelStatus||'NOT_READY',
     books:Object.fromEntries(['FanDuel','DraftKings'].map(book=>{
      const a=verifiedScope?model?.bookMarketAudits?.[book]:null;
      const trusted=a&&String(a.gameId||'')===String(gameId)&&
       a.book===book&&a.requestedTier===risk;
      return [book,trusted?{status:a.status,
       matchedLegs:a.matchedLegs,requiredLegs:a.totalLegs,
       missingLegs:(a.missingLegs||[]).slice(0,7).map(l=>({
        name:l.name,category:l.category,requested:l.requested,
        listedOffers:(l.listedOffers||[]).slice(0,4).map(o=>({
         display:o.display,minimumToWin:o.minimumToWin
        }))
       }))}:{status:'UNVERIFIED',matchedLegs:null,requiredLegs:null,missingLegs:[]}];
     }))}
   })
  };
 }
 // The parlay AI receives the deterministic SGP decisions as INPUT,
 // never instructions to make price/line changes. No new sportsbook call.
 function parlayRecheckEvidence(m,gameId){
  const p=m?.sgpAiPlan,t=Date.parse(m?.fetchedAt||'');
  const valid=String(m?.gameId||'')===String(gameId)&&
   String(p?.gameId||'')===String(gameId)&&p?.league==='nfl'&&
   Number.isFinite(t)&&t<=Date.now()&&Date.now()-t<=15*60000&&
   !m?.stale&&!m?.degraded;
  if(!valid)return{status:'FRESH_BOOKMARKET_RECHECK_REQUIRED',
   gameId,allCombinedOddsVerified:false,tiers:[]};
  return{status:p.status,gameId,allCombinedOddsVerified:false,
   needsMarketRecheck:p.needsMarketRecheck,
   needsModelRebuild:p.needsModelRebuild,
   needsCombinedQuotes:p.needsCombinedQuotes,
   evidenceChanges:(p.evidenceChanges||[]).slice(0,5),
   sportsbookRebuild:(m?.sgpRebuildReport?.league==='nfl'&&
    String(m.sgpRebuildReport.gameId||'')===String(gameId)?
    (m.sgpRebuildReport.tiers||[]).slice(0,3).map(t=>({
     risk:t.risk,targetMinimumAmerican:t.targets?.minimum??null,
     targetMaximumAmerican:t.targets?.maximum??null,
     books:(t.books||[]).slice(0,2).map(b=>({
      book:b.book,marketSourceStatus:b.marketSourceStatus,
      nextAction:b.nextAction,individuallyListed:b.bookListedLegsVerified===true,
      combinedBookQuoteVerified:false
     }))
    })):[]),
   tiers:(p.tiers||[]).slice(0,3).map(t=>({
    risk:t.risk,modelStatus:t.modelStatus,
    aiRuleValidation:{
     valid:t.aiRuleValidation?.valid===true,
     violations:(t.aiRuleValidation?.violations||[]).slice(0,9),
     targetOdds:t.aiRuleValidation?.targetOdds||null
    },
    books:(t.bookActions||[]).slice(0,2).map(a=>({
     book:a.book,action:a.action,reason:a.reason,
     individuallyMatched:a.individuallyMatched,
     requestedLegs:a.requestedLegs,
     suggestedLineRechecks:(a.suggestedLineRechecks||[]).slice(0,3)
      .map(l=>({player:l.player,category:l.category,requested:l.requested,
       observedOffers:(l.observedOffers||[]).slice(0,3),
       modelCompatibleOptions:(l.modelCompatibleOptions||[]).slice(0,2).map(o=>({
        threshold:o.threshold,sourceLabel:o.sourceLabel,
        needsFreshBookAudit:true,requiresUpdatedProjection:true
       }))})),
     rescueStatus:a.rescueStatus||null,
     provisionalOnly:true,bookableWagerConfirmed:false
    }))
   }))
  };
 }
 function summarizeAdvisory(report){
  if(!report)return '';
  const details=['Evidence checks: '+report.status+' (read-only; inputs not independently authenticated)'];
  for(const flag of (report.flags||[]).slice(0,7))details.push('Check: '+flag.detail);
  for(const item of (report.items||[]).slice(0,5)){
   if(report.mode==='learning')details.push(item.name+' • locked '+item.projectionAtLock+' vs actual '+item.actual+' • error '+item.signedError);
   if(report.mode==='nuke')details.push(item.label+' • '+item.legs+' legs, '+item.yardageLegs+' yardage • '+item.reviewStatus);
   if(report.mode==='value')details.push(item.name+' • '+item.book+' '+item.line+' vs model '+item.projection+' • gap '+item.difference);
   if(report.mode==='opportunity')details.push(item.name+' '+item.reportedStatus+' • possible teammates to review: '+item.possibleAlternates.map(x=>x.name).join(', '));
   if(report.mode==='guardian')details.push('Source candidates reviewed: '+item.count);
   if(report.mode==='simulation')details.push(item.offense+' vs '+item.defense+' • '+item.questions.join('; '));
   if(report.mode==='sportsbook')details.push(item.risk+' '+item.book+' • '+(item.exactLegs??'?')+'/'+item.requiredLegs+' individual markets • '+item.marketStatus+(item.proposedOfferChecks?.length?' • '+item.proposedOfferChecks.map(p=>p.player+': '+p.bookOffers.join(' or ')).join('; '):''));
  }
  for(const note of (report.notes||[]).slice(0,3))details.push(note);
  return details.join('\n')+'\n\n';
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
  panel.innerHTML='<h3>Momentum Radar AI <small style="font-size:11px;color:#b3edff">Beta</small></h3><p class="momentumAiNote">The analysis follows the game you opened. NFL model data and ESPN injury reports are described separately from sportsbook-verified odds.</p><div id="momentumAiGameName" class="momentumAiGameName" aria-live="polite">Open a matchup to view analysis</div><div class="momentumAiActions"><select id="momentumAiMode" aria-label="Analysis type"><option value="matchup">Matchup analysis</option><option value="injury">Injury / lineup impact</option><option value="parlay">SGP review</option><option value="results">Results review</option><option value="guardian">Data Quality Guardian</option><option value="nuke">Nuke Parlay Architect</option><option value="opportunity">Injury & Opportunity Radar</option><option value="value">Prop Value Detector</option><option value="sportsbook">Sportsbook Market Scout (DK / FD)</option><option value="simulation">Game Script Simulator</option><option value="learning">Postgame Learning Lab</option></select><button id="momentumAiRun" type="button">Refresh analysis</button></div><div id="momentumAiOutput" role="status" aria-live="polite">Tap AI Analysis above to analyze this matchup.</div>';
  root.prepend(panel);
  document.getElementById('momentumAiRun').onclick=async()=>{
   const out=document.getElementById('momentumAiOutput'),button=document.getElementById('momentumAiRun');
   if(button.disabled)return;
   const requestEpoch=++analysisEpoch;
   const selected=typeof nflSelected!=='undefined'?nflSelected:null;
   const gameId=String(selected?.gameId||selected?.id||'');
   const selectionKey=gameId+'|'+String(document.getElementById('momentumAiMode')?.value||'matchup');
   analyzingKey=selectionKey;
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
    const categories={};for(const cat of CATS)categories[cat]=(m?.categories?.[cat]||[]).slice(0,['guardian','nuke','opportunity','value'].includes(mode)?10:mode==='injury'?2:3).map(player);
    const selectedSgps=['parlay','guardian','nuke','learning','sportsbook'].includes(mode)?packSgps(m).map(s=>({...s,legs:s.legs.slice(0,7)})):[];
    // Postgame learning uses locked historical picks, not re-created lines.
    const graded=mode==='learning'?await getJson('/api/nfl-game?mode=history-grade&gameId='+encodeURIComponent(gameId)+'&ts='+Date.now()).catch(()=>null):null;
    if(requestEpoch!==analysisEpoch)return;
    const results=graded?{final:graded.final===true,lockedAt:graded.lockedAt,
      picks:(graded.picks||[]).slice(0,25).map(x=>({name:x.name,category:x.category||x.cat,
        grade:x.grade?{status:x.grade.status,actual:number(x.grade.actual),
          projectionAtLock:number(x.grade.projectionAtLock),target:number(x.grade.target)}:null}))}:null;
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
     categories,playerRoleFacts,identityConflicts,matchup:mode==='injury'?null:conciseMatchup(defensive),playerAvailability:conciseRoster(availability,mode),sgps:selectedSgps,results,
     sportsbooks:mode==='sportsbook'?sportsbookEvidence(m,gameId):null,
     bookmakerPrices:['sportsbook','parlay','nuke','value'].includes(mode)?bookmakerPriceContext(m,gameId):null,
     parlayRecheck:['parlay','nuke','sportsbook'].includes(mode)?
      parlayRecheckEvidence(m,gameId):null,
     instruction:'Explain only evidence actually available. Report opponent-specific sample games, never leaguewide count as individual sample; under five games is limited. IMPORTANT: before generic role warnings, mention any playerAvailability.skillPositionAlerts such as ESPN-reported OUT/IR/Q statuses and potential impact without inventing revised projections; these are NOT confirmed official game-day inactives. Do not imply an unreported injury status means confirmed healthy. Use playerChecks for wrong-team flags. Model SGP tiers exist separately from unverified sportsbook offers and prices. Do not say ALL betting information is unavailable if model tiers and projections are present. Critically, defenseRankMost and offenseRankMost must come from exactly the SAME position and metric as their yards value; for example, RB rushYards 47.5 rank 32 is different from QB rushYards 17.5 rank 13. The offenseProducedPerGame was achieved against earlier opponents, NOT the upcoming defense. Keep missing-verification cautions short. Each playerRoleFacts position is the player actual position; QB rushing yards are compared to QB defense rushYards, not RB defense rushYards. Position-group team averages are not individual player averages. Never identify Jalen Hurts or any QB as an RB, or Chris Rodriguez Jr. or any RB as a QB. Never attach a team-group metric to an individual player. RankMost 1 means most allowed, not strongest defense. Roster membership does not prove starting.'
    };
    if(Date.now()<aiCooldownUntil){displayAnalysis(out,dataOnlySummary(mode,data,'provider capacity limit; retry later'));if(requestEpoch===analysisEpoch)lastCompletedKey=selectionKey;return}
    out.textContent='Analyzing available evidence…';
    const response=await fetch('/api/ai-analysis',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({mode,data})});
    const result=await response.json();
    if(requestEpoch!==analysisEpoch)return;
    if(result.ok){
     const source=result.provider==='openrouter'?'AI: OpenRouter backup':result.provider==='groq'?'AI: Groq primary':result.aiAvailable===false?'AI: deterministic evidence only':'';
     displayAnalysis(out,(source?source+'\n\n':'')+summarizeAdvisory(result.mechanics)+(result.analysis||'No explanation returned.'));
    }else{
     if(result.error==='ai_capacity_limited'||result.error==='provider_rate_limited')aiCooldownUntil=Date.now()+Math.max(60,Number(result.retryAfterSeconds)||90)*1000;
     displayAnalysis(out,summarizeAdvisory(result.mechanics)+dataOnlySummary(mode,data,result.error||'unknown_error'));
    }
    lastCompletedKey=selectionKey;
   }catch{if(requestEpoch===analysisEpoch)out.textContent='AI connection failed. Existing projections are unchanged. Retry shortly.'}
   finally{if(requestEpoch===analysisEpoch){button.disabled=false;analyzingKey=''}}
  };
  window.momentumAiGameChanged=game=>{
   analysisEpoch++;analyzingKey='';lastCompletedKey='';
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
   lastCompletedKey='';
   if(root.style.display!=='none')window.momentumAiOpenSelected();
  };
 };
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',ready);else ready();
})();