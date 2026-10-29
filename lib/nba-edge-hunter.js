// Deterministic NBA Edge Hunter research selector. No sportsbook quote is inferred.
const n=x=>x===null||x===undefined||x===''?NaN:Number(x);
const valid=x=>Number.isFinite(n(x));
const key=x=>String(x??'').trim();
export function selectNbaEdgeHunter(games,{minimumHitRate=.70,maxSpread=6}={}){
 const eligible=(Array.isArray(games)?games:[]).filter(g=>
  key(g.gameId)&&valid(g.total)&&valid(g.spread)&&Math.abs(n(g.spread))<maxSpread&&
  Array.isArray(g.players)).sort((a,b)=>n(b.total)-n(a.total)||key(a.gameId).localeCompare(key(b.gameId)));
 const selected=[];
 for(const game of eligible.slice(0,2)){
  const players=game.players.filter(p=>{
   const values=p.last10;
   if(!key(p.playerId)||!key(p.category)||!valid(p.prediction)||!valid(p.line)||n(p.line)<=0||
      !Array.isArray(values)||values.length!==10||values.some(v=>!valid(v))||
      p.starterVerified!==true||p.marketVerified!==true||p.injuryBlocked===true)return false;
   const rate=values.filter(v=>n(v)>n(p.line)).length/10;
   return rate>=minimumHitRate&&n(p.prediction)>n(p.line);
  }).map(p=>({...p,hitRate:p.last10.filter(v=>n(v)>n(p.line)).length/10,
   edge:(n(p.prediction)-n(p.line))/n(p.line)}))
   .sort((a,b)=>b.edge-a.edge||b.hitRate-a.hitRate||key(a.playerId).localeCompare(key(b.playerId)));
  const picks=[];
  for(const p of players){
   if(picks.some(x=>key(x.playerId)===key(p.playerId)))continue;
   // Points/PRA, rebounds/PRA, and similar overlapping player markets are not stacked.
   if(picks.some(x=>key(x.team)===key(p.team)&&key(x.category)===key(p.category)))continue;
   picks.push(p);
   if(picks.length===2)break;
  }
  if(picks.length===2)selected.push({gameId:key(game.gameId),total:n(game.total),spread:n(game.spread),legs:picks});
  // Do not replace an unqualified top-total game with a lower-total game.
 }
 const legs=selected.flatMap(x=>x.legs.map(p=>({gameId:x.gameId,playerId:key(p.playerId),
  name:key(p.name),team:key(p.team),category:key(p.category),line:n(p.line),
  prediction:n(p.prediction),hitRate:p.hitRate,edge:p.edge,marketVerified:true})));
 return {status:legs.length===4?'MODEL_RESEARCH':'NOT_READY',games:selected.map(x=>x.gameId),
  legs:legs.length===4?legs:[],publishable:false,combinedBookQuoteVerified:false,
  combinedBookOdds:null,reason:legs.length===4?
   'Four research legs only; verify actual book offers, selection IDs, and book-native combined SGP pricing before publication.':
   'Two eligible high-total close-spread games with two verified-market, starter-confirmed 70%-last-10 players each are required.'};
}
