import {list,put} from '@vercel/blob';
// ScrapingBee is strictly change-triggered; no public browsing endpoint or routine credit spending.
const BOOKS={draftkings:'https://sportsbook.draftkings.com/',fanduel:'https://sportsbook.fanduel.com/'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(403).json({ok:false,error:'authorized_change_refresh_required'});
 const gameId=String(req.body?.gameId||'');
 if(!/^\\d{6,12}$/.test(gameId))return res.status(400).json({ok:false,error:'invalid_game_id'});
 const book=String(req.body?.book||'').toLowerCase();
 if(!BOOKS[book])return res.status(400).json({ok:false,error:'unsupported_book'});
 const target=String(req.body?.url||'');
 let parsed;try{parsed=new URL(target)}catch{return res.status(400).json({ok:false,error:'invalid_url'})}
 const allowed=new URL(BOOKS[book]);
 if(parsed.protocol!=='https:'||parsed.hostname!==allowed.hostname||parsed.username||parsed.password||parsed.port)return res.status(400).json({ok:false,error:'book_url_not_allowed'});
 const eventToken=String(req.headers['x-momentum-change-token']||'');
 if(!/^[a-f0-9]{64}$/.test(eventToken))return res.status(403).json({ok:false,error:'verified_change_token_required'});
 const tokenPath='momentum-nfl-change-tokens/v1/'+eventToken+'.json';
 let tokenRecord=null;
 try{const records=await list({prefix:tokenPath,limit:5});const item=records.blobs?.find(x=>x.pathname===tokenPath);if(item){const response=await fetch(item.url,{signal:AbortSignal.timeout(2500)});if(response.ok)tokenRecord=await response.json()}}catch{return res.status(503).json({ok:false,error:'change_token_store_unavailable'})}
 if(!tokenRecord||tokenRecord.usedAt||Date.now()-Date.parse(tokenRecord.createdAt)>15*60*1000||tokenRecord.gameId!==gameId)return res.status(403).json({ok:false,error:'change_token_invalid_or_used'});
 if(!process.env.SCRAPINGBEE_API_KEY)return res.status(503).json({ok:false,error:'scrapingbee_not_configured'});
 // One atomic claim per verified change, sportsbook, and URL. A retry fails closed.
 const {createHash}=await import('node:crypto');
 const digest=createHash('sha256').update(target).digest('hex');
 // One paid fetch per sportsbook per verified event, regardless of requested page URL.
 const claimPath='momentum-scrapingbee-claims/v1/'+eventToken+'/'+book+'.json';
 try{await put(claimPath,JSON.stringify({gameId,book,claimedAt:new Date().toISOString()}),{access:'public',addRandomSuffix:false,allowOverwrite:false})}catch{return res.status(409).json({ok:false,error:'change_already_claimed_or_claim_store_unavailable'})}
 try{
  const endpoint=new URL('https://app.scrapingbee.com/api/v1/');
  endpoint.searchParams.set('api_key',process.env.SCRAPINGBEE_API_KEY);
  endpoint.searchParams.set('url',target);
  endpoint.searchParams.set('render_js','false'); // Minimum-cost mode; never enable premium proxy or JS rendering automatically.
  endpoint.searchParams.set('block_resources','true');
  const response=await fetch(endpoint,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  if(!response.ok)return res.status(502).json({ok:false,error:'provider_request_failed',providerStatus:response.status});
  const html=(await response.text()).slice(0,500000);
  // Never label extracted text as a verified player offer until a separate parser checks identity, market, line, and price.
  const cachePath='momentum-scrapingbee-evidence/v1/'+eventToken+'/'+book+'-'+digest+'.json';
  await put(cachePath,JSON.stringify({gameId,book,url:target,html,fetchedAt:new Date().toISOString(),verifiedOffers:[]}),{access:'public',addRandomSuffix:false,allowOverwrite:true});
  return res.status(200).json({ok:true,book,evidenceCached:true,verifiedOffers:0,creditsPolicy:'verified_change_only'});
 }catch{return res.status(502).json({ok:false,error:'provider_or_evidence_store_unavailable'})}
}
