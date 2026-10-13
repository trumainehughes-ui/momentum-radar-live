import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {espnCorePlayerId,parseEspnEventStarters,fetchEspnEventStarters}
 from '../lib/espn-event-starter-evidence.js';
import {nbaCollectPregame} from '../api/nba-health.js';
import {pregameEvidenceAudit,pregameNeedsAiReview} from '../lib/pregame-revalidation.js';

const now=Date.parse('2026-10-13T16:00:00Z');
const iso=new Date(now).toISOString(),gameId='401872995';
const core=(league='nfl',teamIds=['7','26'],abbr=['DEN','SEA'])=>teamIds.map((id,i)=>({
 team:{id,abbreviation:abbr[i]}}));
const ref=(league,id)=>'https://sports.core.api.espn.com/v2/sports/'+
 (league==='nba'?'basketball':'football')+'/leagues/'+league+
 '/seasons/2026/athletes/'+id+'?lang=en&region=us';
const mk=(league,id,flags={})=>({
 athlete:{$ref:ref(league,id)},active:true,starter:true,valid:true,
 ...flags
});
test('ESPN game roster parser uses explicit active starter flags and exact ESPN athlete ID only',()=>{
 assert.equal(espnCorePlayerId(mk('nfl','1234567')),'1234567');
 assert.equal(espnCorePlayerId({athlete:{$ref:'https://bad-site.example/athletes/1234567'}}),null);
 const raw={items:[mk('nfl','1234567'),mk('nfl','1234568',{starter:false}),
  mk('nfl','1234569',{active:false}),mk('nfl','1234570',{valid:false}),
  mk('nfl','1234571',{didNotPlay:true}),mk('nfl','1234567'),
  {athlete:{$ref:'https://fake.example/athletes/1234572'},starter:true,active:true}]};
 const rows=parseEspnEventStarters(raw,{league:'nfl',gameId,teamId:'7',
  team:'DEN',checkedAt:iso});
 assert.equal(rows.length,1);
 assert.equal(rows[0].playerId,'1234567');
 assert.equal(rows[0].starterVerified,true);
 assert.equal(rows[0].officialInactivesVerified,false);
 assert.deepEqual(parseEspnEventStarters(raw,{league:'unknown',gameId,
  teamId:'7',team:'DEN',checkedAt:iso}),[]);
});
test('NFL event requests are scoped to ESPN Core two-team game roster, not team season stats',async()=>{
 const seen=[];
 const result=await fetchEspnEventStarters({league:'nfl',gameId,
  competitors:core(),now,fetchJson:async url=>{
   seen.push(url);
   return {items:[mk('nfl',url.includes('/competitors/7/')?'1234567':'2234567')]};
  }});
 assert.equal(result.checked,true);
 assert.equal(result.teamsChecked,2);
 assert.equal(result.starters.length,2);
 assert.equal(result.startersConfirmed,true);
 assert.equal(result.officialInactivesVerified,false);
 assert.ok(seen.every(url=>url.startsWith('https://sports.core.api.espn.com/v2/sports/football/leagues/nfl/events/'+gameId+'/competitions/'+gameId+'/competitors/')));
 const partial=await fetchEspnEventStarters({league:'nfl',gameId,
  competitors:core(),now,fetchJson:async url=>{
   if(url.includes('/competitors/26/'))throw Error('unavailable');
   return{items:[mk('nfl','1234567')]};
  }});
 assert.equal(partial.checked,false);
 assert.equal(partial.startersConfirmed,false);
 assert.equal(partial.teamsChecked,1);
 assert.equal(partial.officialInactivesVerified,false);
});
test('NBA starter evidence requires five explicit, active starters from BOTH teams',async()=>{
 const id='401908944',competitors=core('nba',['7','13'],['NY','TOR']);
 const load=async(url)=>({items:Array.from({length:5},(_,i)=>
  mk('nba',url.includes('/competitors/7/')?String(1234500+i):String(2345600+i)))});
 const good=await fetchEspnEventStarters({league:'nba',gameId:id,competitors,now,fetchJson:load});
 assert.equal(good.starters.length,10);
 assert.equal(good.startersConfirmed,true);
 assert.equal(good.officialInactivesVerified,false);
 const bad=await fetchEspnEventStarters({league:'nba',gameId:id,competitors,now,
  fetchJson:async url=>({items:Array.from({length:url.includes('/competitors/7/')?5:4},(_,i)=>
   mk('nba',url.includes('/competitors/7/')?String(1234500+i):String(2345600+i)))})});
 assert.equal(bad.startersConfirmed,false);
});
test('NBA collector marks real starter flags but never treats them as NBA official inactive or sportsbook clearance',async()=>{
 const id='401908944',kickoff=new Date(now+4*60*60_000).toISOString(),
  game={gameId:id,kickoff,status:'SCHEDULED',home:{abbr:'TOR',id:'13'},
   away:{abbr:'NY',id:'7'},seasonYear:2027,seasonType:1};
 let saved;
 const snapshot=await nbaCollectPregame(game,{now,
  fetchJson:async url=>{
   if(url.includes('/summary?event='))return{
    header:{competitions:[{id,competitors:core('nba',['7','13'],['NY','TOR'])}]},
    injuries:[]
   };
   if(url.includes('/competitors/'))return{items:Array.from({length:5},(_,i)=>
    mk('nba',url.includes('/competitors/7/')?String(1234500+i):String(2345600+i)))};
   throw Error('unrecognized');
  },
  prepare:async()=>({status:'MODEL_ONLY',playerProjections:[
   {playerId:'1234500',team:'NY',name:'Eligible Starter',category:'points',projection:18},
   {playerId:'1234999',team:'NY',name:'Old Boxscore Player',category:'points',projection:20}],
   sgps:[{risk:'Small',status:'MODEL_CANDIDATE',publishable:false,legs:[
    {playerId:'1234500',team:'NY',name:'Eligible Starter',category:'points',threshold:15},
    {playerId:'1234999',team:'NY',name:'Old Boxscore Player',category:'points',threshold:20}]}]}),
  write:async v=>{saved=v;},
  review:async()=>({status:'REVIEWED'})
 });
 assert.equal(snapshot.status,'MODEL_ONLY');
 assert.equal(saved.playerProjections[0].starterVerified,true);
 assert.equal(saved.playerProjections[1].starterVerified,false);
 assert.equal(saved.sgps[0].legs[0].starterVerified,true);
 assert.equal(saved.sgps[0].legs[1].starterVerified,false);
 assert.equal(saved.starterEvidence.startersConfirmed,true);
 assert.equal(saved.pregameVerification.starterStatus,'CONFIRMED');
 assert.equal(saved.pregameVerification.officialInactivesVerified,false);
 assert.equal(saved.pregameVerification.books.FanDuel.status,'NO_VERIFIED_GAME_PROP');
 assert.equal(saved.pregameVerification.books.DraftKings.status,'NO_VERIFIED_GAME_PROP');
 assert.equal(saved.sgps[0].publishable,false);
});
test('NBA detected lineup changes invalidate cached model reviews at final checkpoint',()=>{
 const a={gameId:'401908944',sgps:[],playerProjections:[],starterEvidence:{
  source:'ESPN_CORE_GAME_ROSTER',startersConfirmed:true,playerIds:['1234567','1234568']
 }};
 const old=pregameEvidenceAudit(null,a,{league:'nba'}),b={...a,
  starterEvidence:{...a.starterEvidence,playerIds:['1234567','1234569']}};
 const newer=pregameEvidenceAudit({...a,evidenceDigests:old.evidenceDigests},b,{league:'nba'});
 assert.equal(newer.changedFromPrior,true);
 assert.ok(newer.changedFields.includes('LINEUPS'));
 assert.equal(pregameNeedsAiReview({stage:'FINAL_T_MINUS_30',changedFields:newer.changedFields,
  priorAiReviewed:true}),true);
});
test('NFL game role signals preserve original published checkedAt instead of faking verification time',()=>{
 const src=readFileSync(new URL('../api/nfl-game.js',import.meta.url),'utf8');
 assert.ok(src.includes("league:'nfl',gameId,competitors"));
 assert.ok(src.includes("p._roleSignal?.checkedAt||null"));
 assert.ok(src.includes("now-checked>12*60*60_000"));
 assert.ok(src.includes("officialInactivesVerified:false"));
});
