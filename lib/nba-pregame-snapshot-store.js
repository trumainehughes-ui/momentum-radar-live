// NBA pregame owner/visitor versions use one append-only event namespace.
// Version keys sort newest first. No mutable Blob CDN overwrite can revive
// an older player projection or injury report on a separate server instance.
import {list,put} from '@vercel/blob';
const ROOT='momentum-pregame/v1/';
const validId=id=>/^\d{7,12}$/.test(String(id||''));
export function nbaLegacyPregamePath(gameId){
 return validId(gameId)?ROOT+'nba-'+String(gameId)+'.json':null;
}
export function nbaPregameVersionPrefix(gameId){
 return validId(gameId)?ROOT+'nba-'+String(gameId)+'/':null;
}
export function nbaPregameVersionPath(gameId,checkedAt,nonce=''){
 const prefix=nbaPregameVersionPrefix(gameId),at=Date.parse(String(checkedAt||''));
 if(!prefix||!Number.isFinite(at)||at<=0||at>9999999999999)return null;
 const reverse=String(9999999999999-at).padStart(13,'0');
 const suffix=String(nonce||'').replace(/[^a-z0-9_-]/gi,'').slice(0,24);
 return prefix+reverse+(suffix?'-'+suffix:'')+'.json';
}
export async function nbaFindLatestPregameBlob(gameId,{listBlobs=list}={}){
 const prefix=nbaPregameVersionPrefix(gameId);
 if(!prefix)return null;
 const page=await listBlobs({prefix,limit:10});
 const versions=(page?.blobs||[]).filter(b=>
   String(b.pathname||'').startsWith(prefix)&&
   /[0-9]{13}(?:-[a-zA-Z0-9_-]+)?[.]json$/.test(b.pathname))
   .sort((a,b)=>a.pathname.localeCompare(b.pathname));
 if(versions.length)return versions[0];
 // During rollout, accept the prior single-file snapshot only if no
 // immutable version exists for this game. Never prefer legacy thereafter.
 const legacy=nbaLegacyPregamePath(gameId);
 const old=await listBlobs({prefix:legacy,limit:3});
 return(old?.blobs||[]).find(b=>b.pathname===legacy)||null;
}
export async function nbaWritePregameSnapshot(snapshot,{
  putBlob=put,nonce=Math.random().toString(36).slice(2,12)
}={}){
 const name=nbaPregameVersionPath(snapshot?.gameId,snapshot?.checkedAt,nonce);
 if(!name||!Array.isArray(snapshot?.sgps))throw Error('nba_invalid_pregame_snapshot');
 await putBlob(name,JSON.stringify(snapshot),{access:'public',addRandomSuffix:false});
 return {pathname:name,version:snapshot.checkedAt};
}
