import {validateVerifiedChange,aiChangeImpact} from '../lib/ai-mechanics/nfl-change-impact.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(403).json({ok:false,error:'unauthorized'});
 const change=req.body?.change;
 const verified=validateVerifiedChange(change);
 if(!verified.ok)return res.status(422).json({ok:false,error:verified.reason,creditsUsed:0});
 const ai=await aiChangeImpact(change);
 return res.status(200).json({ok:true,gameId:change.gameId,changeType:change.type,verifiedEvidenceProvided:true,ai,creditsUsed:0,propLineRefreshAuthorized:false,workflow:'DVP and SGP recalculation require independent roster verification and explicit market-refresh gating'});
}
