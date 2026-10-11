import test from 'node:test';
import assert from 'node:assert/strict';
import {sportsbookCoverageAudit,SPORTSBOOK_REFRESH_POLICY} from '../lib/sportsbook-source-policy.js';
test('both public sportsbook sources are required for every NFL game',()=>{
 const a=sportsbookCoverageAudit({sport:'nfl',gameId:'123',attempts:[{book:'DraftKings',status:'OK'}]});
 assert.equal(a.allSourcesAttempted,false);
 assert.equal(a.books.find(x=>x.book==='FanDuel').status,'NOT_ATTEMPTED');
});
test('a blocked sportsbook stays visible as missing coverage',()=>{
 const a=sportsbookCoverageAudit({sport:'nba',gameId:'123',attempts:[{book:'DraftKings',status:'BLOCKED',reason:'access_denied'},{book:'FanDuel',status:'OK'}]});
 assert.equal(a.allSourcesAttempted,true);
 assert.equal(a.fullCategoryCoverage,false);
 assert.equal(a.books[0].reason,'access_denied');
});
test('synthetic sportsbook SGP prices remain forbidden',()=>{
 assert.equal(SPORTSBOOK_REFRESH_POLICY.allowSyntheticCombinedSgpOdds,false);
 assert.equal(SPORTSBOOK_REFRESH_POLICY.aiMayInventMarketData,false);
});
