import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

const nflHtml=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const nbaJs=readFileSync(new URL('../public-nba.js',import.meta.url),'utf8');
const gameId='401872981';
function bodyBetween(source,a,b){
 const start=source.indexOf(a),end=source.indexOf(b,start+a.length);
 assert.ok(start>=0&&end>start);
 return source.slice(start,end);
}
const escape=x=>String(x??'').replace(/[&<>"']/g,
 c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const nflFn=vm.runInNewContext(
 '('+bodyBetween(nflHtml,'function nflSportsbookAiGuardUi','function nflSgpAiPlanUi').trim()+')',
 {nflEscape:escape,Date,Number,String,Array,JSON}
);
const parlayFn=vm.runInNewContext(
 '('+bodyBetween(nflHtml,'function nflSgpAiPlanUi','async function nflOpen').trim()+')',
 {nflEscape:escape,Date,Number,String,Array,JSON}
);
const nbaFn=vm.runInNewContext(
 '('+bodyBetween(nbaJs,'function sportsbookGuard','function sgpAiNextSteps').trim()+')',
 {safe:escape,Date,String,Array}
);
const currentTime=new Date().toISOString();
function nfl(){
 return{gameId,fetchedAt:currentTime,stale:false,degraded:false,
  validation:{sportsbookVerificationAvailable:true},
  sportsbookAiGuard:{
   gameId,league:'nfl',sourceCheckedAt:currentTime,
   items:['Small','Medium','Nuke'].flatMap(risk=>
    ['FanDuel','DraftKings'].map(book=>({
     risk,book,exactLegs:book==='DraftKings'?4:3,requiredLegs:4,
     proposedOfferChecks:book==='FanDuel'?[{player:'Player <bad>',
      category:'rushing',requested:55,bookOffers:['60+','65+']}]:[]
    })))
  }
 };
}
test('NFL game header displays source-scoped per-book AI readiness, safe alternatives and no implied ticket',()=>{
 const out=nflFn(nfl(),gameId);
 assert.match(out,/AI Sportsbook Scout/);
 assert.match(out,/Small DraftKings: 4\/4/);
 assert.match(out,/Small FanDuel: 3\/4/);
 assert.match(out,/Nuke DraftKings/);
 assert.match(out,/Player &lt;bad&gt;/);
 assert.doesNotMatch(out,/Player <bad>/);
 assert.match(out,/NOT a confirmed combined SGP price/);
});
test('NFL sportsbook status expires at 15m and refuses wrong-game or degraded model snapshots',()=>{
 for(const mutate of [
  x=>x.sportsbookAiGuard.sourceCheckedAt=new Date(Date.now()-16*60000).toISOString(),
  x=>x.sportsbookAiGuard.gameId='401872982',
  x=>x.gameId='401872982',
  x=>x.degraded=true,
  x=>x.validation.sportsbookVerificationAvailable=false
 ]){
  const d=nfl();mutate(d);
  const out=nflFn(d,gameId);
  assert.match(out,/verification pending/);
  assert.doesNotMatch(out,/4\/4/);
 }
});
test('NBA view exposes scout status only when game and snapshot freshness are current',()=>{
 const data={status:'SCHEDULED',gameId:'401917234',
  pregameReadiness:{freshness:'CURRENT'},
  sportsbookAiGuard:{league:'nba',gameId:'401917234',
   status:'INSUFFICIENT_EVIDENCE',
   flags:[{detail:'No NBA bookmaker alt-line provider'}]}};
 assert.match(nbaFn(data),/DraftKings \/ FanDuel market check pending/);
 assert.match(nbaFn(data),/INSUFFICIENT_EVIDENCE/);
 assert.match(nbaFn(data),/NOT VERIFIED/);
 data.pregameReadiness.freshness='STALE';
 assert.match(nbaFn(data),/No fresh NBA bookmaker market audit/);
 data.pregameReadiness.freshness='CURRENT';
 data.sportsbookAiGuard.gameId='401999999';
 assert.match(nbaFn(data),/No fresh NBA bookmaker market audit/);
});
test('NFL and NBA game routes safely render their own verified sportsbook guard snapshots',()=>{
 const nfl=nflHtml,nba=readFileSync(new URL('../api/nba-game.js',import.meta.url),'utf8');
 assert.ok(nfl.includes("$('#nflGameHead').innerHTML+=nflSportsbookAiGuardUi(d,id)+nflSgpAiPlanUi(d,id)"));
 assert.ok(nfl.includes("if(String(nflSelected?.gameId||'')!==String(id))return;verifiedMarketsLoaded=true;"));
 assert.ok(nba.includes("snapshot.sportsbookAiGuard?.gameId===gameId"));
 assert.ok(nba.includes("status:'PENDING_OR_STALE'"));
 assert.ok(nbaJs.includes('return source+sportsbookGuard(d)+sgpAiNextSteps(d)+rows.map(s=>{'));
});

test('SGP preview only shows modeled book-listed alternates as provisional rechecks, escaped and never bookable',()=>{
 const d={...nfl(),sgpAiPlan:{gameId,league:'nfl',
  marketEvidenceFresh:true,tiers:[{risk:'Small',bookActions:[{
   book:'FanDuel',action:'REVALIDATE_MISSING_LEGS',
   rescueStatus:'PROVISIONAL_BOOK_LINE_REBUILD',
   provisionalRebuild:{readyToPublish:false},
   suggestedLineRechecks:[{player:'Player <alert>',category:'rushing',requested:50,
    modelCompatibleOptions:[{threshold:55,sourceLabel:'55+'}]}]
  }]}]}};
 const out=parlayFn(d,gameId);
 assert.match(out,/Provisional only/);
 assert.match(out,/Player &lt;alert&gt;/);
 assert.match(out,/55\+/);
 assert.doesNotMatch(out,/Player <alert>/);
 assert.match(out,/No leg replaced/);
 d.sgpAiPlan.tiers[0].bookActions[0].provisionalRebuild.readyToPublish=true;
 assert.doesNotMatch(parlayFn(d,gameId),/Provisional only/);
 d.sgpAiPlan.tiers[0].bookActions[0].provisionalRebuild.readyToPublish=false;
 d.fetchedAt=new Date(Date.now()-16*60000).toISOString();
 assert.doesNotMatch(parlayFn(d,gameId),/55\+/);
 d.fetchedAt=currentTime;
 d.sgpAiPlan.gameId='401872982';
 assert.equal(parlayFn(d,gameId),'');
});
