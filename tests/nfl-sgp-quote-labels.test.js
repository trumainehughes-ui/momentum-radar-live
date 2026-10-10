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

test('NFL provider status never claims live bookmaker markets without source rows',()=>{
 assert.ok(src.includes('publicSportsbookStatsUsed:sgpRows.length>0'));
 assert.ok(src.includes('sgpChecks:{liveSportsbookLine:sgpRows.length>0'));
 assert.ok(src.includes('nukeCeilingVerification:false,modelNukeCeilingScreening:true'));
 assert.ok(!src.includes('publicSportsbookStatsUsed:true'));
});

test('October 5 hardcoded book references cannot enter live 2026-10-11 market rows',()=>{
 assert.ok(src.includes('const mergedMarketRows=[...(rows||[])];'));
 assert.ok(!src.includes('const publicSgpRows=['));
 assert.ok(!src.includes('...publicBookRows,...publicDerivedRows,...publicSgpRows'));
 assert.ok(src.includes('Historical October 5 public bookmaker reference lines stay in the historical context only.'));
});
