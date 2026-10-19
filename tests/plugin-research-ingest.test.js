import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResearch} from '../api/plugin-research-ingest.js';
const good=()=>({provider:'Optimal Sports Projections',league:'NFL',gameId:'401873006',observedAt:new Date().toISOString(),observations:[{type:'player_projection',subject:'Example Player',description:'Projected 75 rushing yards',sourceReference:'Optimal Sports Projections player endpoint'}]});
test('research cannot become a verified sportsbook offer',()=>{const result=validateResearch(good());assert.equal(result.sportsbookVerified,false);assert.equal(result.combinedSgpOdds,null);assert.equal(result.classification,'RESEARCH_ONLY_NOT_SPORTSBOOK_OFFER');});
test('rejects fabricated combined quote classification',()=>{const input=good();input.sportsbookVerified=true;input.combinedSgpOdds='+10000';const result=validateResearch(input);assert.equal(result.sportsbookVerified,false);assert.equal(result.combinedSgpOdds,null);});
test('rejects unsupported source and stale records',()=>{assert.throws(()=>validateResearch({...good(),provider:'FanDuel'}));assert.throws(()=>validateResearch({...good(),observedAt:'2020-01-01T00:00:00Z'}));});
