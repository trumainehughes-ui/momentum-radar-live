// Research-only opponent allowances; each row represents one completed game and one opponent.
export function opponentDefensiveAllowances(rows,{lastGames=10}={}){
 const limit=Math.max(1,Math.min(30,Number(lastGames)||10));
 const teams=new Map();
 for(const row of rows||[]){
  if(!row?.defenseTeamId||!row?.gameId||!row?.gameDate)continue;
  if(!['STATUS_FINAL','FINAL'].includes(String(row.gameStatus||'').toUpperCase()))continue;
  const teamId=String(row.defenseTeamId),games=teams.get(teamId)||new Map();
  const game=games.get(String(row.gameId))||{gameId:row.gameId,date:row.gameDate,values:{}};
  for(const [stat,value] of Object.entries(row.allowedStats||{})){
   if(Number.isFinite(value))game.values[stat]=(game.values[stat]||0)+value;
  }
  games.set(String(row.gameId),game);teams.set(teamId,games);
 }
 return [...teams.entries()].map(([defenseTeamId,games])=>{
  const recent=[...games.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,limit);
  const totals={},counts={};
  for(const game of recent)for(const [stat,value] of Object.entries(game.values)){
   totals[stat]=(totals[stat]||0)+value;counts[stat]=(counts[stat]||0)+1;
  }
  return {defenseTeamId,games:recent.length,allowedPerGame:Object.fromEntries(
   Object.keys(totals).map(k=>[k,Math.round(totals[k]/counts[k]*100)/100]))};
 });
}
