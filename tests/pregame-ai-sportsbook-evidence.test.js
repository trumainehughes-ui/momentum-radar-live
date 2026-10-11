import test from 'node:test';
import assert from 'node:assert/strict';
import {aiSafeMarketEvidence} from '../lib/pregame-ai-review.js';
const now=Date.parse('2026-10-10T20:00:00Z');
const valid={book:'DraftKings',sport:'NFL',gameId:'401000001',playerId:'123',market:'rushing',line:'60+',americanOdds:'+125',checkedAt:new Date(now).toISOString(),sourceUrl:'https://sportsbook.draftkings.com/',available:true};
test('AI receives only verified sportsbook evidence',()=>{
 const offers=[valid,{...valid,playerId:'stale',checkedAt:new Date(now-3600000).toISOString()},{...valid,playerId:'fake',americanOdds:null}];
 const safe=aiSafeMarketEvidence(offers,now);
 assert.equal(safe.length,1);
 assert.equal(safe[0].americanOdds,'+125');
 assert.equal(safe[0].playerId,'123');
 assert.equal(safe[0].available,undefined);
});
test('AI sees no markets if feed is absent',()=>assert.deepEqual(aiSafeMarketEvidence(undefined,now),[]));
