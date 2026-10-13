import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflPublicMarketResponse} from '../lib/nfl-public-market-response.js';
import {NFL_SGP_SNAPSHOT_SCHEMA} from '../lib/nfl-sgp-snapshot-status.js';

const native='private-provider-outcome-id-do-not-publish';
const offer={book:'DraftKings',line:75,odds:+145,available:true,
 sourceProvider:'PropLine',bookOutcomeId:native,book_outcome_id:native,
 providerEventId:'internal-provider-event-123',
 outcomeName:'Over',outcomeDescription:'Verified Runner',
 checkedAt:'2026-10-12T19:00:00.000Z'};
const card={book:'DraftKings',risk:'Small',requiredLegs:4,
 quoteEligibility:'READY_FOR_AUTHORIZED_QUOTE',quoteSelectionCount:4,
 quoteRequest:{league:'nfl',bookmaker:'draftkings',gameId:'401872990',
  eventId:'internal-provider-event-123',risk:'Small',
  legs:[{market:'player_rush_yds',book_outcome_id:native}]},
 actualSgpOdds:2400,combinedBookQuoteVerified:true,publishable:true,
 bookVerificationPending:false,quotedAt:'2026-10-12T19:00:00.000Z',
 legs:[{playerID:'1001',name:'Verified Runner',team:'BUF',cat:'rushing',
  eventID:'401872990',providerEventId:'internal-provider-event-123',
  threshold:75,bookOffer:offer,books:[offer]}]};

test('public NFL cards preserve actual book prices, players and evidence but hide native quote instructions',()=>{
 const privateResponse={ok:true,gameId:'401872990',
  sgps:{DraftKings:[card],FanDuel:[],Analytics:[{risk:'Nuke',
   combinedBookQuoteVerified:false,actualSgpOdds:null,legs:[{name:'Model RB',cat:'rushing',threshold:100}]}]},
  categories:{rushing:[{name:'Verified Runner',books:[offer]}]},
  validation:{sgpEligibleMarketRows:5},oddsDebug:{authorizedQuoteCandidates:3}};
 const redacted=nflPublicMarketResponse(privateResponse);
 assert.notEqual(redacted,privateResponse);
 assert.equal(redacted.sgps.DraftKings[0].actualSgpOdds,2400);
 assert.equal(redacted.sgps.DraftKings[0].combinedBookQuoteVerified,true);
 assert.equal(redacted.sgps.DraftKings[0].publishable,true);
 assert.equal(redacted.sgps.DraftKings[0].quotedAt,card.quotedAt);
 assert.equal(redacted.sgps.DraftKings[0].quoteSelectionCount,4);
 assert.equal(redacted.sgps.DraftKings[0].legs[0].name,'Verified Runner');
 assert.equal(redacted.sgps.DraftKings[0].legs[0].bookOffer.line,75);
 assert.equal(redacted.sgps.DraftKings[0].legs[0].bookOffer.odds,145);
 assert.equal(redacted.sgps.Analytics[0].actualSgpOdds,null);
 assert.equal(redacted.categories.rushing[0].books[0].sourceProvider,'PropLine');
 assert.equal(redacted.validation.sgpEligibleMarketRows,5);
 const published=JSON.stringify(redacted);
 for(const token of ['quoteRequest','bookOutcomeId','book_outcome_id',
  'providerEventId','outcomeDescription','outcomeName',native,
  'internal-provider-event-123'])assert.ok(!published.includes(token),token);
 // Internal candidates must remain intact while exact quote verification runs.
 assert.equal(card.quoteRequest.legs[0].book_outcome_id,native);
 assert.equal(offer.bookOutcomeId,native);
});
test('redaction handles repeated nested references without mutating the original',()=>{
 const nested={bookOutcomeId:native,odds:-110,line:80};
 const source={sgps:{DraftKings:[{legs:[{bookOffer:nested},{bookOffer:nested}]}]}};
 const clean=nflPublicMarketResponse(source);
 assert.equal(clean.sgps.DraftKings[0].legs[0].bookOffer,
  clean.sgps.DraftKings[0].legs[1].bookOffer);
 assert.equal(clean.sgps.DraftKings[0].legs[0].bookOffer.odds,-110);
 assert.equal(source.sgps.DraftKings[0].legs[0].bookOffer.bookOutcomeId,native);
 assert.ok(!JSON.stringify(clean).includes(native));
});
test('NFL active response is scrubbed after quote calls and before public JSON and saved snapshot',()=>{
 const code=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 const quote=code.indexOf('await Promise.all(quoteCandidates.map');
 const redact=code.indexOf('const publicResponse=nflPublicMarketResponse(response);');
 const save=code.indexOf('writeResponseSnapshot(responseKey,publicResponse)');
 const send=code.indexOf('return res.status(200).json(publicResponse);');
 assert.ok(quote>0&&redact>quote&&save>redact&&send>save);
 assert.ok(code.includes('quoteRequest:safeQuote'));
 assert.ok(code.includes('candidate.quoteRequest.legs.length'));
 assert.ok(code.includes("'-public-quote-scrub-v1'"));
 assert.ok(NFL_SGP_SNAPSHOT_SCHEMA.endsWith('-public-quote-scrub-v1-official-reserve-holds-v1-model-hit-chance-v1'));
});
