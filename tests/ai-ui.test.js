import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const source=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
function harness(options={}){
 const nodes=new Map(),root={style:{display:'none'},prepend(panel){nodes.set(panel.id,panel)}};
 const button={disabled:false,onclick:null},output={textContent:''},mode={value:options.mode||'matchup'};
 const document={readyState:'complete',getElementById(id){return ({nflAiMount:root,momentumAiRun:button,momentumAiOutput:output,momentumAiMode:mode})[id]||nodes.get(id)||null},createElement(){return {id:'',className:'',innerHTML:''}}};
 const game=options.game||{gameId:'game-123',home:{name:'Home',abbr:'HOM'},away:{name:'Away',abbr:'AWY'},kickoff:'2026-10-11T18:00:00Z',week:5};
 const calls=[],payloads=[];
 const fetch=async(url,opts={})=>{
  calls.push(url);
  if(url==='/api/ai-analysis'){payloads.push(JSON.parse(opts.body));return {ok:!options.providerError,json:async()=>options.providerError?{ok:false,error:options.providerError,retryAfterSeconds:90}:{ok:true,analysis:options.aiText||'Evidence is limited.'}}}
  if(url.startsWith('/api/nfl-game'))return {ok:true,json:async()=>options.roster??{ok:false}};
  if(url.startsWith('/api/nfl-dvp'))return {ok:true,json:async()=>options.dvp??{ok:false}};
  throw Error('Unknown route '+url);
 };
 const window={};
 const ctx=vm.createContext({document,window,nflSelected:game,nflData:{games:[game]},getNFLMarkets:async()=>options.market===undefined?{categories:{passing:[{name:'Quarterback',team:'AWY',projection:255,momentumScore:78}]},sgps:{Analytics:[{risk:'Small',legs:[{name:'Quarterback',cat:'passing',threshold:250}]}]}}:options.market,fetch,URLSearchParams});
 vm.runInContext(source,ctx);return {nodes,root,window,button,output,mode,calls,payloads,ctx};
}
test('one-tap in-game AI tab routes to selected matchup and caches current report',async()=>{
 const h=harness();
 assert.ok(h.nodes.has('momentumAiPanel'));
 assert.equal(typeof h.window.momentumAiOpenSelected,'function');
 h.window.momentumAiGameChanged(h.ctx.nflSelected);
 await h.window.momentumAiOpenSelected();
 assert.equal(h.payloads.length,1);
 assert.equal(h.payloads[0].data.gameId,'game-123');
 await h.window.momentumAiOpenSelected();
 assert.equal(h.payloads.length,1,'opening the same game tab does not spend another provider call');
 h.window.momentumAiGameChanged({...h.ctx.nflSelected,gameId:'new-game'});
 assert.match(h.output.textContent,/Select/);
});
test('font contrast and in-game tab exist in the NFL detail HTML',()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(html,/data-matchtab="ai"/);
 assert.match(html,/id="nflAiMount" data-matchpanel="ai"/);
 assert.match(html,/window\.momentumAiOpenSelected\(\)/);
 assert.match(html,/#nflAiMount #momentumAiOutput\{color:#edf7ff!important/);
});
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
 assert.equal(d.sgps.length,0);assert.equal(d.sources.roster,'ESPN current-game cross-check');
 assert.equal(h.calls.length,3);
});
test('rushing quarterback stays QB and matchup metrics retain explicit QB group scope',async()=>{
 const h=harness({roster:{ok:true,gameId:'game-123',playerProjections:[{name:'Jalen Hurts',team:'AWY',position:'QB',starterVerified:false}]},market:{categories:{rushing:[{name:'Jalen Hurts',position:'QB',team:'AWY',projection:30,perGame:26.3}],passing:[{name:'Jalen Hurts',position:'QB',team:'AWY',projection:175,perGame:178.3}]},sgps:{}},dvp:{ok:true,season:2026,week:5,completedGames:65,defense:{HOM:{games:4,QB:{rushYards:17.5},RB:{rushYards:47.5}}},offense:{AWY:{games:4,QB:{rushYards:26.3},RB:{rushYards:81}}},defenseRanks:{QB:{HOM:{rushYards:{rankMost:13}}}},offenseRanks:{QB:{AWY:{rushYards:{rankMost:10}}}}}});
 await h.button.onclick();
 const d=h.payloads[0].data,role=d.playerRoleFacts.find(x=>x.name==='Jalen Hurts');
 assert.equal(role.position,'QB');
 assert.equal(d.categories.rushing[0].position,'QB');
 const qb=d.matchup.sides[0].positions.find(x=>x.position==='QB');
 assert.equal(qb.metrics.find(x=>x.metric==='rushYards').statScope,'QB position group, per game');
 assert.equal(d.matchup.statUnit,'TEAM_POSITION_GROUP_PER_GAME (not individual player averages)');
});
test('data-only fallback uses the RB-specific source rank, not the nearby QB rank',async()=>{
 const h=harness({providerError:'ai_stat_rank_mismatch',dvp:{
  ok:true,season:2026,week:5,completedGames:65,
  defense:{HOM:{games:4,QB:{passYards:280,rushYards:17.5},RB:{rushYards:47.5}}},
  offense:{AWY:{games:4,QB:{passYards:170,rushYards:26.3},RB:{rushYards:81}}},
  defenseRanks:{QB:{HOM:{passYards:{rankMost:2},rushYards:{rankMost:13}}},RB:{HOM:{rushYards:{rankMost:32}}}},
  offenseRanks:{}
 }});
 await h.button.onclick();
 assert.match(h.output.textContent,/RB rushing 47\.5 allowed\/game \(rank #32 most allowed\)/);
 assert.doesNotMatch(h.output.textContent,/RB rushing 47\.5 allowed\/game \(rank #13/);
 assert.match(h.output.textContent,/Existing picks are unchanged/);
});
test('a leaguewide game total never substitutes for a team sample',async()=>{
 const h=harness({dvp:{ok:true,season:2026,week:5,completedGames:65,defense:{HOM:{games:4,QB:{passYards:270}},AWY:{games:4}},offense:{AWY:{games:4,QB:{passYards:280}},HOM:{games:4}},defenseRanks:{QB:{HOM:{passYards:{rankMost:4}}}}}});
 await h.button.onclick();
 assert.equal(h.payloads[0].data.matchup.leagueCompletedGames,65);
 assert.equal(h.payloads[0].data.matchup.sides[0].defenseSampleGames,4);
 assert.equal(h.payloads[0].data.matchup.sides[0].limitedSample,true);
});
test('priority ESPN skill-position injuries survive context trimming and are not labeled official inactives',async()=>{
 const injuryNames=['Reserve A','Reserve B','Reserve C','Reserve D','Reserve E','Reserve F','Reserve G','Reserve H','DeVonta Smith','Saquon Barkley'];
 const inj=injuryNames.map((name,i)=>({name,team:i>=8?'HOM':'AWY',position:i===8?'WR':i===9?'RB':'S',status:i>=8?'OUT':'IR',source:'ESPN game summary'}));
 const h=harness({roster:{ok:true,gameId:'game-123',injuries:inj,playerProjections:[],blockers:[],roleSignals:[]}});
 await h.button.onclick();
 const d=h.payloads[0].data;
 assert.equal(d.playerAvailability.reportedInjuryEntries,10);
 assert.equal(d.playerAvailability.officialInactivesVerified,false);
 assert.ok(d.playerAvailability.skillPositionAlerts.some(x=>x.name==='DeVonta Smith'&&x.status==='OUT'));
 assert.ok(d.playerAvailability.skillPositionAlerts.some(x=>x.name==='Saquon Barkley'&&x.status==='OUT'));
 assert.equal(d.playerAvailability.injuries.length,8);
});
test('model tier availability remains distinct from book odds even in matchup mode',async()=>{
 const tiers=['Small','Medium','Nuke'].map(risk=>({risk,legs:[{name:'Quarterback',cat:'passing',threshold:250}]}));
 const h=harness({market:{categories:{passing:[{name:'Quarterback',team:'AWY',projection:250}]},marketRows:0,validation:{sportsbookVerificationAvailable:false},sgps:{Analytics:tiers}}});
 await h.button.onclick();
 assert.equal(h.payloads[0].data.model.modelSgpTierCount,3);
 assert.equal(h.payloads[0].data.model.sportsbookMarketRows,0);
 assert.equal(h.payloads[0].data.sgps.length,0);
 assert.match(h.payloads[0].data.model.modelAvailabilityNote,/Model-generated SGPs exist/);
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
test('limits matchup context and retains real team sample counts',async()=>{
 const h=harness({dvp:{ok:true,season:2026,week:5,completedGames:65,defense:{HOM:{games:4,QB:{passYards:287,rushYards:31},RB:{rushYards:85}},AWY:{games:4}},offense:{AWY:{games:4,QB:{passYards:260}},HOM:{games:4}},defenseRanks:{QB:{HOM:{passYards:{rankMost:2}}}}}});
 await h.button.onclick();
 const x=h.payloads[0].data.matchup;
 assert.equal(x.leagueCompletedGames,65);
 assert.equal(x.sides[0].defenseSampleGames,4);
 assert.ok(x.sides[0].positions.find(y=>y.position==='QB'));
 assert.equal(h.payloads[0].data.sgps.length,0);
});
test('Groq capacity limit shows transparent app-data fallback, not empty analysis',async()=>{
 const h=harness({providerError:'ai_capacity_limited',dvp:{ok:true,season:2026,week:5,completedGames:65,defense:{HOM:{games:4,QB:{passYards:287}}},offense:{AWY:{games:4}},defenseRanks:{QB:{HOM:{passYards:{rankMost:2}}}}}});
 await h.button.onclick();
 assert.match(h.output.textContent,/Data-only summary/);
 assert.match(h.output.textContent,/4 defensive games \(limited sample\)/);
 assert.match(h.output.textContent,/Existing picks are unchanged/);
 const before=h.payloads.length;await h.button.onclick();
 assert.equal(h.payloads.length,before);
});
test('no selected game does not call any network route',async()=>{
 const h=harness();h.ctx.nflSelected=null;await h.button.onclick();
 assert.equal(h.calls.length,0);assert.match(h.output.textContent,/Choose an NFL game/);
});
