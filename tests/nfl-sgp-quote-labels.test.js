import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
test('NFL SGP distinguishes individual official-site observations from bookmaker-issued correlated prices',()=>{
 assert.ok(src.includes('bookLegCandidateComplete:hasCompleteBookLegCandidate'));
 assert.ok(src.includes('sgpEligibleMarketRows:sgpGateDiagnostics.eligible'));
 assert.ok(src.includes('combinedBookSgpQuoteAvailable:sgpResponse.combinedBookQuoteVerified'));
 assert.ok(src.includes("Analytics:(analyticsSgps||[]).map(s=>({...s,publishable:false}))"));
 assert.ok(src.includes("candidate.combinedBookQuoteVerified=true"));
 assert.ok(src.includes("quote?.status==='PROVIDER_BOOK_COMBINED_QUOTE'"));
 assert.ok(src.includes('Number(quote?.legsAccepted)===candidate.quoteRequest.legs.length'));
 assert.ok(src.includes('sgpOddsInBand(risk,quote.americanOdds)'));
 assert.ok(src.includes('Only verified bookmaker quotes can be presented as bettable parlays.'));
 assert.ok(!src.includes("Every leg is currently verified on '+book+'"));
 assert.ok(!src.includes('hasVerifiedSgp||Boolean(manualTonight)'));
});
test('NFL SGP payout text uses the unified Small/Medium/Large/Nuke net profit boundaries',()=>{
 assert.ok(src.includes('$50–$150 NET profit'));
 assert.ok(src.includes('$200–under $400 NET profit'));
 assert.ok(src.includes('$1,000+ NET profit'));
 assert.ok(src.includes('Object.entries(NFL_SGP_TIERS).map('));
 assert.ok(src.includes('classifyNflSgpOdds(value)===risk'));
});

test('NFL sportsbook availability is derived from exact qualified offers, not an asserted live provider',()=>{
 assert.ok(src.includes("state:sgpGateDiagnostics.eligible?'VERIFIED_INDIVIDUAL_PROPS':'NO_VERIFIED_PLAYER_PROPS'"));
 assert.ok(src.includes("sgpEligibleMarketRows:sgpGateDiagnostics.eligible"));
 assert.ok(src.includes('book,sgpRows.filter(m=>bookFor(m,book)).length'));
 assert.ok(src.includes("const DIRECT_PUBLIC_ODDS_ONLY=String(process.env.MOMENTUM_VERIFIED_BOOK_FEEDS||'').toLowerCase()!=='enabled'"));
 assert.ok(src.includes('if(!modelOnlyPrimer&&!DIRECT_PUBLIC_ODDS_ONLY)try{'));
 assert.ok(src.includes('if(authorizedChange&&gameId&&!DIRECT_PUBLIC_ODDS_ONLY)'));
 assert.ok(!src.includes('publicSportsbookStatsUsed:true'));
});

test('October 5 hardcoded book references cannot enter live 2026-10-11 market rows',()=>{
 assert.ok(src.includes('const mergedMarketRows=[...(rows||[])];'));
 assert.ok(!src.includes('const publicSgpRows=['));
 assert.ok(!src.includes('...publicBookRows,...publicDerivedRows,...publicSgpRows'));
 assert.ok(src.includes('Historical October 5 public bookmaker reference lines stay in the historical context only.'));
});
