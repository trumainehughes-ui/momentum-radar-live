// Deterministic player-game-log evidence for NFL, NBA and future leagues.
// Source game logs must be real, identified games; no AI-created performances.
const numeric=x=>x!==null&&x!==undefined&&String(x).trim()!==''&&Number.isFinite(Number(x))?Number(x):null;
export function analyzePlayerGameLogs({sport,playerId,market,line,games=[],source='UNKNOWN',checkedAt=null}={}){
 const threshold=numeric(line);
 const seen=new Set();
 const valid=(Array.isArray(games)?games:[]).filter(g=>{
  const id=String(g.gameId||'').trim(),value=numeric(g.value);
  if(!id||seen.has(id)||value===null||value<0||!g.date)return false;
  seen.add(id);return true;
 }).sort((a,b)=>String(b.date).localeCompare(String(a.date)));
 const summarize=count=>{
  const sample=valid.slice(0,count),values=sample.map(g=>Number(g.value));
  const total=values.reduce((a,b)=>a+b,0);
  const hits=threshold===null?null:values.filter(x=>x>=threshold).length;
  return {games:sample.length,average:sample.length?Number((total/sample.length).toFixed(2)):null,
   hits,hitRate:hits===null||!sample.length?null:Number((100*hits/sample.length).toFixed(1)),
   values,opponents:sample.map(g=>g.opponent||null)};
 };
 return {sport,playerId,market,line:threshold,source,checkedAt,
  last5:summarize(5),last10:summarize(10),season:summarize(valid.length),
  latestGameDate:valid[0]?.date||null,verifiedGameCount:valid.length,
  ready:threshold!==null&&valid.length>0,
  evidenceType:'OBSERVED_GAME_LOGS',aiGenerated:false};
}
