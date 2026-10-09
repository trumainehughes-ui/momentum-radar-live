import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';

const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const server=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
function take(s,start,end){
  const a=s.indexOf(start),b=s.indexOf(end,a);
  assert.ok(a>=0&&b>a,'Expected code section '+start);
  return s.slice(a,b);
}
const render=new Function('x','cat','nflLabels','nflEscape',
  take(html,'function nflThreshold(','async function loadNFLRanks(')+';return nflRankCard(x,cat);');
const labels={td:'Anytime TDs',passing:'Passing Yards',rushing:'Rushing Yards',receiving:'Receiving Yards',receptions:'Receptions'};
const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const show=(x,cat='rushing')=>render(x,cat,labels,escape);
const norm=s=>String(s||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
const predict=new Function('x','ctx','norm','bestBook',
  take(server,'function analyticsMetric(','function analyticsLine(')+
  ';const row=populatePredictiveLines({passing:[],rushing:[x],receiving:[],receptions:[]},ctx).rushing[0];return {...row,rushingChance:rushingProbability(row,ctx)};');
const fixture=(vals=[73,84,100,95])=>({
  name:'Example Runner',rank:1,position:'RB',team:'ATL',opponent:'NO',
  projection:88,perGame:88,gamesPlayed:vals.length,
  recentForm:{last5:vals,last10:vals,trend:4},books:[]
});
const context=(offRank,defRank)=>({
  opponents:{ATL:'NO'},
  dvp:{defenseRanks:{RB:{NO:{rushYards:{rankMost:defRank,value:110}}}},
       offenseRanks:{RB:{ATL:{rushYards:{rankMost:offRank,value:140}}}}}
});
const calc=(x,ctx)=>predict(x,ctx,norm,y=>y.bestBook??null);

test('rushing rankings show explicit five-yard target and model percentage, not arbitrary 50/100',()=>{
  const out=show({...fixture(),projection:124,confidence:80,momentumScore:50,
    rushingChance:{modelTargetYards:100,estimatedPercent:67,nearProjectionTargetYards:120,nearProjectionPercent:54,historySample:4,variationYards:28,matchupSummary:'Offense #4 vs defense #6'}});
  assert.match(out,/Projected: 125 rushing yards/);
  assert.match(out,/Safer model target: 100\+ rushing yards/);
  assert.match(out,/Estimated chance of 100\+ rushing yards/);
  assert.match(out,/Near-projection model line: 120\+ rushing yards/);
  assert.match(out,/Model-estimated chance of 120\+ yards: 54%/);
  assert.match(out,/67%/);
  assert.match(out,/Offense vs defense/);
  assert.doesNotMatch(out,/50\/100|80%|Momentum rating/);
  assert.match(out,/Model-only .* line not verified/);
});
test('verified sportsbook line retains original half-yard value and price',()=>{
  const out=show({...fixture(),projection:95,
    bestBook:{book:'DraftKings',line:88.5,odds:-110},
    rushingChance:{modelTargetYards:75,estimatedPercent:68,marketBook:'DraftKings',marketOverPercent:57,historySample:4,variationYards:29}});
  assert.match(out,/Suggested model target: 75\+/);
  assert.match(out,/DraftKings .* Rushing yards: 88\.5/);
  assert.match(out,/chance above DraftKings line \(88\.5\): 57%/);
  assert.match(out,/DraftKings: -110/);
  assert.doesNotMatch(out,/line not verified/);
});
test('unpriced sportsbook offers and undersampled data show pending, not invented percentages',()=>{
  const out=show({...fixture([88,92]),gamesPlayed:2,projection:90,
    bestBook:{book:'FanDuel',odds:-110},rushingChance:null});
  assert.match(out,/Estimated chance pending/);
  assert.match(out,/Model-only .* line not verified/);
  assert.doesNotMatch(out,/FanDuel: -110|50%/);
});
test('passing ranks remain a nonprobabilistic Momentum rating',()=>{
  const out=show({rank:2,name:'Example Quarterback',projection:235,momentumScore:64,gamesPlayed:4,perGame:220},'passing');
  assert.match(out,/Momentum rating \(not hit probability\)/);
  assert.match(out,/64\/100/);
});
test('rushing targets use 5-yard steps but projections remain precise',()=>{
  for(const [projection,expected] of [[124,100],[94,75],[78,60],[69,55]]){
    const row=calc({...fixture(),projection,perGame:projection,position:'RB'},context(12,12));
    assert.equal(row.rushingChance.modelTargetYards,expected);
    assert.equal(row.rushingChance.nearProjectionTargetYards,Math.max(5,Math.floor(row.projection/5)*5));
    assert.ok(row.rushingChance.estimatedPercent>0&&row.rushingChance.estimatedPercent<=99);
  }
});
test('offense strength versus opposing defense adjusts rushing projection and probability',()=>{
  const favorable=calc(fixture(),context(3,2));
  const tough=calc(fixture(),context(30,31));
  assert.ok(favorable.projection>tough.projection);
  assert.ok(favorable.rushingChance.estimatedPercent>tough.rushingChance.estimatedPercent);
  assert.equal(favorable.rushingChance.offenseRankMost,3);
  assert.equal(tough.rushingChance.defenseRankMost,31);
});
test('sample and player variability affect percentages; insufficient samples do not get probabilities',()=>{
  const steady=calc(fixture([80,82,84,86]),context(8,8));
  const volatile=calc(fixture([15,160,18,159]),context(8,8));
  assert.ok(steady.rushingChance.estimatedPercent>volatile.rushingChance.estimatedPercent);
  const missing=calc(fixture([88,90]),context(8,8));
  assert.equal(missing.rushingChance,null);
});
test('when DVP unavailable estimate is explicitly weakened and matchup marked pending',()=>{
  const available=calc(fixture(),context(10,10));
  const missing=calc(fixture(),{opponents:{ATL:'NO'},dvp:null});
  assert.equal(missing.rushingChance.defenseRankMost,null);
  assert.match(missing.rushingChance.matchupSummary,/unavailable/);
  assert.ok(available.rushingChance.estimatedPercent>=missing.rushingChance.estimatedPercent);
});


const modelYards=new Function('x','cat','ctx','norm',
  take(server,'function analyticsMetric(','function bookThresholdCaps(')+
  ';const groups={passing:[],rushing:[],receiving:[],receptions:[]};groups[cat]=[x];const p=populatePredictiveLines(groups,ctx)[cat][0];return {projection:p.projection,small:analyticsLine(p,cat,"Small",ctx),medium:analyticsLine(p,cat,"Medium",ctx),nuke:analyticsLine(p,cat,"Nuke",ctx)};');

test('all three yardage categories display five-yard projections rather than 84 or 88',()=>{
  for(const cat of ['passing','rushing','receiving']){
    const out84=show({rank:1,name:'Yardage Player',projection:84,gamesPlayed:4,perGame:84},cat);
    const out88=show({rank:2,name:'Yardage Player',projection:88,gamesPlayed:4,perGame:88},cat);
    assert.match(out84,/Projected: 85 (?:passing|rushing|receiving) yards/);
    assert.match(out88,/Projected: 90 (?:passing|rushing|receiving) yards/);
    assert.doesNotMatch(out84,/Projected: 84/);
    assert.doesNotMatch(out88,/Projected: 88/);
  }
});

test('passing rushing and receiving backend model projections and all SGP tiers use steps of five',()=>{
  for(const [cat,pos,proj] of [['passing','QB',248],['rushing','RB',88],['receiving','WR',84]]){
    const v=modelYards({position:pos,team:'ATL',opponent:'NO',projection:proj,perGame:proj,gamesPlayed:5,
      recentForm:{last5:[proj,proj+3,proj-4,proj+8,proj-6]},range:{floor:proj*.7,ceiling:proj*1.4}},cat,{dvp:null},norm);
    for(const [key,n] of Object.entries(v)){
      assert.ok(Number.isFinite(n),cat+' '+key+' needs a numeric model target');
      assert.equal(n%5,0,cat+' '+key+' must be divisible by 5, saw '+n);
    }
    assert.ok(v.small<v.medium);
    assert.ok(v.nuke>v.projection);
  }
});

test('five-yard model lines are distinct from exact sportsbook over unders',()=>{
  const fn=new Function('x','cat','nflLabels','nflEscape',
    take(html,'function nflThreshold(','async function loadNFLRanks(')+
    ';return {model:nflModelLine(x,cat),sportsbook:nflThreshold(x,cat)};');
  for(const cat of ['rushing','passing','receiving']){
    const x={projection:88,bestBook:{book:'FanDuel',line:87.5,odds:-110}};
    const z=fn(x,cat,labels,escape);
    assert.match(z.model,/90\+/);
    assert.match(z.sportsbook,/87\.5/);
  }
});

test('front-end uses model yardage lines on home preview game player cards parlays and multigame',()=>{
  assert.match(html,/\$\{'Projected: '\+nflProjection\(x,k\)\}/);
  assert.match(html,/\$\{'Model: '\+nflProjection\(x,cat\)\}/);
  assert.match(html,/nflModelLine\(x,x.cat\)/);
  assert.match(html,/const target=nflModelLine\(x,cat\)/);
});
