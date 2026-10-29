import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {summarizeNflNukeEvidence} from '../lib/nfl-nuke-evidence-diagnostics.js';
import {nflSgpSnapshotReadiness} from '../lib/nfl-sgp-snapshot-status.js';
const mk=(athleteId,category,roleEligible=true,ceilingSupported=true)=>
 ({athleteId,category,roleEligible,ceilingSupported});
test('diagnose fewer than five unique verified players without exposing names or IDs',()=>{
 const input=[mk('QB','passing'),mk('RB','rushing'),mk('WR','receiving'),
  mk('WR','td'),mk('backup','receiving',false),mk('TE','td')];
 const d=summarizeNflNukeEvidence(input);
 assert.equal(d.uniqueEligibleAthletes,4);
 assert.equal(d.blocker,'FEWER_THAN_FIVE_ELIGIBLE_ATHLETES');
 assert.ok(!JSON.stringify(d).includes('"QB"'));
 assert.ok(!JSON.stringify(d).includes('"backup"'));
});
test('diagnose insufficient data-backed elevated yardage and market diversity',()=>{
 const fewYards=[mk('a','passing'),mk('b','receiving',true,false),
  mk('c','td'),mk('d','td'),mk('e','td'),mk('f','td')];
 assert.equal(summarizeNflNukeEvidence(fewYards).blocker,'FEWER_THAN_THREE_SUPPORTED_YARDAGE_LEGS');
 const oneMarket=[mk('a','passing'),mk('b','passing'),mk('c','passing'),
  mk('d','td'),mk('e','receptions')];
 assert.equal(summarizeNflNukeEvidence(oneMarket).blocker,'FEWER_THAN_TWO_YARDAGE_MARKETS');
 const ready=[mk('a','passing'),mk('b','rushing'),mk('c','receiving'),
  mk('d','receptions'),mk('e','td')];
 assert.equal(summarizeNflNukeEvidence(ready).blocker,'COMBINATION_OR_CEILING_SELECTION');
});
test('read-only saved status includes safe Nuke evidence but never raw athlete selections',()=>{
 const now=Date.parse('2026-10-11T15:00:00Z'),gameId='401872990';
 const d=summarizeNflNukeEvidence([mk('a','passing'),mk('b','rushing'),
  mk('c','td'),mk('d','td')]);
 const sample={at:now-60000,body:{ok:true,gameId,analyticsAvailable:true,
  sgps:{Analytics:[{risk:'Nuke',requiredLegs:5,legs:[],nukeEvidence:{...d,
    uniqueEligibleAthletes:300,untrusted:'secret-player-id',blocker:'FEWER_THAN_FIVE_ELIGIBLE_ATHLETES'}}]}}};
 const status=nflSgpSnapshotReadiness(sample,{now,gameId});
 const evidence=status.tiers.find(x=>x.risk==='Nuke').nukeEvidence;
 assert.equal(evidence.uniqueEligibleAthletes,100);
 assert.equal(evidence.blocker,'FEWER_THAN_FIVE_ELIGIBLE_ATHLETES');
 assert.ok(!JSON.stringify(status).includes('secret-player-id'));
 const stale=nflSgpSnapshotReadiness({...sample,at:now-16*60000},{now,gameId});
 assert.equal(stale.tiers.find(x=>x.risk==='Nuke').nukeEvidence,undefined);
});
test('NFL model annotates the Nuke attempt without loosening strict composition and roster rules',()=>{
 const source=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(source.includes('summarizeNflNukeEvidence(pool.map(x=>'));
 assert.ok(source.includes('const nuke=selectNflAdaptiveNuke(make);'));
 assert.ok(source.includes('nflLegMatchesGameRoster(x,identity)'));
 assert.match(source,/aiNuke=aiFallback\('Nuke',nukeWithEvidence\)/);
 assert.ok(source.includes('const nukeHasStat=Boolean(aiNuke?.legs?.some'));
});
