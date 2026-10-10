import { buildNflPlayerResearchQueue } from "../lib/ai-mechanics/nfl-player-research.js";

// Pure planning endpoint, not an odds scraper. The client sends its *visible*
// NFL game/roster/model snapshot; none of these fields is treated as a
// bookmaker-issued quote. The server performs zero external requests here.
function respond(res,status,data){
 res.setHeader("Cache-Control","private, no-store");
 return res.status(status).json(data);
}
export default async function handler(req,res){
 if(req.method!=="POST")return respond(res,405,{ok:false,error:"method_not_allowed"});
 const origin=req.headers?.origin||"";
 if(origin)try{
  const h=new URL(origin).hostname;
  if(h!=="momentum-radar-live.vercel.app"&&
     !h.endsWith(".momentum-radar-live.vercel.app")&&
     !h.endsWith("-trumainehughes-6743.vercel.app"))
     return respond(res,403,{ok:false,error:"origin_not_allowed"});
 }catch{return respond(res,403,{ok:false,error:"origin_not_allowed"})}
 const payload=req.body||{};
 if(typeof payload!=="object"||Array.isArray(payload)||!payload)
   return respond(res,400,{ok:false,error:"structured_data_required"});
 let size=0;
 try{size=JSON.stringify(payload).length}catch{return respond(res,400,{ok:false,error:"invalid_json"})}
 if(size>35000)return respond(res,413,{ok:false,error:"payload_too_large"});
 const game=payload.game||{};
 if(!/^\d{5,15}$/.test(String(game.gameId||"")))
   return respond(res,400,{ok:false,error:"valid_game_id_required"});
 const researched=buildNflPlayerResearchQueue({
   game,categories:payload.categories||{},
   playerAvailability:payload.playerAvailability||{},
   marketEvidence:payload.marketEvidence||{},
   maxPlayers:10
 });
 return respond(res,200,{ok:true,...researched,
   evidenceBasis:"client_visible_snapshot_not_independently_refetched",
   liveSportsbookScraping:false,liveBookmakerOddsVerified:false
 });
}
