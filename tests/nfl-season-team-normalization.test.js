import test from 'node:test';
import assert from 'node:assert/strict';
import {nflSeasonForDate,nflCanonicalTeamAbbr} from '../lib/nfl-season-team-normalization.js';
test('NFL January and February games retain previous fall season',()=>{
 assert.equal(nflSeasonForDate('20270117'),2026);
 assert.equal(nflSeasonForDate('2027-02-14'),2026);
 assert.equal(nflSeasonForDate('20261108'),2026);
 assert.equal(nflSeasonForDate('2027-09-12'),2027);
});
test('rejects impossible date inputs',()=>{
 assert.equal(nflSeasonForDate('20270230'),null);
 assert.equal(nflSeasonForDate('bad'),null);
});
test('canonicalizes ESPN NFL team abbreviations',()=>{
 assert.equal(nflCanonicalTeamAbbr('LA'),'LAR');
 assert.equal(nflCanonicalTeamAbbr('WAS'),'WSH');
 assert.equal(nflCanonicalTeamAbbr('JAC'),'JAX');
 assert.equal(nflCanonicalTeamAbbr('BUF'),'BUF');
});
