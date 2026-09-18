import { put, list } from '@vercel/blob';
const P='nfl-pregame/v1';
function path(gameId){return P+'/'+gameId+'.json'}
export async function read(gameId){const x=await list({prefix:path(gameId),limit:5});const b=x.blobs?.find(v=>v.pathname===path(gameId));if(!b)return null;const r=await fetch(b.url,{cache:'no-store'});return r.ok?r.json():null}
export default async function handler(req,res){res.setHeader('Cache-Control','no-store');const gameId=String(req.query.gameId||'');if(!gameId)return res.status(400).json({available:false,error:'gameId_required'});if(req.method==='GET'){const s=await read(gameId);return res.status(s?200:404).json(s?{available:true,snapshot:s}:{available:false,reason:'no_verified_pregame_snapshot'})}return res.status(405).json({available:false,error:'method_not_allowed'})}
// Snapshot writes are intentionally not inferred from live results. A future verified pregame model writer must persist
// season+week+gameId+playerId+market before kickoff. The live tracker may award a star ONLY from that immutable snapshot.
