import test from 'node:test';
import assert from 'node:assert/strict';
import {buildPluginProjectionContext,attachPluginResearchToMatchup} from '../lib/plugin-projection-context.js';
const now=Date.parse('2026-10-19T14:00:00Z');
const record={provider:'Optimal Sports Projections',league:'NFL',gameId:'401873006',
 observedAt:'2026-10-19T13:00:00Z',classification:'RESEARCH_ONLY_NOT_SPORTSBOOK_OFFER',
 sportsbookVerified:false,combinedSgpOdds:null,
 observations:[{type:'player_projection',subject:'Sample Player',description:'70 rushing yards',
 sourceReference:'Provider lookup'}]};
test('plugin context accepts research while keeping sportsbook offers empty',()=>{
 const result=buildPluginProjectionContext([record],{league:'NFL',gameId:'401873006',now});
 assert.equal(result.notes.length,1);assert.deepEqual(result.bookOffers,[]);
 assert.deepEqual(result.combinedSgpQuotes,[]);assert.equal(result.readyForAutomaticPublishing,false);
});
test('plugin context rejects forged sportsbook verified flags',()=>{
 const result=buildPluginProjectionContext([{...record,sportsbookVerified:true}],{league:'NFL',gameId:'401873006',now});
 assert.equal(result.notes.length,0);
});
test('plugin context rejects wrong game, stale, and future observations',()=>{
 const input=[{...record,gameId:'other'},{...record,observedAt:'2026-10-15T13:00:00Z'},
 {...record,observedAt:'2026-10-20T13:00:00Z'}];
 assert.equal(buildPluginProjectionContext(input,{league:'NFL',gameId:'401873006',now}).notes.length,0);
});

test('matchup adapter preserves existing selections and prices',()=>{
 const matchup={gameId:'401873006',picks:[{player:'Existing Starter',odds:'+120'}],sportsbookVerified:true};
 const context=buildPluginProjectionContext([record],{league:'NFL',gameId:'401873006',now});
 const result=attachPluginResearchToMatchup(matchup,context,{league:'NFL',gameId:'401873006',now});
 assert.deepEqual(result.picks,matchup.picks);
 assert.equal(result.sportsbookVerified,true);
 assert.equal(result.pluginResearch.eligibleForBetConstruction,false);
 assert.equal(result.pluginResearch.notes.length,1);
 assert.equal(matchup.pluginResearch,undefined);
});
test('matchup adapter refuses injected sportsbook offers and wrong games',()=>{
 const context=buildPluginProjectionContext([record],{league:'NFL',gameId:'401873006',now});
 assert.throws(()=>attachPluginResearchToMatchup({}, {...context,bookOffers:[{odds:'+100'}]},{league:'NFL',gameId:'401873006'}));
 assert.throws(()=>attachPluginResearchToMatchup({},context,{league:'NBA',gameId:'401873006'}));
});

test('matchup adapter discards stale research at consumption time',()=>{
 const context=buildPluginProjectionContext([record],{league:'NFL',gameId:'401873006',now});
 const result=attachPluginResearchToMatchup({picks:[]},context,{league:'NFL',gameId:'401873006',now:now+72*3600000});
 assert.equal(result.pluginResearch.notes.length,0);
 assert.equal(result.pluginResearch.eligibleForBetConstruction,false);
});
