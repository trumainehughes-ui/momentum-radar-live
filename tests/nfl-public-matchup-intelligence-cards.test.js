import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {renderPublicMatchupIntelligence} from '../lib/nfl-public-matchup-intelligence-cards.js';

const atl={offense:'ATL',defense:'CHI',offenseGames:5,defenseGames:5,positions:[
 {position:'QB',metrics:[{metric:'passYards',offensePerGame:208.2,defenseAllowedPerGame:228.6},{metric:'rushYards',offensePerGame:8,defenseAllowedPerGame:13.8}]},
 {position:'RB',metrics:[{metric:'rushYards',offensePerGame:158,defenseAllowedPerGame:81.8},{metric:'recYards',offensePerGame:34.6,defenseAllowedPerGame:27.8}]},
 {position:'WR',metrics:[{metric:'recYards',offensePerGame:141.2,defenseAllowedPerGame:160.2},{metric:'receptions',offensePerGame:9.4,defenseAllowedPerGame:10}]},
 {position:'TE',metrics:[{metric:'recYards',offensePerGame:32.4,defenseAllowedPerGame:40.6},{metric:'receptions',offensePerGame:3.2,defenseAllowedPerGame:3.6}]}
]};
const chi={offense:'CHI',defense:'ATL',offenseGames:5,defenseGames:5,positions:[
 {position:'QB',metrics:[{metric:'passYards',offensePerGame:234.2,defenseAllowedPerGame:261.4}]},
 {position:'RB',metrics:[{metric:'rushYards',offensePerGame:140,defenseAllowedPerGame:73.8}]},
 {position:'WR',metrics:[{metric:'recYards',offensePerGame:155.6,defenseAllowedPerGame:181}]},
 {position:'TE',metrics:[{metric:'recYards',offensePerGame:39.8,defenseAllowedPerGame:53.8}]}
]};
const data=[atl,chi];

test('renders both offenses as mobile-readable position rows with four key stats each',()=>{
 const html=renderPublicMatchupIntelligence(data);
 assert.match(html,/ATL offense/);
 assert.match(html,/CHI defense/);
 assert.match(html,/CHI offense/);
 assert.match(html,/ATL defense/);
 assert.equal((html.match(/class="mr-matchup-card"/g)||[]).length,2);
 assert.equal((html.match(/class="mr-matchup-position"/g)||[]).length,8);
 assert.match(html,/Position \/ stat/);
 assert.match(html,/Offense avg/);
 assert.match(html,/Defense allows/);
 assert.match(html,/208<\/span>/);
 assert.match(html,/229<\/span>/);
 assert.match(html,/158<\/span>/);
 assert.match(html,/82<\/span>/);
 assert.match(html,/Per game · Offense 5 games · Defense 5 games/);
 assert.match(html,/min\(100%,360px\)/);
});
test('makes a short grounded matchup explanation without betting claims',()=>{
 const html=renderPublicMatchupIntelligence(data);
 assert.match(html,/Key comparison:/);
 assert.match(html,/ATL running backs produced more than the opposing defense has typically allowed/);
 assert.match(html,/158 vs 82 yards\/game/);
 assert.match(html,/historical team-position totals per game/);
 assert.doesNotMatch(html,/guaranteed|locked in|bookmaker odds|confirmed winner/i);
});
test('secondary QB rushing and WR catches are hidden in optional more stats panel',()=>{
 const html=renderPublicMatchupIntelligence(data);
 assert.match(html,/<details class="mr-matchup-extra"><summary>More matchup stats<\/summary>/);
 assert.match(html,/QB Rushing yards/);
 assert.match(html,/WR Receptions/);
 assert.doesNotMatch(html,/Offense sample 5 games • Defense sample 5 games/);
});
test('does not fabricate missing numbers or misuse no-data as zero',()=>{
 const out=renderPublicMatchupIntelligence([{
  offense:'ATL',defense:'CHI',offenseGames:1,defenseGames:1,positions:[
   {position:'QB',metrics:[{metric:'passYards',offensePerGame:null,defenseAllowedPerGame:260}]},
   {position:'RB',metrics:[{metric:'rushYards',offensePerGame:0,defenseAllowedPerGame:null}]}
  ]}]);
 assert.match(out,/No[t] enough comparable offense and defense samples/);
 assert.match(out,/class="mr-matchup-empty">—<\/span>/);
 assert.doesNotMatch(out,/0 vs 260/);
 assert.equal((out.match(/class="mr-matchup-position"/g)||[]).length,2);
});
test('handles malicious incoming team names, metric strings and data safely',()=>{
 const raw={offense:'<img src=x onerror=alert(1)>',defense:'CHI',positions:[
 {position:'QB',metrics:[{metric:'passYards',offensePerGame:222,defenseAllowedPerGame:230},
  {metric:'<svg onload=alert(1)>',offensePerGame:7,defenseAllowedPerGame:8}]}]};
 const html=renderPublicMatchupIntelligence([raw]);
 assert.doesNotMatch(html,/<img src=x|<svg onload/i);
 assert.match(html,/&lt;img src=x onerror=alert\(1\)&gt;/);
 assert.match(html,/&lt;svg onload=alert\(1\)&gt;/);
});
test('no-data message and public-only usage',()=>{
 assert.match(renderPublicMatchupIntelligence([]),/statistics are being updated/);
 const pub=readFileSync(new URL('../picks.html',import.meta.url),'utf8');
 const internal=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 assert.match(pub,/nfl-public-matchup-intelligence-bootstrap\.js/);
 assert.match(pub,/publicMatchupCards\(match\)/);
 assert.match(pub,/projected\+publicMatchupCards\(sides,d.categories\)/);
 assert.match(pub,/momentum-public-matchup-intelligence-ready/);
 assert.doesNotMatch(internal,/nfl-public-matchup-intelligence-bootstrap\.js/);
});

test('player exploit needs verified starter, recent sample, and historical ceiling',()=>{
 const side={offense:'ATL',defense:'CHI',offenseGames:5,defenseGames:5,positions:[{position:'RB',metrics:[{metric:'rushYards',offensePerGame:110,defenseAllowedPerGame:135}]}]};
 const candidate={name:'Sample Starter',team:'ATL',position:'RB',starterVerified:true,gameSample:5,avgPerGame:67,projection:75,range:{ceiling:110}};
 const yes=renderPublicMatchupIntelligence([side],{rushing:[candidate]});
 assert.match(yes,/Player to watch: Sample Starter/);
 assert.match(yes,/Historical variability ceiling/);
 assert.match(yes,/110 yards/);
 const no=renderPublicMatchupIntelligence([side],{rushing:[{...candidate,starterVerified:false}]});
 assert.doesNotMatch(no,/Player to watch: Sample Starter/);
 assert.match(no,/No eligible, sufficiently sampled/);
});
