import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/ai-analysis.js';

const oldGroq=process.env.GROQ_API_KEY,oldOpenRouter=process.env.OPENROUTER_API_KEY;
const oldFetch=globalThis.fetch;
const answer=(value='Evidence-bound response.')=>({ok:true,status:200,json:async()=>({choices:[{message:{content:value}}]})});
const fail=(status,code='unknown')=>({ok:false,status,json:async()=>({error:{code}})});
const req=(id,mode='matchup',extra={})=>({
 method:'POST',headers:{'x-forwarded-for':'openrouter-test-'+id},
 body:{mode,data:{gameId:id,game:{homeAbbr:'JAX',awayAbbr:'PHI'},...extra}}
});
function res(){return{code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
 status(n){this.code=n;return this},json(x){this.body=x;return this}}}
function keys(groq=true,backup=true){
 if(groq)process.env.GROQ_API_KEY='fake-groq-key';
 else delete process.env.GROQ_API_KEY;
 if(backup)process.env.OPENROUTER_API_KEY='fake-openrouter-key';
 else delete process.env.OPENROUTER_API_KEY;
}
test('healthy Groq stays primary and second request uses provider-labeled cache',async()=>{
 keys();
 const seen=[];
 globalThis.fetch=async(url,opts)=>{
  seen.push({url,body:JSON.parse(opts.body),headers:opts.headers});
  return answer('Verified sources must be checked.');
 };
 const a=res();await handler(req('backup-primary-happy'),a);
 assert.equal(a.code,200);
 assert.equal(a.body.provider,'groq');
 assert.equal(a.body.backupUsed,false);
 assert.equal(a.body.model,'openai/gpt-oss-20b');
 assert.equal(seen.length,1);
 assert.match(seen[0].url,/api\.groq\.com/);
 const second=res();await handler(req('backup-primary-happy'),second);
 assert.equal(second.code,200);
 assert.equal(second.body.cached,true);
 assert.equal(second.body.provider,'groq');
 assert.equal(seen.length,1);
});
test('Groq HTTP 500 activates OpenRouter only once and preserves identical evidence + system safeguards',async()=>{
 keys();const calls=[];
 globalThis.fetch=async(url,opts)=>{
  const obj=JSON.parse(opts.body);
  calls.push({url,model:obj.model,messages:obj.messages,headers:opts.headers});
  return url.includes('groq.com')?fail(500):answer('Same model evidence was reviewed.');
 };
 const r=res();await handler(req('backup-groq-500','nuke',{sgps:[{source:'Analytics',risk:'Nuke',legs:[]}]}),r);
 assert.equal(r.code,200);
 assert.equal(r.body.provider,'openrouter');
 assert.equal(r.body.backupUsed,true);
 assert.equal(r.body.model,'openai/gpt-4.1-mini');
 assert.equal(r.body.mechanics.mode,'nuke');
 assert.equal(r.body.mechanics.canChangePicks,false);
 assert.equal(r.body.verified,false);
 assert.equal(calls.length,2);
 assert.match(calls[0].url,/api.groq.com/);
 assert.equal(calls[1].url,'https://openrouter.ai/api/v1/chat/completions');
 assert.equal(calls[1].model,'openai/gpt-4.1-mini');
 assert.equal(calls[1].headers.Authorization,'Bearer fake-openrouter-key');
 assert.deepEqual(calls[0].messages,calls[1].messages,'providers must see identical system rules and evidence');
 assert.match(calls[1].messages[0].content,/never.*invent|Never invent/i);
 assert.doesNotMatch(JSON.stringify(r.body),/fake-groq-key|fake-openrouter-key/);
 const cached=res();await handler(req('backup-groq-500','nuke',{sgps:[{source:'Analytics',risk:'Nuke',legs:[]}]}),cached);
 assert.equal(cached.body.cached,true);
 assert.equal(cached.body.provider,'openrouter');
 assert.equal(calls.length,2);
});
test('invalid primary prompt (HTTP 400) must not spend backup credit',async()=>{
 keys();let calls=0;
 globalThis.fetch=async()=>{calls++;return fail(400,'bad_request')};
 const r=res();await handler(req('backup-invalid-groq-payload'),r);
 assert.equal(r.code,502);
 assert.equal(r.body.error,'provider_request_rejected');
 assert.equal(calls,1);
});
test('empty Groq output triggers one backup attempt',async()=>{
 keys();let calls=0;
 globalThis.fetch=async url=>{calls++;return url.includes('groq')?{ok:true,json:async()=>({choices:[]})}:answer('Backup is available.')};
 const r=res();await handler(req('backup-empty-primary'),r);
 assert.equal(r.code,200);
 assert.equal(r.body.provider,'openrouter');
 assert.equal(calls,2);
});
test('backup output passes the SAME player-role safety gate',async()=>{
 keys();let calls=0;
 globalThis.fetch=async url=>{calls++;return url.includes('groq')?fail(502):answer("The RB Jalen Hurts has 30 rushing yards.")};
 const r=res();await handler(req('backup-unsafe-role','matchup',{
  playerRoleFacts:[{name:'Jalen Hurts',position:'QB',team:'PHI'}]
 }),r);
 assert.equal(r.code,422);
 assert.equal(r.body.error,'ai_role_mismatch');
 assert.equal(calls,2);
});
test('backup output passes source rank correction, never changes projection engine',async()=>{
 keys();
 globalThis.fetch=async url=>url.includes('groq')?fail(503):answer('JAX allowed 47.5 yards (rank 13).');
 const r=res();await handler(req('backup-rank-correct','matchup',{
  matchup:{sides:[{positions:[{position:'RB',metrics:[{metric:'rushYards',
   defenseAllowedPerGame:47.5,defenseRankMost:32}]}]}]}
 }),r);
 assert.equal(r.code,200);
 assert.equal(r.body.provider,'openrouter');
 assert.equal(r.body.sourceRankCorrections,1);
 assert.match(r.body.analysis,/47\.5 yards \(rank 32\)/);
});
test('OpenRouter can be primary availability fallback if Groq key is absent',async()=>{
 keys(false,true);let calls=0;
 globalThis.fetch=async(url,opts)=>{calls++;assert.match(url,/openrouter\.ai/);return answer('Backup available without primary.')};
 const r=res();await handler(req('backup-groq-missing'),r);
 assert.equal(r.code,200);
 assert.equal(r.body.provider,'openrouter');
 assert.equal(calls,1);
});
test('429 and Groq cooldown continue to use backup without retry storms',async()=>{
 keys();const urls=[];
 globalThis.fetch=async(url)=>{urls.push(url);return url.includes('groq')?fail(429,'rate_limit_exceeded'):answer('Backup served during primary hold.')};
 const first=res();await handler(req('backup-primary-rate-limited-a'),first);
 assert.equal(first.code,200);
 assert.equal(first.body.provider,'openrouter');
 const second=res();await handler(req('backup-primary-rate-limited-b'),second);
 assert.equal(second.code,200);
 assert.equal(second.body.provider,'openrouter');
 assert.equal(urls.filter(x=>x.includes('groq')).length,1,'primary retry should be cooled down');
 assert.equal(urls.filter(x=>x.includes('openrouter')).length,2);
});
test('when both AIs fail the endpoint returns a sanitized error and deterministic report',async()=>{
 keys();
 let backupAttempts=0;
 globalThis.fetch=async url=>{
  if(url.includes('openrouter')){backupAttempts++;return fail(429,'rate_limit_exceeded')}
  return fail(429,'rate_limit_exceeded');
 };
 const r=res();await handler(req('backup-both-down','guardian'),r);
 assert.equal(r.code,429);
 assert.equal(r.body.error,'ai_providers_unavailable');
 assert.equal(r.body.mechanics.mode,'guardian');
 assert.equal(r.body.mechanics.canChangePicks,false);
 assert.equal(r.body.verified,false);
 assert.ok(r.body.retryAfterSeconds>0);
 assert.equal(backupAttempts,1);
 assert.doesNotMatch(JSON.stringify(r.body),/fake-openrouter-key/);
});
test.after(()=>{
 globalThis.fetch=oldFetch;
 if(oldGroq===undefined)delete process.env.GROQ_API_KEY;else process.env.GROQ_API_KEY=oldGroq;
 if(oldOpenRouter===undefined)delete process.env.OPENROUTER_API_KEY;else process.env.OPENROUTER_API_KEY=oldOpenRouter;
});
