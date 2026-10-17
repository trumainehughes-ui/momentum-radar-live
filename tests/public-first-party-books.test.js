import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

test('public Momentum Radar SGP page explicitly prioritizes first-party sportsbook websites',()=>{
 const src=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 assert.ok(src.includes('Source-first check: DraftKings and FanDuel public websites.'));
 assert.ok(src.includes('No third-party odds API or model-created betting line is used as a source.'));
 assert.ok(src.includes('A web page that does not expose readable odds is never assigned guessed prices.'));
 assert.ok(src.includes('Public DraftKings and FanDuel player odds'));
 assert.ok(src.includes('Combined sportsbook odds and player lines are not verified'));
});
test('first-party source response retains book names and never fabricates FanDuel price',()=>{
 const src=readFileSync(new URL('../lib/nfl-direct-public-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('FANDUEL_NFL_PUBLIC_URL'));
 assert.ok(src.includes('DKN_NFL_PROPS_URL'));
 assert.ok(src.includes('exactObservedOffers:0'));
 assert.ok(src.includes('combinedSgpQuoteVerified:false'));
 assert.ok(!src.includes('api.the-odds-api.com'));
 assert.ok(!src.includes('api.prop-line.com'));
});
