import historyHandler from './nfl-game.js';

// Reuse the existing read-only game history list and selectively expose
// finished results. Never pass through raw snapshot picks, identifiers,
// internal source records or writable maintenance routes.
export function safePublicNflHistory(data){
 if(data?.ok!==true)return{ok:false,history:[]};
 const archive=(Array.isArray(data.archive)?data.archive:[])
  .filter(x=>x?.league==='nfl'&&/^\d{7,12}$/.test(String(x?.gameId||'')))
  .slice(0,30).map(x=>({gameId:String(x.gameId),
   score:String(x.score||'').slice(0,110),
   playerHits:Math.max(0,Math.floor(Number(x.playerHits)||0)),
   playerTotal:Math.max(0,Math.floor(Number(x.playerTotal)||0)),
   sgpHits:Math.max(0,Math.floor(Number(x.sgpHits)||0)),
   sgpTotal:Math.max(0,Math.floor(Number(x.sgpTotal)||0)),
   tiers:Object.fromEntries(['Small','Medium','Nuke'].map(r=>{
    const q=x?.tiers?.[r]||{};
    return[r,{hits:Math.max(0,Math.floor(Number(q.hits)||0)),
     total:Math.max(0,Math.floor(Number(q.total)||0))}];
   }))}));
 return{ok:true,archive};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=120, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 let status=200;
 const wrap={setHeader(){},status(n){status=n;return this},
  json(data){return res.status(status===200?200:503).json(safePublicNflHistory(data))}};
 try{return await historyHandler({method:'GET',query:{mode:'history-list'}},wrap)}
 catch{return res.status(503).json({ok:false,error:'history_temporarily_unavailable'})}
}
