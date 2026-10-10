import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
test('NFL SGP never conflates single-leg market candidates with a correlated sportsbook quote',()=>{
 assert.ok(src.includes('bookLegCandidateComplete:hasCompleteBookLegCandidate'));
 assert.ok(src.includes('sportsbookVerificationAvailable:false,combinedBookSgpQuoteAvailable:false'));
 assert.ok(src.includes('analyticsSgpsPublishable:false'));
 assert.ok(src.includes('Individual-prop candidate (combined price unquoted)'));
 assert.ok(src.includes('combinedBookQuoteVerified:false,actualSgpOdds:null,payoutBandVerified:false'));
 assert.ok(src.includes('Individual prop legs are not a bookmaker-issued correlated SGP quote.'));
 assert.ok(!src.includes("Every leg is currently verified on '+book+'"));
 assert.ok(!src.includes('hasVerifiedSgp||Boolean(manualTonight)'));
});
test('NFL SGP payout guidance uses NET profit, not estimated correlated odds',()=>{
 assert.ok(src.includes('Small targets +2000 to +3000 ($200-$300 net profit on $10)'));
 assert.ok(src.includes('Nuke targets +10000 or higher ($1,000+ net profit)'));
 assert.ok(src.includes('target bands are not verified sportsbook payouts'));
});
