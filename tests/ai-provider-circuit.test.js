import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
 providerCircuit,activeProviderCircuit,providerCircuitError,
 isProviderQuotaExhaustion,ODDS_CREDITS_COOLDOWN_MS,SGO_RATE_COOLDOWN_MS
} from "../lib/ai-mechanics/provider-circuit.js";
const now=10000000;
test("provider budget can be shared across serverless instances by durable state",()=>{
 const state=providerCircuit({provider:"the-odds-api",
   reason:"quota_exhausted",now,backoffMs:ODDS_CREDITS_COOLDOWN_MS});
 assert.equal(state.provider,"the-odds-api");
 assert.equal(state.reason,"quota_exhausted");
 assert.equal(activeProviderCircuit(state,"the-odds-api",now+1000)?.retryAfterSeconds,
   (ODDS_CREDITS_COOLDOWN_MS-1000)/1000);
 assert.equal(activeProviderCircuit(state,"the-odds-api",now+ODDS_CREDITS_COOLDOWN_MS),null);
});
test("SGO 429 creates bounded, automatically expiring cooldown",()=>{
 const state=providerCircuit({provider:"sports-game-odds",reason:"rate_limited",
   now,backoffMs:SGO_RATE_COOLDOWN_MS});
 assert.equal(activeProviderCircuit(state,"sports-game-odds",now+60000).retryAfterSeconds,840);
 assert.equal(activeProviderCircuit(state,"sports-game-odds",now+SGO_RATE_COOLDOWN_MS),null);
});
test("a cooldown for one sportsbook never blocks an unrelated provider",()=>{
 const state=providerCircuit({provider:"the-odds-api",reason:"quota_exhausted",
   now,backoffMs:ODDS_CREDITS_COOLDOWN_MS});
 assert.equal(activeProviderCircuit(state,"sports-game-odds",now),null);
});
test("corrupt, spoofed or overly long-lived circuit records are not trusted",()=>{
 const valid=providerCircuit({provider:"sports-game-odds",reason:"rate_limited",
   now,backoffMs:SGO_RATE_COOLDOWN_MS});
 for(const state of [{...valid,version:99},{...valid,provider:"fake"},
   {...valid,blockedUntil:now+48*60*60*1000},
   {...valid,reason:"system_shutdown"},{...valid,at:now+1000000}]){
   assert.equal(activeProviderCircuit(state,"sports-game-odds",now),null);
 }
 assert.equal(providerCircuit({provider:"unknown",reason:"quota_exhausted",
   now,backoffMs:SGO_RATE_COOLDOWN_MS}),null);
});
test("quota exhaustion is detected from provider's formal code or remaining zero",()=>{
 assert.equal(isProviderQuotaExhaustion("OUT_OF_USAGE_CREDITS",null),true);
 assert.equal(isProviderQuotaExhaustion("UNKNOWN",0),true);
 assert.equal(isProviderQuotaExhaustion("",undefined),false);
 assert.equal(isProviderQuotaExhaustion("INVALID_API_KEY",10),false);
});
test("provider short-circuit supplies a retry-after but never an API key",()=>{
 const state=providerCircuit({provider:"the-odds-api",reason:"quota_exhausted",
   now,backoffMs:ODDS_CREDITS_COOLDOWN_MS});
 const e=providerCircuitError(state,"the-odds-api",now+1000);
 assert.equal(e.providerUnavailable,true);
 assert.ok(e.retryAfterSeconds>0);
 assert.doesNotMatch(e.message,/apiKey|secret|token/i);
});
test("NFL caller checks persistent provider blocks before paid request",()=>{
 const src=readFileSync(new URL("../api/nfl-markets.js",import.meta.url),"utf8");
 assert.match(src,/await requireOddsApiBudget\(\)/);
 assert.match(src,/getProviderCircuit\('the-odds-api'/);
 assert.match(src,/getProviderCircuit\('sports-game-odds'/);
 assert.match(src,/storeProviderCircuit\('the-odds-api','quota_exhausted'/);
 assert.match(src,/storeProviderCircuit\('sports-game-odds','rate_limited'/);
 assert.doesNotMatch(src,/const usage=await sgoUsage\(key\)/);
});
test("persistent circuit storage uses a fixed sanitized path and no secrets",()=>{
 const src=readFileSync(new URL("../lib/ai-mechanics/provider-circuit-blob.js",import.meta.url),"utf8");
 assert.match(src,/momentum-nfl-provider-circuits\/v1\//);
 assert.match(src,/allowOverwrite:true/);
 assert.doesNotMatch(src,/API_KEY|x-api-key|req\.body/);
});
