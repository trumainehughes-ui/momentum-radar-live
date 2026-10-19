import test from 'node:test';
import assert from 'node:assert/strict';
import {pregameEvidenceParts,pregameEvidenceAudit} from '../lib/pregame-revalidation.js';
const snapshot=(assists)=>({
 gameId:'401234567',sgps:[],playerProjections:[],home:{abbr:'BOS'},away:{abbr:'NYK'},
 nbaPositionEvidence:{status:'HISTORICAL_EVIDENCE',asOf:'2026-10-20T00:00:00Z',
  teams:{BOS:{allowedByPosition:{PG:{games:6,assists}}}}}
});
test('NBA defensive position change is a matchup evidence change',()=>{
 const first=pregameEvidenceAudit(null,snapshot(7),{league:'nba'});
 const second=pregameEvidenceAudit({evidenceDigests:first.evidenceDigests},snapshot(9),{league:'nba'});
 assert.ok(second.changedFields.includes('MATCHUP'));
});
test('NBA position context does not enter NFL matchup evidence',()=>{
 const x=pregameEvidenceParts(snapshot(7),'nfl');
 assert.equal(x.MATCHUP.nbaPositionEvidence,null);
});
