// Optional AI incident analysis. This endpoint never changes prices, eligibility or parlays.
export default async function handler(req,res){
 if(req.method!=='POST')return res.status(405).json({ok:false,error:'method_not_allowed'});
 const key=process.env.GROQ_API_KEY||process.env.GROQ_API_TOKEN;
 if(!key)return res.status(503).json({ok:false,error:'ai_not_configured'});
 const input=req.body||{};
 const diagnostic={endpoint:String(input.endpoint||'/api/nfl-markets').slice(0,120),error:String(input.error||'market_refresh_timeout').slice(0,500),durationMs:Math.max(0,Math.min(300000,Number(input.durationMs)||0)),providerStage:String(input.providerStage||'unknown').slice(0,100),marketCount:Math.max(0,Number(input.marketCount)||0),recentTimeouts:Math.max(0,Number(input.recentTimeouts)||0)};
 try{
  const response=await fetch('https://api.groq.com/openai/v1/chat/completions',{method:'POST',signal:AbortSignal.timeout(7000),headers:{authorization:'Bearer '+key,'content-type':'application/json'},body:JSON.stringify({model:process.env.GROQ_MODEL||'llama-3.3-70b-versatile',temperature:0,max_tokens:450,messages:[{role:'system',content:'You are a production incident triage assistant. Given only sanitized operational signals, identify likely causes, next safe tests and mitigations. Do not claim a fix is verified, invent sportsbook odds, or suggest changing live bets. Return concise plain text.'},{role:'user',content:JSON.stringify(diagnostic)}]})});
  if(!response.ok)return res.status(502).json({ok:false,error:'ai_provider_'+response.status});
  const data=await response.json();return res.status(200).json({ok:true,diagnostic,analysis:String(data.choices?.[0]?.message?.content||'').slice(0,3000),advisoryOnly:true});
 }catch(e){return res.status(503).json({ok:false,error:e?.name==='TimeoutError'?'ai_timeout':'ai_unavailable'});}
}
