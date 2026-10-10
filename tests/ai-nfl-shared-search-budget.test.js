import test from "node:test";
import assert from "node:assert/strict";
import {configuredNflSearchBudget,makeNflSharedSearchAuthorizer,
 NFL_BRAVE_SHARED_POLICY} from "../lib/ai-mechanics/nfl-shared-search-budget.js";
const env={UPSTASH_REDIS_REST_URL:"https://test-budget.upstash.io",
 UPSTASH_REDIS_REST_TOKEN:"redis-sensitive-token"};
const now=Date.parse("2026-10-10T18:00:00Z");
test("missing or invalid Redis setup can never authorize paid Brave search",async()=>{
 for(const bad of [{},{...env,UPSTASH_REDIS_REST_URL:"http://test-budget.upstash.io"},
  {...env,UPSTASH_REDIS_REST_URL:"https://test-budget.upstash.io.evil.com"},
  {...env,UPSTASH_REDIS_REST_TOKEN:""},
  {...env,UPSTASH_REDIS_REST_URL:"https://test-budget.upstash.io/path"},
  {...env,UPSTASH_REDIS_REST_URL:"https://user@test-budget.upstash.io"}]){
   assert.equal(configuredNflSearchBudget(bad),false);
   const a=makeNflSharedSearchAuthorizer({env:bad,fetcher:async()=>{
    throw Error("must not fetch");
   }});
   const result=await a({clientId:"10.0.0.1",apiKey:"brave-token"});
   assert.equal(result.allowed,false);
   assert.equal(result.reason,"search_budget_unconfigured");
 }
});
test("atomic EVAL checks global and per-client limits before incrementing",async()=>{
 let observed=null;
 const authorize=makeNflSharedSearchAuthorizer({env,clock:()=>now,
  fetcher:async(url,options)=>{
    observed={url,options};
    return {ok:true,json:async()=>({result:[1,4,2]})};
  }
 });
 const a=await authorize({clientId:"10.2.3.4",apiKey:"brave-secret"});
 assert.equal(a.allowed,true);
 assert.equal(a.reason,"shared_budget_reserved");
 const url=new URL(observed.url);
 assert.equal(url.hostname,"test-budget.upstash.io");
 assert.equal(url.pathname,"/");
 assert.equal(observed.options.method,"POST");
 assert.equal(observed.options.headers.Authorization,"Bearer redis-sensitive-token");
 assert.equal(observed.options.redirect,"error");
 assert.equal(observed.options.cache,"no-store");
 const cmd=JSON.parse(observed.options.body);
 assert.equal(cmd[0],"EVAL");
 assert.equal(cmd[2],"2");
 assert.match(cmd[1],/if g >= tonumber\(ARGV\[1\]\) then return \{0, 'global'\} end/);
 assert.match(cmd[1],/if c >= tonumber\(ARGV\[2\]\) then return \{0, 'client'\} end/);
 assert.match(cmd[1],/redis\.call\('INCR', KEYS\[1\]\)/);
 assert.match(cmd[1],/redis\.call\('EXPIRE', KEYS\[1\]/);
 assert.equal(cmd[3],"momentum:nfl:brave:v1:global:"+Math.floor(now/3600000));
 assert.match(cmd[4],/^momentum:nfl:brave:v1:client:\d+:[0-9a-f]{32}$/);
 assert.equal(cmd[5],String(NFL_BRAVE_SHARED_POLICY.globalHourlyLimit));
 assert.equal(cmd[6],String(NFL_BRAVE_SHARED_POLICY.clientHourlyLimit));
 assert.equal(cmd[7],"7200");
 assert.equal(observed.options.body.includes("10.2.3.4"),false);
 assert.equal(observed.options.body.includes("brave-secret"),false);
 assert.equal(observed.options.body.includes("redis-sensitive-token"),false);
});
test("global quota, per-client quota and malformed Redis replies deny the query",async()=>{
 const cases=[
  [{result:[0,"global"]},"search_global_budget_reached"],
  [{result:[0,"client"]},"search_client_budget_reached"],
  [{result:[1,41,11]},"shared_budget_reserved"],
  [{result:[1,null,3]},"search_budget_unavailable"],
  [{error:"NOAUTH credential invalid"},"search_budget_unavailable"],
  [{result:"1"},"search_budget_unavailable"]
 ];
 for(const [response,reason] of cases){
   const authorize=makeNflSharedSearchAuthorizer({env,clock:()=>now,
    fetcher:async()=>({ok:true,json:async()=>response})});
   const result=await authorize({clientId:"10.2.3.4",apiKey:"brave-secret"});
   assert.equal(result.reason,reason);
   assert.equal(result.allowed,reason==="shared_budget_reserved");
 }
});
test("global shared budget responds safely to network, bad auth or invalid JSON",async()=>{
 for(const behavior of [
  async()=>{throw Error("database secret leaked")},
  async()=>({ok:false,status:401}),
  async()=>({ok:true,json:async()=>{throw Error("secret")}})
 ]){
   const authorize=makeNflSharedSearchAuthorizer({env,clock:()=>now,fetcher:behavior});
   const result=await authorize({clientId:"10.2.3.4",apiKey:"brave-secret"});
   assert.deepEqual(result,{allowed:false,reason:"search_budget_unavailable"});
   assert.equal(JSON.stringify(result).includes("secret"),false);
 }
});
test("shared key is stable for same client, differs for different clients or windows",async()=>{
 const keys=[];
 let timestamp=now;
 const authorize=makeNflSharedSearchAuthorizer({env,clock:()=>timestamp,
  fetcher:async(url,opt)=>{
   keys.push(JSON.parse(opt.body).slice(3,5));
   return {ok:true,json:async()=>({result:[1,1,1]})};
  }
 });
 await authorize({clientId:"192.0.2.1",apiKey:"key"});
 await authorize({clientId:"192.0.2.1",apiKey:"key"});
 await authorize({clientId:"192.0.2.2",apiKey:"key"});
 timestamp+=3600000;
 await authorize({clientId:"192.0.2.1",apiKey:"key"});
 assert.deepEqual(keys[0],keys[1]);
 assert.notEqual(keys[1][1],keys[2][1]);
 assert.notDeepEqual(keys[0],keys[3]);
});
