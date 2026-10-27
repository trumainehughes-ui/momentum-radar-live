import {draftKingsCategoryUrl,normalizeDraftKingsSelections} from '../lib/draftkings-public-market-adapter.js';
// Research-only DraftKings public feed adapter. Does not bypass access controls.
export default async function handler(req,res){
 if(req.method!=='GET'){res.setHeader('Allow','GET');return res.status(405).json({ok:false,error:'METHOD_NOT_ALLOWED'});}
 const categoryId=String(req.query?.categoryId||'');
 const subcategoryId=String(req.query?.subcategoryId||'');
 let url;
 try{url=draftKingsCategoryUrl({categoryId,subcategoryId});}
 catch{return res.status(400).json({ok:false,error:'INVALID_MARKET_ID'});}
 try{
  const upstream=await fetch(url,{signal:AbortSignal.timeout(6500),headers:{accept:'application/json'}});
  if(!upstream.ok)return res.status(503).json({ok:false,error:'DRAFTKINGS_PUBLIC_FEED_UNAVAILABLE',upstreamStatus:upstream.status,offers:[],sportsbookVerified:false});
  const payload=await upstream.json();
  const result=normalizeDraftKingsSelections(payload,{observedAt:new Date().toISOString(),categoryId,subcategoryId});
  if(!result.ok)return res.status(503).json({...result,sportsbookVerified:false});
  return res.status(200).json({...result,league:'NFL',sportsbookVerified:result.offers.length>0,
   disclaimer:'Individual sportsbook selections only. No verified same-game parlay combined price.'});
 }catch{return res.status(503).json({ok:false,error:'DRAFTKINGS_PUBLIC_FEED_UNAVAILABLE',offers:[],sportsbookVerified:false});}
}
