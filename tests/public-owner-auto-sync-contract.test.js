import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const owner=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const publicHtml=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
test('automated owner polling reads the identical, already-screened saved game that public uses',()=>{
 const i=owner.indexOf('async function nflPollPublishedMatchup(){');
 const j=owner.indexOf('async function nflOpen(',i);
 assert.ok(i>0&&j>i);
 const poll=owner.slice(i,j);
 assert.match(poll,/fetch\('\/api\/public-nfl-game\?'/);
 assert.match(poll,/\{cache:'no-store'\}/);
 assert.match(poll,/ownerNflPublishedParity\(null,report/);
 assert.match(poll,/nflOwnerPublishedVersions\.get\(id\)===report\.updatedAt/);
 assert.match(poll,/node\.outerHTML=nflPublishedSgpParityHtml\(parity\)/);
 assert.match(poll,/props\.innerHTML=nflSharedPropsHtml\(parity\)/);
 assert.match(poll,/outcome\.innerHTML=nflSharedOutcomeHtml\(parity\.ok\?report:null\)/);
 assert.match(poll,/setInterval\(nflPollPublishedMatchup,30\*1000\)/);
 assert.doesNotMatch(poll,/\/api\/nfl-markets\?|finalCheck=1|\/api\/nfl-public-book-research\?|CRON_SECRET/);
 assert.ok(publicHtml.includes('setInterval(refreshReadOnlyPredictions,30*1000)'));
});
test('owner displays only published screened SGP research and verified prices, never unscreened raw tier or book quotes',()=>{
 assert.match(owner,/Analytics:\[\],DraftKings:\[\],FanDuel:\[\]/);
 assert.match(owner,/const tiers=Array\.isArray\(parity\?\.publicResearchTiers\)/);
 assert.match(owner,/q\.combinedOddsVerified===true/);
 assert.match(owner,/q\.legs\.every\(l=>/);
 assert.match(owner,/nflPublishedSgpParityHtml\(d\.publicParity\)/);
 assert.match(owner,/if\(d\.publicParity\)\$\('#nflProps'\)\.innerHTML=nflSharedPropsHtml\(d\.publicParity\)/);
});
test('owner matchup outcome is copied only from published customer projectedScore',()=>{
 const begin=owner.indexOf('// The published saved model also owns the customer-facing outcome estimate.');
 assert.ok(begin>0);
 const excerpt=owner.slice(begin,begin+660);
 assert.match(excerpt,/const sharedScore=parity\.ok\?publishedGame\?\.projectedScore:null/);
 assert.match(owner,/const score=published\?\.projectedScore/);
});
