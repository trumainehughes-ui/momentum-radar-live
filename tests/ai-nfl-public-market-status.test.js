import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import handler from "../api/nfl-public-market-status.js";

function response(){
 return {statusCode:0,payload:null,headers:{},
  setHeader(k,v){this.headers[k]=v;return this},
  status(s){this.statusCode=s;return this},
  json(body){this.payload=body;return this}};
}
async function check(flag,key){
 const oldFlag=process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED,
  oldKey=process.env.BRAVE_SEARCH_API_KEY;
 try{
  if(flag===undefined)delete process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED;
  else process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED=flag;
  if(key===undefined)delete process.env.BRAVE_SEARCH_API_KEY;
  else process.env.BRAVE_SEARCH_API_KEY=key;
  const res=response();
  handler({method:"GET"},res);
  return res;
 }finally{
  if(oldFlag===undefined)delete process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED;
  else process.env.NFL_PUBLIC_WEB_SEARCH_ENABLED=oldFlag;
  if(oldKey===undefined)delete process.env.BRAVE_SEARCH_API_KEY;
  else process.env.BRAVE_SEARCH_API_KEY=oldKey;
 }
}
test("disabled Brave connector gives public, key-free status",async()=>{
 const r=await check(undefined,undefined);
 assert.equal(r.statusCode,200);
 assert.equal(r.payload.ready,false);
 assert.equal(r.payload.state,"DISABLED");
 assert.equal(r.payload.livePlayerOddsVerified,false);
 assert.equal(r.payload.combinedSgpPriceVerified,false);
 assert.equal(r.headers["Cache-Control"],"private, no-store");
});
test("enabled Brave without secret is still unavailable",async()=>{
 const r=await check("true",undefined);
 assert.equal(r.statusCode,200);
 assert.equal(r.payload.state,"MISSING_KEY");
 assert.equal(r.payload.ready,false);
});
test("configured and explicitly enabled search is still research-only",async()=>{
 const secret="NEVER_PRINT_THIS_SECRET";
 const r=await check("true",secret);
 assert.equal(r.statusCode,200);
 assert.equal(r.payload.state,"READY_RESEARCH_ONLY");
 assert.equal(r.payload.ready,true);
 assert.equal(r.payload.sharedGlobalRateLimit,false);
 assert.equal(r.payload.livePlayerOddsVerified,false);
 assert.equal(JSON.stringify(r.payload).includes(secret),false);
});
test("status is GET-only",()=>{
 const r=response();handler({method:"POST"},r);
 assert.equal(r.statusCode,405);
 assert.equal(r.payload.error,"method_not_allowed");
});
test("UI only enables Brave search after explicit connection check",()=>{
 const ui=readFileSync(new URL("../public-ai.js",import.meta.url),"utf8");
 assert.ok(ui.includes("fetch('/api/nfl-public-market-status')"));
 assert.ok(ui.includes("researchButton.disabled=!status?.ready"));
 assert.ok(ui.includes("researchButton.disabled=true"));
 assert.ok(ui.includes("researchGameId!==gameId"));
 assert.ok(ui.includes("The player research checklist still works."));
});
