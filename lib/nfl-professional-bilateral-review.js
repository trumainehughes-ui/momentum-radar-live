// Source-grounded, read-only professional matchup audit. Neither this audit
// nor a language model can create market odds, alter SGP legs, or guarantee ROI.
// Rank #1 means MOST yards/receptions allowed or produced, never fewest.
const metrics={
 QB:['passYards','rushYards'],RB:['rushYards','recYards','receptions'],
 WR:['recYards','receptions'],TE:['recYards','receptions']
};
const rank=x=>Number.isInteger(Number(x))&&Number(x)>=1&&Number(x)<=32?Number(x):null;
const num=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x))?Number(x):null;
const abbr=x=>{const key=String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');return ({LA:'LAR',WAS:'WSH',JAC:'JAX'})[key]||key;};
const safeGames=x=>Number.isInteger(Number(x))&&Number(x)>0?Number(x):null;
function side(offenseTeam,defenseTeam,dvp){
 const offenseSampleGames=safeGames(dvp?.offense?.[offenseTeam]?.games);
 const defenseSampleGames=safeGames(dvp?.defense?.[defenseTeam]?.games);
 const positions=Object.entries(metrics).map(([position,metricKeys])=>({
  position,metrics:metricKeys.map(metric=>{
   const off=dvp?.offenseRanks?.[position]?.[offenseTeam]?.[metric];
   const def=dvp?.defenseRanks?.[position]?.[defenseTeam]?.[metric];
   const offenseRankMost=rank(off?.rankMost),
    defenseRankMost=rank(def?.rankMost);
   const offenseProducedPerGame=num(off?.value),
    defenseAllowedPerGame=num(def?.value);
   const fullyCompared=offenseRankMost!==null&&defenseRankMost!==null&&
    offenseProducedPerGame!==null&&defenseAllowedPerGame!==null;
   const reliable=fullyCompared&&offenseSampleGames>=5&&defenseSampleGames>=5;
   const signal=!fullyCompared?'INCOMPLETE_EVIDENCE':
    !reliable?'LIMITED_SAMPLE':
    offenseRankMost<=12&&defenseRankMost<=12?'FAVORABLE_MATCHUP':
    offenseRankMost>=24&&defenseRankMost>=24?'DIFFICULT_MATCHUP':
    'MIXED_MATCHUP';
   return {metric,offenseProducedPerGame,offenseRankMost,
    defenseAllowedPerGame,defenseRankMost,
    sampleReliable:reliable,signal};
  })
 }));
 return {offenseTeam,defenseTeam,offenseSampleGames,defenseSampleGames,positions,
  evidenceQuality:!offenseSampleGames||!defenseSampleGames?'MISSING':
   Math.min(offenseSampleGames,defenseSampleGames)<5?'LIMITED':'COMPLETED_GAME_SAMPLE'};
}
const riskNames=new Set(['Small','Medium','Nuke']);
export function nflProfessionalBilateralReview({
 gameId,home,away,dvp,modelCards=[],injuryChecked=false,blockedPlayerCount=0
}={}){
 const teams=[abbr(home),abbr(away)];
 const available=teams.every(x=>x.length>=2)&&teams[0]!==teams[1]&&
  Boolean(dvp?.ok)&&Number(dvp.completedGames)>0;
 const sides=available?[side(teams[0],teams[1],dvp),side(teams[1],teams[0],dvp)]:[];
 const risks=(Array.isArray(modelCards)?modelCards:[])
  .filter(s=>riskNames.has(s?.risk)).slice(0,3).map(s=>{
   const legs=Array.isArray(s.legs)?s.legs:[];
   const gameAligned=legs.every(l=>String(l.eventID||l.gameId||'')===String(gameId)&&
     teams.includes(abbr(l.team)));
   const incomplete=s.candidateComplete!==true||
    s.tierAssessment?.compositionOk!==true||legs.length!==s.requiredLegs;
   const gameVerified=gameAligned&&Boolean(gameId);
   const holdReasons=[];
   if(incomplete)holdReasons.push('INCOMPLETE_MODEL_COMPOSITION');
   if(!injuryChecked)holdReasons.push('INJURY_ELIGIBILITY_UNVERIFIED');
   if(!gameVerified)holdReasons.push('GAME_IDENTITY_UNVERIFIED');
   if(!sides.length)holdReasons.push('OFFENSE_DEFENSE_EVIDENCE_MISSING');
   else if(sides.some(x=>x.evidenceQuality!=='COMPLETED_GAME_SAMPLE'))
    holdReasons.push('LIMITED_COMPLETED_GAME_SAMPLE');
   // Do not force a wager. This is an evaluation of a MODEL only,
   // independently of the actual book quote / implied probability.
   return{risk:s.risk,legCount:legs.length,
    status:holdReasons.length?'REVIEW_OR_PASS':'MODEL_REVIEW_READY',
    holdReasons,bookmakerPriceVerified:false,
    modelOnly:true};
  });
 return {
  source:'ESPN_COMPLETED_NFL_BOX_SCORES',
  status:sides.length?'BILATERAL_EVIDENCE':'MATCHUP_EVIDENCE_MISSING',
  gameId:String(gameId||''),sides,risks,
  injuryEligibilityChecked:injuryChecked===true,
  blockedPlayerCount:Math.max(0,Math.floor(Number(blockedPlayerCount)||0)),
  rankMeaning:'Rank #1 = most production, or most production allowed, per game.',
  sportsbookPricing:'SEPARATE_VERIFIED_BOOK_QUOTE_REQUIRED',
  bettorDiscipline:'Review both offense->opponent defense directions, position-specific samples, roster/injuries and price; PASS rather than force an unsupported leg. No guaranteed returns.'
 };
}
