// Deterministic, advisory Anytime TD candidates for the selected NFL game.
// Uses already-loaded ESPN completed-game player usage and touchdowns, then
// checks both directions of the existing team offense / opponent DVP model.
// Never invent a sportsbook selection, quote or calibrated win probability.
const POSITIONS=new Set(['QB','RB','WR','TE']);
const PRIOR={QB:0.08,RB:0.34,WR:0.24,TE:0.18};
const EXPECTED_VOLUME={QB:4,RB:12,WR:7,TE:4};
const MIN_VOLUME={QB:3,RB:4,WR:3,TE:2};
const clamp=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
const finite=x=>x!==null&&x!==undefined&&x!==''&&Number.isFinite(Number(x));
const positive=x=>finite(x)?Math.max(0,Number(x)):0;
const canonical=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
function validRank(x){
 const n=Number(x);
 return x!==null&&x!==undefined&&x!==''&&Number.isInteger(n)&&n>=1&&n<=32?n:null;
}
export function buildNflAnytimeTdCandidates(rows,{gameId,home,away,dvp,limit=10}={}){
 const id=String(gameId||'');
 if(!/^\d{7,12}$/.test(id)||!canonical(home)||!canonical(away)||canonical(home)===canonical(away))return [];
 const teams=new Set([canonical(home),canonical(away)]);
 const gameSample=positive(dvp?.completedGames);
 const out=[],seen=new Set();
 for(const x of Array.isArray(rows)?rows:[]){
  if(!x||String(x.eventID||'')!==id||!teams.has(canonical(x.team))||
     !POSITIONS.has(String(x.position||'').toUpperCase())||
     !String(x.playerID||'').trim()||!String(x.name||'').trim()||
     seen.has(String(x.playerID)))continue;
  const pos=String(x.position).toUpperCase(),games=positive(x.gamesPlayed),
    carries=positive(x.rushingAttempts),targets=positive(x.targets),
    rushTd=positive(x.rushTouchdowns),recTd=positive(x.receivingTouchdowns);
  const opportunity=pos==='QB'?carries:carries+targets;
  const perGame=games?opportunity/games:0,totalTd=rushTd+recTd;
  if(games<2||perGame<MIN_VOLUME[pos]||!finite(x.rushTouchdowns)||
     !finite(x.receivingTouchdowns))continue;
  const last5=(Array.isArray(x.last5Touchdowns)?x.last5Touchdowns:[])
   .filter(n=>finite(n)&&Number(n)>=0).slice(-5).map(Number);
  const recentRate=last5.length>=3?last5.reduce((a,b)=>a+b,0)/last5.length:null;
  // Four pseudo-games stabilize small samples. Volume is already observed,
  // not an extrapolated or invented snap count.
  const baseTdRate=(totalTd+PRIOR[pos]*4)/(games+4);
  const usageFactor=clamp(Math.sqrt(perGame/EXPECTED_VOLUME[pos]),0.65,1.28);
  const recentFactor=recentRate===null?1:clamp(1+(recentRate-baseTdRate)*0.16,0.90,1.10);
  const opp=canonical(x.opponent),team=canonical(x.team),
   metric=pos==='RB'||pos==='QB'?'rushTD':'recTD',
   opponentDefense=canonical(dvp?.defenseRanks?.[pos]?.[opp]?.[metric]?.team||opp);
  const defenseRank=gameSample>0&&opponentDefense===opp?
    validRank(dvp?.defenseRanks?.[pos]?.[opp]?.[metric]?.rankMost):null;
  const offenseRank=gameSample>0?
    validRank(dvp?.offenseRanks?.[pos]?.[team]?.[metric]?.rankMost):null;
  const defenseFactor=defenseRank===null?1:clamp(1+(16.5-defenseRank)*0.008,0.88,1.12);
  const offenseFactor=offenseRank===null?1:clamp(1+(16.5-offenseRank)*0.004,0.94,1.06);
  const lambda=clamp(baseTdRate*usageFactor*recentFactor*defenseFactor*offenseFactor,0.03,1.3);
  const estimatedPercent=Math.round(clamp((1-Math.exp(-lambda))*100,3,73));
  const confidence=Math.round(clamp(45+Math.min(games,8)*3+
   Math.min(perGame,18)*0.65+(defenseRank!==null?4:0),45,85));
  const lastTd=last5.length?last5.reduce((a,b)=>a+b,0):null;
  const notes=[
   perGame.toFixed(1)+(pos==='QB'?' rush attempts':' carries + targets')+' per game',
   totalTd+' rushing/receiving TD in '+games+' completed games',
   ...(lastTd===null?[]:[lastTd+' TD in last '+last5.length+' sampled games']),
   ...(defenseRank===null?[]:[opp+' defense #'+defenseRank+' most '+(metric==='rushTD'?'rushing':'receiving')+' TD allowed to '+pos]),
   ...(offenseRank===null?[]:[team+' offense #'+offenseRank+' most '+(metric==='rushTD'?'rushing':'receiving')+' TD by '+pos])
  ];
  seen.add(String(x.playerID));
  out.push({
   ...x,category:'td',marketName:'analytics_anytime_td_candidate',
   statID:'touchdowns',periodID:'game',betTypeID:'analytics',sideID:'candidate',
   projection:'Anytime TD',projectionLabel:'Anytime TD',projectionUnit:'touchdown',
   projectionMethod:'ESPN historical rush/target/TD usage + opponent DVP shrinkage',
   analyticsOnly:true,books:[],bestBook:null,bookOffer:null,
   sportsbookVerified:false,combinedBookQuoteVerified:false,
   modelTdPercent:estimatedPercent,confidence,
   perGame:Number((totalTd/games).toFixed(2)),
   evidence:{games,opportunities:opportunity,opportunitiesPerGame:Number(perGame.toFixed(1)),
    rushAttempts:carries,targets,touchdowns:totalTd,
    rushTouchdowns:rushTd,receivingTouchdowns:recTd,
    last5Touchdowns:last5,defenseRank,offenseRank,defenseSampleGames:gameSample},
   tdModelStatus:'ESPN_MATCHUP_MODEL',modelOnly:true,
   reason:notes.join(' • ')+'. Model-estimated chance, NOT verified sportsbook odds.'
  });
 }
 return out.sort((a,b)=>b.modelTdPercent-a.modelTdPercent||
  b.confidence-a.confidence||String(a.name).localeCompare(String(b.name)))
  .slice(0,clamp(Math.floor(Number(limit)||10),1,20)).map((x,i)=>({...x,rank:i+1}));
}
