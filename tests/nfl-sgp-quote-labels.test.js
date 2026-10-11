import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
test('NFL SGP never conflates single-leg market candidates with a correlated sportsbook quote',()=>{
 assert.ok(src.includes('bookLegCandidateComplete:hasCompleteBookLegCandidate'));
 assert.ok(src.includes('sportsbookVerificationAvailable:Boolean(gameId&&sgpRows.length>0'));
 assert.ok(src.includes('combinedBookSgpQuoteAvailable:false'));
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

test('book-mode cards do not display independently multiplied estimates as an actual SGP price',()=>{
 const ui=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.ok(ui.includes('Combined sportsbook SGP odds: NOT VERIFIED'));
 assert.ok(!ui.includes('Estimated: ${s.estimatedOdds'));
 assert.ok(ui.includes('Individual prop candidate • Combined price unverified'));
});

test('every NFL matchup shows exact available alternatives for BOTH DraftKings and FanDuel',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function nflSgpBookAuditUi(s)');
 const end=html.indexOf('async function nflOpen(',start);
 assert.ok(start>=0&&end>start);
 const fn=html.slice(start,end);
 assert.ok(fn.includes("['FanDuel','DraftKings'].map(book=>{"));
 assert.ok(fn.includes("a.missingLegs.slice(0,6)"));
 assert.ok(fn.includes("book+' lines not confirmed:"));
 assert.ok(fn.includes("x.listedOffers.map(y=>y.display)"));
 assert.ok(!fn.includes('const fd=audits.FanDuel'));
});
