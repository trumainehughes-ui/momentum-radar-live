import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {nflPublicInjuryReadiness} from '../lib/nfl-public-injury-release-guard.js';

const now=Date.parse('2026-10-19T18:00:00Z');
const stamp=minutes=>new Date(now-minutes*60000).toISOString();
const game={date:'2026-10-19',week:6,gameId:'401872999',
 teams:['WAS','SF'],kickoff:new Date(now+3*3600000).toISOString()};
const published={status:'CURRENT',updatedAt:stamp(3),injuryCheckedAt:stamp(4),
 inactivesVerified:false,categories:{passing:[{
  name:'Healthy Quarterback',team:'SF',position:'QB',starterVerified:true
 }],rushing:[],receiving:[],td:[],receptions:[]}};
const report={ok:true,gameId:game.gameId,reportAvailable:true,weeklyCoverage:true,
 reportCompleteness:'NFL_PUBLISHED_WEEKLY_CROSS_CHECK',
 teams:[{abbr:'WAS'},{abbr:'SF'}],checkedAt:stamp(1),
 officialSourceCheckedAt:stamp(2),officialSourceYear:2026,officialSourceWeek:6,
 weeklySourceUrl:'https://www.nfl.com/injuries/league/2026/reg6',
 weeklyPublishedAt:null,officialInactivesVerified:false,
 injuries:[{name:'Held Running Back',team:'WAS',position:'RB',status:'OUT',
  evidenceTier:'WEEKLY_OFFICIAL',section:'WEEKLY',gameDesignationVerified:true}]};
const inspect=(g=game,p=published,r=report)=>nflPublicInjuryReadiness(g,p,r,{now});
test('current official NFL weekly report and no conflicting published pick clears injury audit',()=>{
 const result=inspect();
 assert.equal(result.ok,true);
 assert.equal(result.heldPlayerCount,1);
 assert.equal(result.sourcePublishedAt,null,'never invent source publication time');
 assert.deepEqual(result.publishedHeldPlayers,[]);
});
test('official weekly questionable and out players must not remain published as model picks',()=>{
 const bad={...published,categories:{...published.categories,rushing:[
  {name:'Held Running Back',team:'WAS',position:'RB',starterVerified:true}]}};
 const first=inspect(game,bad,report);
 assert.equal(first.ok,false);
 assert.ok(first.blockers.includes('INJURED_PLAYER_PRESENT_IN_PUBLIC_PROJECTIONS'));
 const q={...report,injuries:[{...report.injuries[0],status:'QUESTIONABLE'}]};
 assert.ok(inspect(game,bad,q).blockers.includes('INJURED_PLAYER_PRESENT_IN_PUBLIC_PROJECTIONS'));
});
test('full participation without injury on practice-only report is not game designation',()=>{
 const rest={...report,injuries:[{name:'Healthy Quarterback',team:'SF',
  status:'UNKNOWN',section:'PRACTICE',evidenceTier:'WEEKLY_PRACTICE',
  gameDesignationVerified:false,practiceStatus:'Full Participation in Practice',injury:null}]};
 const result=inspect(game,published,rest);
 assert.equal(result.ok,true);
 assert.equal(result.heldPlayerCount,0);
});
test('stale weekly checks, wrong week, unavailable NFL coverage and stale snapshot block publication',()=>{
 const stale={...report,officialSourceCheckedAt:stamp(25)};
 assert.ok(inspect(game,published,stale).blockers.includes('INJURY_CHECK_NOT_CURRENT'));
 assert.ok(inspect(game,published,{...report,officialSourceWeek:5}).blockers.includes('NFL_WEEK_OR_SEASON_MISMATCH'));
 assert.ok(inspect(game,published,{...report,weeklyCoverage:false}).blockers.includes('NFL_WEEKLY_REPORT_NOT_VERIFIED'));
 assert.ok(inspect(game,{...published,injuryCheckedAt:stamp(30)},report).blockers.includes('PUBLISHED_INJURY_SCREEN_NOT_CURRENT'));
});
test('inside 90 minutes of kickoff, official inactive verification is mandatory, not inferred',()=>{
 const soon={...game,kickoff:new Date(now+45*60000).toISOString()};
 const result=inspect(soon,published,report);
 assert.equal(result.ok,false);
 assert.ok(result.blockers.includes('FINAL_GAME_DAY_INACTIVES_UNVERIFIED'));
 assert.ok(result.blockers.includes('PUBLISHED_GAME_DAY_INACTIVES_UNVERIFIED'));
});
test('a source conflict is flagged separately and stale owner data cannot mark reports new',()=>{
 const conflict={...report,discrepancies:['ESPN_DISAGREES_WITH_OFFICIAL:SF:Player:ACTIVE_VS_OUT']};
 assert.ok(inspect(game,published,conflict).issues.includes('ESPN_NFL_DESIGNATION_CONFLICT'));
 assert.equal(inspect(game,published,{...report,checkedAt:stamp(1)}).sourcePublishedAt,null);
 const src=readFileSync(new URL('../scripts/nfl-public-release-audit.mjs',import.meta.url),'utf8');
 assert.match(src,/nflPublicInjuryReadiness\(game,pub,report,\{now\}\)/);
 assert.match(src,/CURRENT_INJURY_ENDPOINT_UNAVAILABLE/);
 assert.doesNotMatch(src,/\/api\/nfl-markets/);
});
