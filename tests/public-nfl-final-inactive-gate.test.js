import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {publicNflGameView} from '../lib/public-nfl-view.js';

const now=Date.parse('2026-10-19T22:00:00Z');
const date='2026-10-19',gameId='401872999';
const base={ok:true,date,gameId,home:'SF',away:'WAS',
 categories:{td:[],passing:[],rushing:[],receiving:[],receptions:[]},
 sgps:{Analytics:[],DraftKings:[],FanDuel:[]},
 validation:{injuryEligibilityChecked:true,injuryReportCheckedAt:new Date(now-3*60000).toISOString(),
  officialInactivesVerified:false}};
const view=(raw)=>publicNflGameView({at:now-30000,body:{...base,...raw}},{date,gameId,now});

test('final 90 minute window needs confirmed inactives and fresh injury screen',()=>{
 const soon=view({kickoff:new Date(now+60*60000).toISOString()});
 assert.equal(soon.status,'CURRENT');
 assert.equal(soon.finalRosterCheck.required,true);
 assert.equal(soon.finalRosterCheck.ready,false);
 assert.equal(soon.finalRosterCheck.status,'AWAITING_FINAL_INACTIVES_OR_CURRENT_INJURY_CHECK');
 assert.deepEqual(soon.verifiedBookParlays,[]);
 assert.deepEqual(soon.verifiedQuotes,[]);
 const stale=view({kickoff:new Date(now+30*60000).toISOString(),
  validation:{...base.validation,officialInactivesVerified:true,
   injuryReportCheckedAt:new Date(now-25*60000).toISOString()}});
 assert.equal(stale.finalRosterCheck.ready,false);
 assert.equal(stale.inactivesVerified,false,'stale injury evidence cannot claim verified game-day inactives');
});
test('current final inactives plus a current injury check clear the public readiness gate',()=>{
 const confirmed=view({kickoff:new Date(now+20*60000).toISOString(),
  validation:{...base.validation,officialInactivesVerified:true}});
 assert.equal(confirmed.finalRosterCheck.required,true);
 assert.equal(confirmed.finalRosterCheck.ready,true);
});
test('older saved snapshot without kickoff fails closed on same NFL date',()=>{
 const missing=view({});
 assert.equal(missing.finalRosterCheck.required,true);
 assert.equal(missing.finalRosterCheck.ready,false);
});
test('model insights ahead of T-90 do not claim game-day inactive verification',()=>{
 const early=view({kickoff:new Date(now+3*3600000).toISOString()});
 assert.equal(early.finalRosterCheck.required,false);
 assert.equal(early.finalRosterCheck.ready,true);
 assert.equal(early.inactivesVerified,false);
});
test('live gate applies to verified combined slips while preserving model-only research',()=>{
 const pub=readFileSync(new URL('../lib/public-nfl-view.js',import.meta.url),'utf8');
 assert.match(pub,/const playableBookParlays=finalRosterReady\?verifiedBookParlays:\[\]/);
 assert.match(pub,/verifiedBookParlays:stale\?\[\]:playableBookParlays/);
 assert.ok(pub.includes('categories,parlays:stale?[]:parlays'));
 const market=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(market.includes("const response={ok:true,gameId,date,scope:'game',home,away,kickoff,"));
});
test('public SGP page clearly states why game-day books are withheld',()=>{
 const html=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.match(html,/Game-day roster verification incomplete/);
 assert.match(html,/Official final inactives and a current injury check/);
 assert.match(html,/finalInactivesWarning\+playerEdgeHtml\+verifiedSections/);
});
