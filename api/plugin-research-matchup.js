// Authenticated preview-only adapter; research notes cannot become sportsbook offers.
import {timingSafeEqual} from 'node:crypto';
import {readPluginResearchContext} from './plugin-research-read.js';
import {attachPluginResearchToMatchup} from '../lib/plugin-projection-context.js';
function authorized(a,b){if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const secret=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 if(!secret||secret.length<32)return res.status(503).json({ok:false,error:'research_not_configured'});
 const token=String(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!authorized(token,secret))return res.status(401).json({ok:false,error:'unauthorized'});
 let size;try{size=JSON.stringify(req.body??null).length;}catch{return res.status(400).json({ok:false,error:'invalid_payload'});}
 if(Number(req.headers['content-length']||0)>24000||size>24000)return res.status(413).json({ok:false,error:'payload_too_large'});
 const {league,gameId,matchup}=req.body||{};
 if(!['NFL','NBA'].includes(league)||typeof gameId!=='string'||!/^[a-zA-Z0-9_-]{5,64}$/.test(gameId)||
 !matchup||typeof matchup!=='object'||Array.isArray(matchup)||
 (matchup.gameId!==undefined&&String(matchup.gameId)!==gameId)||
 (matchup.league!==undefined&&String(matchup.league).toUpperCase()!==league))return res.status(400).json({ok:false,error:'invalid_matchup_request'});
 if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({ok:false,error:'research_storage_not_configured'});
 try{
  const {projectionContext}=await readPluginResearchContext({league:league.toLowerCase(),gameId,secret});
  const annotated=attachPluginResearchToMatchup(matchup,projectionContext,{league,gameId});
  return res.status(200).json({ok:true,matchup:annotated,researchOnly:true,
   sportsbookVerifiedByResearch:false,readyForAutomaticPublishing:false});
 }catch{return res.status(503).json({ok:false,error:'research_matchup_unavailable'});}
}
