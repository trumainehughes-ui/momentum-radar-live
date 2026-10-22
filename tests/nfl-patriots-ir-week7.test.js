import test from 'node:test';
import assert from 'node:assert/strict';
import {nflOfficialTransactionHolds,nflOfficialHoldMatches} from '../lib/nfl-official-transaction-holds.js';
const ctx={gameId:'401873010',date:'2026-10-22',home:'CHI',away:'NE'};
test('official Patriots injured reserve transactions block Doubs and Hollins',()=>{const holds=nflOfficialTransactionHolds(ctx);for(const name of ['Romeo Doubs','Mack Hollins'])assert.ok(holds.some(h=>h.name===name&&h.status==='IR'),name);assert.equal(holds.some(h=>h.name==='A.J. Brown'),false);});
test('reserve holds apply only to matching team and dates',()=>{assert.equal(nflOfficialTransactionHolds({...ctx,date:'2026-10-09'}).some(h=>h.name==='Mack Hollins'),false);assert.equal(nflOfficialTransactionHolds({...ctx,home:'BUF',away:'NYJ'}).some(h=>h.name==='Romeo Doubs'),false);const hold=nflOfficialTransactionHolds(ctx).find(h=>h.name==='Romeo Doubs');assert.equal(nflOfficialHoldMatches({name:'Romeo Doubs',team:'NE',playerID:'4361432'},hold),true);});
