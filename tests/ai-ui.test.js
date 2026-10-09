import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';

test('AI panel mounts, requires selection, uses live markets, and avoids duplicate calls',async()=>{
 const source=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
 const nodes=new Map();
 const root={prepend(panel){nodes.set(panel.id,panel)}};
 const button={disabled:false,onclick:null};
 const output={textContent:''};
 const mode={value:'matchup'};
 const document={
  readyState:'complete',
  getElementById(id){return ({nfl:root,momentumAiRun:button,momentumAiOutput:output,momentumAiMode:mode})[id]||nodes.get(id)||null},
  createElement(){return {id:'',className:'',innerHTML:''}}
 };
 let providerCalls=0,marketCalls=0;
 const game={gameId:'game-123',home:{name:'Home'},away:{name:'Away'},kickoff:'2026-10-11'};
 const ctx=vm.createContext({document,nflSelected:game,nflData:{games:[game]},getNFLMarkets:async()=>{
  marketCalls++;return {categories:{passing:[{name:'Quarterback',momentumScore:78}]},sgps:{Analytics:[{risk:'Small',legs:[{name:'Quarterback',cat:'passing',threshold:250}]}]}};
 },fetch:async(_url,opts)=>{providerCalls++;const p=JSON.parse(opts.body);assert.equal(p.data.categories.passing[0].name,'Quarterback');assert.equal(p.data.sgps[0].risk,'Small');return {json:async()=>({ok:true,analysis:'Sample grounded analysis'})}}});
 vm.runInContext(source,ctx);
 assert.ok(nodes.has('momentumAiPanel'));
 await button.onclick();
 assert.equal(output.textContent,'Sample grounded analysis');
 assert.equal(providerCalls,1);assert.equal(marketCalls,1);
});
test('AI panel stops before calling provider when market data is unavailable',async()=>{
 const source=readFileSync(new URL('../public-ai.js',import.meta.url),'utf8');
 const root={prepend(){}},button={disabled:false},output={textContent:''},mode={value:'matchup'};
 const document={readyState:'complete',getElementById(id){return ({nfl:root,momentumAiRun:button,momentumAiOutput:output,momentumAiMode:mode})[id]||null},createElement(){return {}}};
 let calls=0;
 const game={gameId:'game-456'};
 const ctx=vm.createContext({document,nflSelected:game,nflData:{games:[game]},getNFLMarkets:async()=>null,fetch:async()=>{calls++}});
 vm.runInContext(source,ctx);await button.onclick();
 assert.equal(calls,0);assert.match(output.textContent,/unavailable/);assert.equal(button.disabled,false);
});
