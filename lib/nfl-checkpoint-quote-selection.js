// A scheduled pricing checkpoint may use at most three correlated quotes,
// one per Small/Medium/Nuke tier. Rotate book preference by game and phase;
// verified injury changes retain their independent six-quote policy.
export function chooseNflCheckpointQuotes(candidates,{gameId,stage,max=3}={}){
 const pool=Array.isArray(candidates)?candidates:[];
 const base=Number(BigInt(/^\d+$/.test(String(gameId||''))?String(gameId):'0')%2n);
 const first=(base+(stage==='FINAL_T_MINUS_30'?1:0))%2===0?'DraftKings':'FanDuel';
 const ordered=[first,first==='DraftKings'?'FanDuel':'DraftKings'];
 const used=new Set(),out=[];
 for(const risk of ['Nuke','Small','Medium']){
  const byTier=pool.filter(c=>c?.risk===risk&&
   ['DraftKings','FanDuel'].includes(c.book));
  const preferred=ordered[(out.length)%2];
  const chosen=byTier.find(c=>c.book===preferred&&!used.has(c.book+'|'+risk))||
   byTier.find(c=>!used.has(c.book+'|'+risk));
  if(chosen){out.push(chosen);used.add(chosen.book+'|'+risk)}
 }
 if(out.length<max)for(const book of ordered)for(const risk of ['Nuke','Small','Medium']){
  const item=pool.find(c=>c?.book===book&&c.risk===risk);
  if(item&&!used.has(book+'|'+risk)){out.push(item);used.add(book+'|'+risk)}
 }
 return out.slice(0,Math.max(0,Math.min(3,Math.floor(max)||0)));
}
