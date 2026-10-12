import nflLiveHandler from './nfl-live.js';

// Preserve the authoritative TD scorer / pregame star matching already used
// by the owner's dashboard, but return only safe fan-facing result fields.
export function publicLiveTouchdowns(body,gameId){
 if(body?.ok!==true||String(body.gameId)!==String(gameId))return{
  ok:false,status:'UNAVAILABLE',touchdowns:[]};
 return{ok:true,gameId:String(gameId),status:String(body.status||'').slice(0,60),
  fetchedAt:String(body.fetchedAt||'').slice(0,40),
  touchdowns:(Array.isArray(body.touchdowns)?body.touchdowns:[]).slice(0,24)
   .filter(x=>x?.name&&x?.text)
   .map(x=>({name:String(x.name).slice(0,90),
    description:String(x.text).replace(/https?:\/\/\S+/gi,'').slice(0,220),
    period:Number.isInteger(x.period)?x.period:null,
    clock:String(x.clock||'').slice(0,16),
    star:x.star===true}))};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','public, s-maxage=20, must-revalidate');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const id=String(req.query?.gameId||'');
 if(!/^\d{7,12}$/.test(id))return res.status(400).json({ok:false,error:'invalid_game_id'});
 let status=200;
 const wrapped={
  setHeader(){},
  status(n){status=n;return this},
  json(data){if(status!==200)return res.status(503).json({ok:false,error:'live_scores_unavailable'});
   return res.status(200).json(publicLiveTouchdowns(data,id))}
 };
 try{return await nflLiveHandler({method:'GET',query:{gameId:id}},wrapped)}
 catch{return res.status(503).json({ok:false,error:'live_scores_unavailable'})}
}
