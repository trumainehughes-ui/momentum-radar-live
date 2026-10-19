// Isolated ChatGPT plugin research inbox. Never turns projections into sportsbook offers.
import {put} from '@vercel/blob';
import {timingSafeEqual,randomUUID,randomBytes,createHash,createCipheriv} from 'node:crypto';
const allowed=new Set(['DraftKings','Optimal Sports Projections']);
function auth(a,b){if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function validateResearch(body){
 if(!body||typeof body!=='object'||Array.isArray(body))throw Error('invalid_payload');
 if(!allowed.has(body.provider))throw Error('unsupported_provider');
 if(!['NFL','NBA'].includes(body.league))throw Error('unsupported_league');
 if(typeof body.gameId!=='string'||!/^[a-zA-Z0-9_-]{5,64}$/.test(body.gameId))throw Error('invalid_game_id');
 if(typeof body.observedAt!=='string'||!Number.isFinite(Date.parse(body.observedAt)))throw Error('invalid_timestamp');
 const observationTime=Date.parse(body.observedAt);
 if(observationTime>Date.now()+5*60_000||Date.now()-observationTime>48*3600000)throw Error('stale_observation');
 if(!Array.isArray(body.observations)||body.observations.length<1||body.observations.length>30)throw Error('invalid_observations');
 const observations=body.observations.map(o=>{
  if(!o||typeof o!=='object'||Array.isArray(o))throw Error('invalid_observation');
  if(!['player_projection','player_history','team_stat','game_projection','schedule','injury_context'].includes(o.type))throw Error('invalid_observation_type');
  if(typeof o.subject!=='string'||o.subject.length<2||o.subject.length>100)throw Error('invalid_subject');
  if(typeof o.description!=='string'||o.description.length<2||o.description.length>600)throw Error('invalid_description');
  if(typeof o.sourceReference!=='string'||o.sourceReference.length<3||o.sourceReference.length>300)throw Error('missing_source_reference');
  return {type:o.type,subject:o.subject,description:o.description,sourceReference:o.sourceReference};
 });
 return {schemaVersion:1,provider:body.provider,league:body.league,gameId:body.gameId,observedAt:new Date(body.observedAt).toISOString(),receivedAt:new Date().toISOString(),observations,classification:'RESEARCH_ONLY_NOT_SPORTSBOOK_OFFER',sportsbookVerified:false,combinedSgpOdds:null};
}
export function sealResearch(data,secret){
 const key=createHash('sha256').update('momentum-plugin-research-v1:').update(secret).digest();
 const iv=randomBytes(12);
 const cipher=createCipheriv('aes-256-gcm',key,iv);
 const ciphertext=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]);
 return {format:'AES-256-GCM',version:1,iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64'),ciphertext:ciphertext.toString('base64')};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const secret=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 if(!secret||secret.length<32)return res.status(503).json({ok:false,error:'ingest_not_configured'});
 const token=(req.headers.authorization||'').replace(/^Bearer\s+/i,'');
 if(!auth(token,secret))return res.status(401).json({ok:false,error:'unauthorized'});
 let bodySize;try{bodySize=JSON.stringify(req.body??null).length;}catch{return res.status(400).json({ok:false,error:'invalid_payload'});}
 if(Number(req.headers['content-length']||0)>20000||bodySize>20000)return res.status(413).json({ok:false,error:'payload_too_large'});
 let data;try{data=validateResearch(req.body);}catch(e){return res.status(400).json({ok:false,error:e.message});}
 if(!process.env.BLOB_READ_WRITE_TOKEN)return res.status(503).json({ok:false,error:'research_storage_not_configured'});
 try{
  const id=randomUUID();
  const path='momentum-plugin-research/v1/'+data.league.toLowerCase()+'/'+data.gameId+'/'+id+'.json';
  const sealed=sealResearch(data,secret);
  await put(path,JSON.stringify(sealed),{access:'public',addRandomSuffix:false,contentType:'application/json'});
  return res.status(202).json({ok:true,recordId:id,classification:data.classification,usedForSportsbookOdds:false,note:'Research stored for future reviewed ingestion; not automatically used by the SGP engine.'});
 }catch{return res.status(503).json({ok:false,error:'storage_unavailable'});}
}
