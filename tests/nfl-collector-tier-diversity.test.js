import test from 'node:test';
import assert from 'node:assert/strict';
import {nflTierReadiness} from '../lib/nfl-collector-readiness.js';

const make=(risk,players)=>{
 const legs=players.map(([playerID,cat])=>({playerID,cat}));
 return {risk,requiredLegs:legs.length,legs,tierAssessment:{compositionOk:true}};
};
const small=make('Small',[['QB1','passing'],['RB1','rushing'],['WR1','receiving'],['TE1','td']]);
const medium=make('Medium',[['QB1','passing'],['RB2','rushing'],['WR2','receiving'],['TE2','receptions'],['RB2','td']]);
const nuke=make('Nuke',[['QB1','passing'],['RB2','rushing'],['WR2','receiving'],['TE2','receptions'],['RB2','td']]);
test('collector refuses a Nuke that recycles four or more Medium player markets',()=>{
 const tiers=nflTierReadiness({sgps:{Analytics:[small,medium,nuke]}});
 assert.equal(tiers.Small.status,'MODEL_CANDIDATE');
 assert.equal(tiers.Medium.status,'MODEL_CANDIDATE');
 assert.equal(tiers.Nuke.status,'NOT_READY');
 assert.match(tiers.Nuke.reason,/repeats/i);
});
test('collector rejects three markets for one athlete',()=>{
 const crowded=make('Small',[['QB1','passing'],['QB1','rushing'],['QB1','td'],['WR1','receiving']]);
 assert.equal(nflTierReadiness({sgps:{Analytics:[crowded]}}).Small.status,'NOT_READY');
});
test('collector rejects duplicate athlete and market',()=>{
 const duplicate=make('Small',[['QB1','passing'],['RB1','rushing'],['WR1','receiving'],['QB1','passing']]);
 assert.equal(nflTierReadiness({sgps:{Analytics:[duplicate]}}).Small.status,'NOT_READY');
});

test('collector evaluates Large independently as the fourth named tier',()=>{
 const large=make('Large',[['QB3','passing'],['RB3','rushing'],['WR3','receiving'],['TE3','receptions'],['RB4','td'],['WR4','receiving']]);
 const tiers=nflTierReadiness({sgps:{Analytics:[small,medium,large]}});
 assert.equal(tiers.Large.status,'MODEL_CANDIDATE');
 assert.equal(tiers.Large.legs,6);
});
test('collector accepts an eight-leg diversified Nuke without treating it as invalid solely for leg count',()=>{
 const eight=make('Nuke',[['QB3','passing'],['RB3','rushing'],['WR3','receiving'],['TE3','receptions'],['RB4','td'],['WR4','receiving'],['RB5','rushing'],['WR5','td']]);
 assert.equal(nflTierReadiness({sgps:{Analytics:[eight]}}).Nuke.status,'MODEL_CANDIDATE');
});
