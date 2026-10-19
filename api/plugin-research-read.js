// Read-only authenticated consumer for encrypted plugin research.
// Never feeds raw research into sportsbook offer or SGP verification.
import {list} from '@vercel/blob';
import {createHash,createDecipheriv,timingSafeEqual} from 'node:crypto';
import {buildPluginProjectionContext} from '../lib/plugin-projection-context.js';
function authorized(a,b){if(!a||!b)return false;const x=Buffer.from(a),y=Buffer.from(b);return x.length===y.length&&timingSafeEqual(x,y);}
export function trustedResearchBlob(blob,prefix){
 if(typeof blob?.pathname!=='string'||!blob.pathname.startsWith(prefix))return false;
 try{const u=new URL(blob.url);
  return u.protocol==='https:'&&u.username===''&&u.password===''&&u.port===''&&
   /^[a-z0-9-]+\\.public\\.blob\\.vercel-storage\\.com$/i.test(u.hostname)&&
   u.pathname.endsWith('/'+blob.pathname)&&u.search===''&&u.hash==='';
 }catch{return false;}
}
export function unsealResearch(sealed,secret){
 if(sealed?.format!=='AES-256-GCM'||sealed.version!==1)throw Error('unsupported_envelope');
 const key=createHash('sha256').update('momentum-plugin-research-v1:').update(secret).digest();
 const iv=Buffer.from(sealed.iv,'base64'),tag=Buffer.from(sealed.tag,'base64');
 if(iv.length!==12||tag.length!==16)throw Error('invalid_envelope');
 const decipher=createDecipheriv('aes-256-gcm',key,iv);decipher.setAuthTag(tag);
 const raw=Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext,'base64')),decipher.final()]);
 const data=JSON.parse(raw.toString('utf8'));
 if(data.classification!=='RESEARCH_ONLY_NOT_SPORTSBOOK_OFFER'||data.sportsbookVerified!==false||data.combinedSgpOdds!==null)throw Error('invalid_classification');
 return data;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const secret=process.env.MOMENTUM_RESEARCH_INGEST_KEY;
 if(!secret)return res.status(503).json({ok:false,error:'research_not_configured'});
 if(!authorized(String(req.headers.authorization||'').replace(/^Bearer\s+/i,''),secret))return res.status(401).json({ok:false,error:'unauthorized'});
 const league=String(req.query?.league||'').toLowerCase(),gameId=String(req.query?.gameId||'');
 if(!['nfl','nba'].includes(league)||!/^[a-zA-Z0-9_-]{5,64}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_query'});
 try{
  const prefix='momentum-plugin-research/v1/'+league+'/'+gameId+'/';
  const {blobs}=await list({prefix,limit:20});
  const records=[];
  for(const b of (blobs||[]).slice(0,20)){
   if(!trustedResearchBlob(b,prefix))continue;
   try{
    const response=await fetch(b.url,{signal:AbortSignal.timeout(2500),cache:'no-store',redirect:'error'});
    if(!response.ok)continue;
    const raw=await response.text();if(raw.length>24000)continue;
    const data=unsealResearch(JSON.parse(raw),secret);
    if(data.league.toLowerCase()===league&&data.gameId===gameId)records.push(data);
   }catch{/* Skip invalid or tampered entries. */}
  }
  const projectionContext=buildPluginProjectionContext(records,{league,gameId});
  return res.status(200).json({ok:true,league,gameId,recordCount:records.length,projectionContext,classification:'RESEARCH_ONLY',sportsbookVerified:false,combinedSgpOdds:null,note:'Authenticated research context; not wired to live predictions or sportsbook quote publication.'});
 }catch{return res.status(503).json({ok:false,error:'research_read_unavailable'});}
}
