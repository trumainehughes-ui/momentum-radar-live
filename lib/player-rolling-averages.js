// Research-only aggregations over completed game boxscores; not a prediction or a sportsbook line.
export function rollingPlayerAverages(records,{lastGames=10}={}){
 const limit=Math.max(1,Math.min(30,Number(lastGames)||10));
 const byPlayer=new Map();
 for(const row of records||[]){
  if(!row?.playerId||!row?.gameId||!row?.gameDate)continue;
  if(row.gameStatus&&!['STATUS_FINAL','FINAL'].includes(String(row.gameStatus).toUpperCase()))continue;
  const key=String(row.playerId)+'|'+String(row.category||'');
  const existing=byPlayer.get(key)||new Map();
  const game=existing.get(String(row.gameId))||{gameId:row.gameId,date:row.gameDate,values:{}};
  for(const [stat,value] of Object.entries(row.numericStats||{})){
   if(Number.isFinite(value))game.values[stat]=value;
  }
  existing.set(String(row.gameId),game);byPlayer.set(key,existing);
 }
 return [...byPlayer.entries()].map(([key,games])=>{
  const sorted=[...games.values()].sort((a,b)=>Date.parse(b.date)-Date.parse(a.date)).slice(0,limit);
  const totals={},counts={};
  for(const game of sorted)for(const [stat,value] of Object.entries(game.values)){
   totals[stat]=(totals[stat]||0)+value;counts[stat]=(counts[stat]||0)+1;
  }
  const averages=Object.fromEntries(Object.keys(totals).map(stat=>[stat,
   Math.round(totals[stat]/counts[stat]*100)/100]));
  return {playerId:key.split('|')[0],category:key.split('|')[1]||null,
   games:sorted.length,averages,gameIds:sorted.map(g=>g.gameId)};
 });
}
