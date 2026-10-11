import {list,put} from '@vercel/blob';
// ScrapingBee is strictly change-triggered; no public browsing endpoint or routine credit spending.
const BOOKS={draftkings:'https://sportsbook.draftkings.com/',fanduel:'https://sportsbook.fanduel.com/'};
export default async function handler(req,res){
 res.setHeader('Cache-Control','private, no-store');
 if(req.method==='GET'&&req.query?.health==='1')
  return res.status(200).json({ok:true,mode:'no_credit_health',providerConfigured:Boolean(process.env.SCRAPINGBEE_API_KEY),changeTokenRequired:true,paidRequestExecuted:false,creditCapEnforced:false});
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(403).json({ok:false,error:'authorized_change_refresh_required'});
 const gameId=String(req.body?.gameId||'');
 if(!new RegExp('^[0-9]{6,12}$').test(gameId))return res.status(400).json({ok:false,error:'invalid_game_id'});
 const book=String(req.body?.book||'').toLowerCase();
 if(!BOOKS[book])return res.status(400).json({ok:false,error:'unsupported_book'});
 // The paid request must target the same game as the verified change.
 const target=String(req.body?.url||'');
 let parsed;try{parsed=new URL(target)}catch{return res.status(400).json({ok:false,error:'invalid_url'})}
 const allowed=new URL(BOOKS[book]);
 // Explicit match identifiers prevent a verified event from funding unrelated browsing.
 const expectedEvent=String(req.body?.eventId||'');
 if(expectedEvent!==gameId)return res.status(400).json({ok:false,error:'event_id_mismatch'});
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
  // Diagnostic and production requests must stay in the lowest-cost mode.
  endpoint.searchParams.set('premium_proxy','false');
  endpoint.searchParams.set('stealth_proxy','false');
  const response=await fetch(endpoint,{redirect:'manual',signal:AbortSignal.timeout(12000)});
  const creditsCharged=Number(response.headers.get('spb-cost')||0);
  const resolvedUrl=String(response.headers.get('spb-resolved-url')||'');
  let resolvedHost='';
  try{resolvedHost=new URL(resolvedUrl).hostname}catch{}
  if(resolvedHost&&resolvedHost!==allowed.hostname)
   return res.status(422).json({ok:false,error:'provider_redirected_outside_expected_sportsbook',creditsCharged});
  if(!response.ok)return res.status(502).json({ok:false,error:'provider_request_failed',providerStatus:response.status,creditsCharged});
  const contentType=String(response.headers.get('spb-content-type')||response.headers.get('content-type')||'').toLowerCase();
  if(!contentType.includes('text/html')&&!contentType.includes('application/xhtml+xml'))
   return res.status(422).json({ok:false,error:'non_html_sportsbook_response'});
  const html=(await response.text()).slice(0,500000);
  // Extract only structured JSON-LD sportsbook offers; never infer odds from free-form HTML or AI.
  const extracted=[];
  const ldJsonPattern=/<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  for(const match of html.matchAll(ldJsonPattern)){
   try{
    const parsed=JSON.parse(match[1]);
    const queue=Array.isArray(parsed)?[...parsed]:[parsed];
    while(queue.length&&extracted.length<100){
     const node=queue.shift();if(!node||typeof node!=='object')continue;
     if(Array.isArray(node)){queue.push(...node.slice(0,50));continue;}
     if(node['@graph'])queue.push(node['@graph']);
     const name=String(node.name||'').slice(0,160);
     const price=node.offers?.price??node.price;
     if(name&&price!=null&&Number.isFinite(Number(price)))extracted.push({name,price:Number(price),source:'json_ld_unverified'});
    }
   }catch{}
  }
  // Structured page metadata is evidence only; bookmaker player, line, market and price must all be cross-checked.
  const cachePath='momentum-scrapingbee-evidence/v1/'+eventToken+'/'+book+'-'+digest+'.json';
  await put(cachePath,JSON.stringify({gameId,book,url:target,extracted,htmlLength:html.length,fetchedAt:new Date().toISOString(),verifiedOffers:[]}),{access:'public',addRandomSuffix:false,allowOverwrite:true});
  return res.status(200).json({ok:true,book,evidenceCached:true,structuredCandidates:extracted.length,verifiedOffers:0,creditsCharged,creditsPolicy:'verified_change_only'});
 }catch{return res.status(502).json({ok:false,error:'provider_or_evidence_store_unavailable'})}
}
