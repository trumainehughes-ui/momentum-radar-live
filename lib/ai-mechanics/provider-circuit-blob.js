// Small cross-invocation circuit cache. Uses the Vercel Blob store already
// configured for NFL raw snapshots; never persists an upstream payload or key.
// Read failures are logged and fall back to the in-process circuit state.
import { list, put } from "@vercel/blob";
import { providerCircuit, activeProviderCircuit } from "./provider-circuit.js";

const PREFIX="momentum-nfl-provider-circuits/v1/";
const local=new Map();
const MEMO_MS=30000;
const pathFor=provider=>PREFIX+provider+".json";
export async function getProviderCircuit(provider,now=Date.now()) {
 const localEntry=local.get(provider);
 if(localEntry&&now-localEntry.checkedAt<MEMO_MS)
   return activeProviderCircuit(localEntry.record,provider,now);
 try{
   const path=pathFor(provider);
   const result=await list({prefix:path,limit:3});
   const file=result.blobs?.find(b=>b.pathname===path);
   if(!file){local.delete(provider);return null} // Do not memoize a miss: another function may open the circuit.
   const r=await fetch(file.url,{cache:"no-store"});
   if(!r.ok)throw Error("provider_circuit_read_"+r.status);
   const record=await r.json();
   local.set(provider,{record,checkedAt:now});
   return activeProviderCircuit(record,provider,now);
 }catch(e){
   console.warn("provider_circuit_read_unavailable",provider,String(e?.message||e));
   return activeProviderCircuit(localEntry?.record,provider,now);
 }
}
export async function storeProviderCircuit(provider,reason,backoffMs,now=Date.now()){
 const record=providerCircuit({provider,reason,backoffMs,now});
 if(!record)return null;
 local.set(provider,{record,checkedAt:now});
 try{
   await put(pathFor(provider),JSON.stringify(record),{
     access:"public",addRandomSuffix:false,allowOverwrite:true
   });
 }catch(e){
   console.warn("provider_circuit_write_unavailable",provider,String(e?.message||e));
 }
 return activeProviderCircuit(record,provider,now);
}
