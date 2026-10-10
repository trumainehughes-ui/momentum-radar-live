import test from "node:test";
import assert from "node:assert/strict";
import handler,{parseNbaSlate} from "../api/nba-slate.js";

const sample={
  events:[
    {id:"nba-1",date:"2026-10-10T23:00:00Z",status:{type:{state:"pre"}},
      competitions:[{competitors:[
        {homeAway:"home",team:{id:"4",abbreviation:"DEN",displayName:"Denver Nuggets"}},
        {homeAway:"away",team:{id:"8",abbreviation:"LAL",displayName:"Los Angeles Lakers"}}
      ]}]},
    {id:"no-roster",date:"2026-10-10T23:00:00Z",competitions:[{competitors:[]}]}
  ]
};
function mockRes(){
  return {statusCode:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},
    status(code){this.statusCode=code;return this},
    json(body){this.body=body;return this}};
}
test("NBA scoreboard normalizer preserves ESPN game and team identities",()=>{
  const games=parseNbaSlate(sample,"2026-10-10");
  assert.equal(games.length,1);
  assert.equal(games[0].gameId,"nba-1");
  assert.equal(games[0].home.id,"4");
  assert.equal(games[0].away.abbr,"LAL");
  assert.equal(games[0].status,"SCHEDULED");
});
test("NBA game-day endpoint rejects invalid request and non-GET",async()=>{
  const blocked=mockRes();
  await handler({method:"POST",query:{date:"2026-10-10"}},blocked);
  assert.equal(blocked.statusCode,405);
  const bad=mockRes();
  await handler({method:"GET",query:{date:"2026-02-30"}},bad);
  assert.equal(bad.statusCode,400);
});
test("NBA slate returns official games but no invented player markets",async()=>{
  const old=globalThis.fetch;
  let calls=0;
  try{
    globalThis.fetch=async(url)=>{calls++;
      assert.match(String(url),/site\.api\.espn\.com\/apis\/site\/v2\/sports\/basketball\/nba\/scoreboard/);
      assert.match(String(url),/dates=20261010/);
      return {ok:true,json:async()=>sample};
    };
    const res=mockRes();
    await handler({method:"GET",query:{date:"2026-10-10"}},res);
    assert.equal(res.statusCode,200);
    assert.equal(res.body.gameCount,1);
    assert.equal(res.body.league,"NBA");
    assert.equal(res.body.playerPropsReady,false);
    assert.equal(res.body.sportsbookVerified,false);
    assert.equal(res.body.aiMechanicsEnabled,false);
    assert.equal(res.body.combinedSgpQuoteVerified,false);
    assert.equal(calls,1);
  }finally{globalThis.fetch=old}
});
test("NBA upstream outages never produce fake matches, scores or props",async()=>{
  const old=globalThis.fetch;
  try{
    globalThis.fetch=async()=>({ok:false,status:429});
    const res=mockRes();
    await handler({method:"GET",query:{date:"2026-10-10"}},res);
    assert.equal(res.statusCode,502);
    assert.equal(res.body.playerPropsReady,false);
    assert.equal(res.headers["Cache-Control"],"private, no-store");
  }finally{globalThis.fetch=old}
});
test("NBA slate shows final/live games without assuming betting-market availability",()=>{
  const s={events:[{...sample.events[0],status:{type:{state:"post"}}}]};
  assert.equal(parseNbaSlate(s,"2026-10-10")[0].status,"FINAL");
  s.events[0].status.type.state="in";
  assert.equal(parseNbaSlate(s,"2026-10-10")[0].status,"LIVE");
});
