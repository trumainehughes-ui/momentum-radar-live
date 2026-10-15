// Adapter for the existing Groq/OpenRouter advisory endpoint.
// The caller must supply a trusted server-side URL and authenticated request path.
// Never expose credentials in the browser or treat generated text as verified odds.
export function createManualAiAdapter({fetcher,endpoint,timeoutMs=10000}) {
 if(typeof fetcher!=='function'||typeof endpoint!=='string'||!endpoint.startsWith('https://'))
  throw Error('trusted_ai_endpoint_required');
 return async function reviewAi({mode,gameId,evidenceDigest,data}) {
  if(!['parlay','nbaPregame'].includes(mode)||!/^\d{7,12}$/.test(String(gameId))||
     !/^[a-f0-9]{64}$/.test(String(evidenceDigest)))throw Error('invalid_ai_review_request');
  const response=await fetcher(endpoint,{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({mode,data}),signal:AbortSignal.timeout(timeoutMs)
  });
  if(!response.ok)throw Error('ai_provider_http_'+response.status);
  const result=await response.json();
  if(result.ok!==true||result.aiAvailable!==true||!String(result.analysis||'').trim())
   throw Error('ai_provider_not_verified_available');
  // This envelope binds the response to the submitted evidence; the text remains
  // an advisory only. No AI-authored player, odds or threshold edits are accepted.
  return {gameId:String(gameId),evidenceDigest,summary:String(result.analysis).slice(0,1200),
   provider:result.provider||null};
 };
}
