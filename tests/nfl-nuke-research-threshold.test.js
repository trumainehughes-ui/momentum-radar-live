import test from 'node:test';
import assert from 'node:assert/strict';
import {modelNflSgpResearchThreshold,modelNflSgpStatThreshold} from '../lib/ai-mechanics/nfl-sgp-tiers.js';

test('Nuke model-derived yardage ceiling is research-only and unpriced',()=>{
 const player={projection:80};
 assert.equal(modelNflSgpStatThreshold(player,'receiving','Nuke',95),null);
 const result=modelNflSgpResearchThreshold(player,'receiving','Nuke',95);
 assert.equal(result.target,95);
 assert.equal(result.ceilingBasis,'MODEL_DERIVED_UNVERIFIED');
 assert.equal(result.modelOnly,true);
 assert.equal(result.publishable,false);
 assert.equal(result.combinedBookQuoteVerified,false);
 assert.equal(result.bookOfferVerified,false);
 assert.equal(result.actualSgpOdds,null);
});

test('Nuke research does not manufacture thresholds when projection is too low',()=>{
 assert.equal(modelNflSgpResearchThreshold({projection:12},'receiving','Nuke',15),null);
});

test('observed ceilings remain bounded by strict Nuke rules',()=>{
 const player={projection:80,range:{ceiling:100}};
 const result=modelNflSgpResearchThreshold(player,'receiving','Nuke',120);
 assert.equal(result.target,100);
 assert.notEqual(result.ceilingBasis,'MODEL_DERIVED_UNVERIFIED');
 assert.equal(result.publishable,false);
});

test('research fallback never relaxes non-Nuke or invalid market rules',()=>{
 assert.equal(modelNflSgpResearchThreshold({projection:80},'receiving','Nuke',null),null);
 assert.equal(modelNflSgpResearchThreshold({projection:80},'td','Nuke',1)?.target,'Anytime TD');
 assert.equal(modelNflSgpResearchThreshold({projection:80},'receiving','Large',95)?.target,80);
});
