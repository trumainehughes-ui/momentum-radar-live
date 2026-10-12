import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflMarketFailureDetails} from '../lib/nfl-collector-readiness.js';
import {collectorAuditReport} from '../lib/pregame-collector-shards.js';

const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
const collector=readFileSync(new URL('../api/nfl-health.js',import.meta.url),'utf8');
test('active NFL market response preserves actual same-game injury and role evidence',()=>{
 const i=source.indexOf('const response={ok:true,gameId,date,scope:');
 const j=source.indexOf('return res.status(200).json(publicResponse);',i);
 assert.ok(i>0&&j>i);
 assert.ok(source.slice(i,j).includes('const publicResponse=nflPublicMarketResponse(response);'));
 assert.ok(source.slice(i,j).includes('writeResponseSnapshot(responseKey,publicResponse)'));
 const active=source.slice(i,j);
 assert.ok(active.includes('injuryEligibilityChecked:eligibility.checked===true'));
 assert.ok(active.includes('dayAheadRoleChecks:dayAheadRoles?.counters||null'));
 assert.ok(active.includes('blockedPlayerCount:Math.max(eligibility.blockedIds.size'));
 assert.ok(active.includes('analyticsAvailable:Object.values(categories).some('));
 assert.ok(active.includes('bookMarketCounts'));
 assert.ok(active.includes('combinedBookSgpQuoteAvailable:sgpResponse.combinedBookQuoteVerified'));
 assert.ok(active.includes('conditionalRolesNotConfirmedStarters:true'));
});
test('market HTTP 502 null dereference is classified without exposing stack or credentials',()=>{
 const failure=nflMarketFailureDetails(502,{error:
  'Cannot read properties of null (reading requiredLegs); apiKey=SECRET-KEY'});
 assert.deepEqual(failure,{httpStatus:502,failureCode:'MARKET_RUNTIME_ERROR'});
 const report=collectorAuditReport('nfl',0,[{
  gameId:'401872988',status:'markets_unavailable',...failure,
  sgps:0,picks:0
 }],{due:1});
 assert.equal(report.failed,1);
 assert.equal(report.results[0].httpStatus,502);
 assert.equal(report.results[0].failureCode,'MARKET_RUNTIME_ERROR');
 assert.ok(!JSON.stringify(report).includes('SECRET-KEY'));
 assert.equal(report.coverage.unverified,1);
});
test('timeouts, credits, auth and generic failures produce known safe collector codes',()=>{
 assert.equal(nflMarketFailureDetails(503,{error:'deadline exceeded'}).failureCode,'MARKET_REQUEST_TIMEOUT');
 assert.equal(nflMarketFailureDetails(429,{}).failureCode,'MARKET_RATE_LIMITED');
 assert.equal(nflMarketFailureDetails(401,{}).failureCode,'MARKET_AUTH_REJECTED');
 assert.equal(nflMarketFailureDetails(500,{error:'something'}).failureCode,'MARKET_SERVICE_UNAVAILABLE');
 assert.equal(nflMarketFailureDetails(200,{ok:false}).failureCode,'MARKET_RESPONSE_NOT_OK');
 assert.equal(nflMarketFailureDetails('invalid',{error:'none'}).httpStatus,null);
});
test('collector keeps response status and categories instead of generic markets_unavailable',()=>{
 assert.ok(collector.includes('nflMarketFailureDetails(r.status,failure)'));
 assert.ok(collector.includes('nflMarketFailureDetails(r?.status||200,m)'));
 assert.ok(collector.includes('bookCheckpoint.marketResponse||await r.json()'));
 assert.ok(collector.includes('if(r&&!r.ok){'));
 assert.ok(collector.includes('bookCheckpoint.marketResponse?null:await fetch(url'));
 const report=collectorAuditReport('nfl',1,[{
  gameId:'401872990',status:'markets_unavailable',
  httpStatus:502,failureCode:'INJECTED_PRIVATE_FAILURE',
  error:'private api key leak'
 }],{due:1});
 assert.equal(report.results[0].failureCode,null);
 assert.equal(report.results[0].httpStatus,502);
 assert.ok(!JSON.stringify(report).includes('private api key leak'));
});
