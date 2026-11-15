import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('NBA SGP ready-like statuses are held without game-scoped confirmed starters',()=>{
 const source=readFileSync(new URL('../api/nba-health.js',import.meta.url),'utf8');
 const begin=source.indexOf('sgps:(evidence.sgps||[]).map(card=>');
 assert.ok(begin>=0);
 const section=source.slice(begin,source.indexOf('starterEvidence:',begin));
 assert.match(section,/starterVerified:confirmed/);
 assert.match(section,/selectedStarters\.startersConfirmed===true&&/);
 assert.match(section,/legs\.every\(p=>p\.starterVerified===true\)/);
 assert.match(section,/const readyLike=new Set\(\['MODEL_CANDIDATE','READY','VERIFIED','PUBLISHABLE'\]\)/);
 assert.match(section,/status:researchCandidate\?'MODEL_CANDIDATE':card\.status/);
 assert.match(section,/starterVerificationStatus:startersReady\?'GAME_SCOPED_STARTERS_CONFIRMED':\s*'PROJECTED_ROTATION_STARTER_UNCONFIRMED'/);
 assert.match(section,/publishable:false,combinedBookQuoteVerified:false/);
});
