import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
function harness(options={}){
 const nodes=new Map(),root={prepend(panel){nodes.set(panel.id,panel)}};
 const button={disabled:false,onclick:null},output={textContent:''},mode={value:options.mode||'matchup'};
 const document={readyState:'complete',getElementById(id){return ({nfl:root,momentumAiRun:button,momentumAiOutput:output,momentumAiMode:mode})[id]||nodes.get(id)||null},createElement(){return {id:'',className:'',innerHTML:''}}};
 const game=options.game||{gameId:'game-123',home:{name:'Home',abbr:'HOM'},away:{name:'Away',abbr:'AWY'},kickoff:'2026-10-11T18:00:00Z',week:5};
 const calls=[],payloads=[];
 const fetch=async(url,opts={})=>{
  calls.push(url);
  if(url==='/api/ai-analysis'){payloads.push(JSON.parse(opts.body));return {ok:true,json:async()=>({ok:true,analysis:options.aiText||'Evidence is limited.'})}}
  if(url.startsWith('/api/nfl-game'))return {ok:true,json:async()=>options.roster??{ok:false}};
  if(url.startsWith('/api/nfl-dvp'))return {ok:true,json:async()=>options.dvp??{ok:false}};
  throw Error('Unknown route '+url);
 };
 const ctx=vm.createContext({document,nflSelected:game,nflData:{games:[game]},getNFLMarkets:async()=>options.market===undefined?{categories:{passing:[{name:'Quarterback',team:'AWY',projection:255,momentumScore:78}]},sgps:{Analytics:[{risk:'Small',legs:[{name:'Quarterback',cat:'passing',threshold:250}]}]}}:options.market,fetch,URLSearchParams});
 vm.runInContext(source,ctx);return {nodes,button,output,mode,calls,payloads,ctx};
}
test('selected game sends sourced market, roster and offense-v-defense evidence',async()=>{
 const h=harness({roster:{ok:true,gameId:'game-123',fetchedAt:'2026-10-09T00:00:00Z',injuries:[{name:'Runner',team:'HOM',status:'QUESTIONABLE',source:'ESPN'}],blockers:[{name:'Backup',status:'OUT'}],roleSignals:[{name:'Quarterback',team:'AWY',status:'EXPECTED_STARTER'}],playerProjections:[]},dvp:{ok:true,season:2026,week:5,completedGames:3,defense:{HOM:{games:4,QB:{passYards:270}}},offense:{AWY:{games:4,QB:{passYards:280}}},defenseRanks:{QB:{HOM:{passYards:{rankMost:4}}}},offenseRanks:{QB:{AWY:{passYards:{rankMost:8}}}}}});
 assert.ok(h.nodes.has('momentumAiPanel'));await h.button.onclick();
 assert.equal(h.output.textContent,'Evidence is limited.');
 assert.equal(h.payloads.length,1);const d=h.payloads[0].data;
 assert.equal(d.categories.passing[0].projection,255);
 assert.equal(d.matchup.sides[0].positions[0].metrics[0].defenseAllowedPerGame,270);
 assert.equal(d.matchup.sides[0].positions[0].metrics[0].defenseRankMost,4);
 assert.equal(d.matchup.sides[0].defenseSampleGames,4);
 assert.equal(d.matchup.sides[0].offenseSampleGames,4);
 assert.equal(d.matchup.sides[0].limitedSample,true);
 assert.equal(d.matchup.leagueCompletedGames,3);
 assert.match(d.matchup.sampleInterpretation,/leagueCompletedGames is an NFL-wide total/);
 assert.equal(d.playerAvailability.injuries[0].status,'QUESTIONABLE');
 assert.equal(d.sgps[0].risk,'Small');assert.equal(d.sources.roster,'ESPN current-game cross-check');
 assert.equal(h.calls.length,3);
});
test('a leaguewide game total never substitutes for a team sample',async()=>{
 const h=harness({dvp:{ok:true,season:2026,week:5,completedGames:65,defense:{HOM:{games:4,QB:{passYards:270}},AWY:{games:4}},offense:{AWY:{games:4,QB:{passYards:280}},HOM:{games:4}},defenseRanks:{QB:{HOM:{passYards:{rankMost:4}}}}}});
 await h.button.onclick();
 assert.equal(h.payloads[0].data.matchup.leagueCompletedGames,65);
 assert.equal(h.payloads[0].data.matchup.sides[0].defenseSampleGames,4);
 assert.equal(h.payloads[0].data.matchup.sides[0].limitedSample,true);
});
test('model picks are checked against the selected-game roster without assuming starter status',async()=>{
 const h=harness({roster:{ok:true,gameId:'game-123',injuries:[],blockers:[],roleSignals:[],playerProjections:[{name:'Quarterback',team:'HOM',position:'QB',starterVerified:false}]}});
 await h.button.onclick();
 const checks=h.payloads[0].data.playerAvailability.playerChecks;
 assert.equal(checks[0].name,'Quarterback');
 assert.equal(checks[0].status,'TEAM_MISMATCH');
 assert.equal(checks[0].rosterTeam,'HOM');
});
test('partial injury/dvp evidence still analyzed when market API is exhausted',async()=>{
 const h=harness({market:null,roster:{ok:true,gameId:'game-123',playerProjections:[],injuries:[]}});await h.button.onclick();
 assert.equal(h.payloads.length,1);assert.equal(h.payloads[0].data.sources.model,'unavailable');
 assert.match(h.payloads[0].data.sources.sportsbook,/not verified/);
});
test('no evidence prevents AI provider calls and resets button',async()=>{
 const h=harness({market:null});await h.button.onclick();
 assert.equal(h.payloads.length,0);assert.match(h.output.textContent,/currently unavailable/);assert.equal(h.button.disabled,false);
});
test('wrong game injury evidence and mismatched DVP week are rejected',async()=>{
 const h=harness({roster:{ok:true,gameId:'other',injuries:[{name:'Wrong',status:'OUT'}]},dvp:{ok:true,season:2026,week:4,completedGames:3,defense:{HOM:{QB:{passYards:200}}}}});
 await h.button.onclick();assert.equal(h.payloads[0].data.playerAvailability,null);assert.equal(h.payloads[0].data.matchup,null);
});
test('parlay review includes three model tiers and both book source labels',async()=>{
 const tiers=['Small','Medium','Nuke'].map(risk=>({risk,legs:[{name:'Receiver',cat:'receiving',analyticsThreshold:85}]}));
 const h=harness({mode:'parlay',market:{categories:{},sgps:{Analytics:tiers,DraftKings:tiers,FanDuel:tiers}}});await h.button.onclick();
 assert.equal(h.payloads[0].mode,'parlay');assert.equal(h.payloads[0].data.sgps.length,9);
 assert.equal(h.payloads[0].data.sgps.filter(x=>x.source==='Analytics').length,3);
});
test('formatted AI output safely removes markdown heading markers',async()=>{
 const h=harness({aiText:'**Confirmed Data**\n### Projection only.'});await h.button.onclick();
 assert.equal(h.output.textContent,'Confirmed Data\nProjection only.');
});
test('no selected game does not call any network route',async()=>{
 const h=harness();h.ctx.nflSelected=null;await h.button.onclick();
 assert.equal(h.calls.length,0);assert.match(h.output.textContent,/Choose an NFL game/);
});
