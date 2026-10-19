// Pure, bounded NBA completed-game stat aggregation. No network or betting claims.
const cats=['points','rebounds','assists','threes'];
const finite=n=>typeof n==='number'&&Number.isFinite(n)&&n>=0;
const validPos=new Set(['PG','SG','SF','PF','C']);
export function nbaVerifiedPositionSamples({historical=[],roster=new Map(),asOf,minGames=5}={}){
 const cutoff=Date.parse(asOf||'');
 if(!Number.isFinite(cutoff)||!(roster instanceof Map))return {status:'NOT_READY',teams:{},reason:'INVALID_INPUT'};
 const byTeam=new Map(),seen=new Set();
 for(const game of (Array.isArray(historical)?historical:[]).slice(0,250)){
  if(game?.status!=='FINAL'||!game.gameId||seen.has(String(game.gameId)))continue;
  const played=Date.parse(game.completedAt||game.kickoff||game.date||'');
  if(!Number.isFinite(played)||played>=cutoff)continue;
  const home=game.matchup?.home?.abbr,away=game.matchup?.away?.abbr;
  if(!home||!away||home===away)continue;
  seen.add(String(game.gameId));
  for(const [opponent,offense] of [[home,away],[away,home]]){
   const rows=(game.players||[]).filter(p=>p.team===offense);
   const positionTotals={};
   for(const p of rows){
    const position=String(p.position||roster.get(String(p.playerId))?.position||'').toUpperCase();
    if(!validPos.has(position)||!cats.every(k=>finite(p[k])))continue;
    const slot=positionTotals[position]||(positionTotals[position]={});
    for(const cat of cats)slot[cat]=(slot[cat]||0)+p[cat];
   }
   if(!Object.keys(positionTotals).length)continue;
   const record=byTeam.get(opponent)||new Map();
   for(const [position,totals] of Object.entries(positionTotals)){
    const rows=record.get(position)||[];
    rows.push({gameId:String(game.gameId),...totals});
    record.set(position,rows);
   }
   byTeam.set(opponent,record);
  }
 }
 const teams={};
 for(const [teamId,positions] of byTeam){
  teams[teamId]={teamId,allowedByPosition:{}};
  for(const [position,rows] of positions){
   const entry={games:rows.length};
   for(const cat of cats)entry[cat]=Number((rows.reduce((n,r)=>n+r[cat],0)/rows.length).toFixed(2));
   entry.sampleStatus=rows.length>=minGames?'OBSERVED':'THIN_SAMPLE';
   teams[teamId].allowedByPosition[position]=entry;
  }
 }
 return {status:Object.keys(teams).length?'HISTORICAL_EVIDENCE':'NOT_READY',
  source:'Completed-game player box scores with roster position labels',
  asOf:new Date(cutoff).toISOString(),teams,
  limitation:'Position labels are not actual defensive assignments; data is per opponent game, not league-adjusted.'};
}
