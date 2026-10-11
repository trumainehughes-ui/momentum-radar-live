import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {propLineEventMatchesDate,normalizePropLinePlayerOffer}
 from '../lib/prop-line-nfl-normalization.js';

const event=utc=>({id:'123',espn_event_id:'401872990',commence_time:utc});
const book={key:'fanduel',last_update:'2026-10-11T14:00:00Z'};
const rush={key:'player_rush_yds',last_update:'2026-10-11T14:01:00Z'};
const touchdown={key:'player_anytime_td',last_update:'2026-10-11T14:02:00Z'};
test('NFL Sunday night game is scoped to Sunday Eastern, not Monday UTC',()=>{
 const e=event('2026-10-12T00:20:00Z');
 assert.equal(propLineEventMatchesDate(e,'2026-10-11','nfl'),true);
 assert.equal(propLineEventMatchesDate(e,'2026-10-12','nfl'),false);
 assert.equal(propLineEventMatchesDate(e,'2026-10-12','nba'),true,
   'non-NFL adapter retains its previous UTC matching contract');
});
test('NFL Monday night near UTC midnight stays on Monday Eastern',()=>{
 const e=event('2026-10-13T00:15:00Z');
 assert.equal(propLineEventMatchesDate(e,'2026-10-12','nfl'),true);
 assert.equal(propLineEventMatchesDate(e,'2026-10-13','nfl'),false);
 assert.equal(propLineEventMatchesDate(event('2026-10-11T17:00:00Z'),'2026-10-11','nfl'),true);
});
test('invalid kickoff and invalid date fail closed before provider matching',()=>{
 for(const e of [null,{},event('not-a-date')])
  assert.equal(propLineEventMatchesDate(e,'2026-10-11','nfl'),false);
 assert.equal(propLineEventMatchesDate(event('2026-10-11T17:00:00Z'),'bad','nfl'),false);
});
test('two-way yardage props require an Over side, verified player description and actual price',()=>{
 const ok=normalizePropLinePlayerOffer(book,rush,{name:'Over',description:'Josh Jacobs',
  point:79.5,price:-115,book_outcome_id:'fd-79-yes'});
 assert.deepEqual(ok,{
  book:'fanduel',market:'player_rush_yds',player:'Josh Jacobs',
  side:'Over',point:79.5,americanOdds:-115,
  bookOutcomeId:'fd-79-yes',updatedAt:rush.last_update
 });
 for(const invalid of [
  {name:'Under',description:'Josh Jacobs',point:79.5,price:-115},
  {name:'Over',description:'',point:79.5,price:-115},
  {name:'Over',description:'Over',point:79.5,price:-115},
  {name:'Over',description:'Josh Jacobs',point:79.5,price:null},
  {name:'Over',description:'Josh Jacobs',point:79.5,price:0},
  {name:'Over',description:'Josh Jacobs',point:null,price:-115},
  {name:'Over',description:'Josh Jacobs',point:undefined,price:-115},
  {name:'Over',description:'Josh Jacobs',point:'',price:-115},
  {name:'Over',description:'Josh Jacobs',point:' ',price:-115},
  {name:'Over',description:'Josh Jacobs',point:0,price:-115},
  {name:'Over',description:'Josh Jacobs',point:-5,price:-115},
  {name:'Over',description:'Josh Jacobs',point:'not-a-line',price:-115}
 ])assert.equal(normalizePropLinePlayerOffer(book,rush,invalid),null);
});
test('valid decimal sportsbook yard lines remain intact; normalized app model uses five-yard targets separately',()=>{
 const line=normalizePropLinePlayerOffer(book,rush,{
  name:'Over',description:'Josh Jacobs',point:79.5,
  price:-110,book_outcome_id:'fd-79-5'});
 assert.equal(line.point,79.5);
 assert.equal(line.americanOdds,-110);
});
test('backend adapter also independently rejects missing zero and blank PropLine yard thresholds',()=>{
 const src=readFileSync(new URL('../api/nfl-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('o.point===null||o.point===undefined'));
 assert.ok(src.includes("String(o.point).trim()===''||!Number.isFinite(line)||line<=0"));
 assert.ok(src.includes("const line=cat==='td'?null:Number(o.point)"));
});
test('one-way anytime touchdowns retain player-named outcomes without inventing side or odds',()=>{
 const direct=normalizePropLinePlayerOffer(book,touchdown,{
  name:'Amon-Ra St. Brown',description:'',point:null,price:+155,
  book_outcome_id:'fd-td-yes'});
 assert.equal(direct.player,'Amon-Ra St. Brown');
 assert.equal(direct.side,'Yes');
 assert.equal(direct.bookOutcomeId,'fd-td-yes');
 const yes=normalizePropLinePlayerOffer(book,touchdown,{
  name:'Yes',description:'Josh Jacobs',price:+105,book_outcome_id:null});
 assert.equal(yes.player,'Josh Jacobs');
 assert.equal(yes.bookOutcomeId,null);
 assert.equal(normalizePropLinePlayerOffer(book,touchdown,{
  name:'No',description:'Josh Jacobs',price:+200}),null);
 assert.equal(normalizePropLinePlayerOffer(book,touchdown,{
  name:'Yes',description:'',price:+200}),null);
});
test('production provider adapter uses explicit local date and guarded scorer parser only behind authorization',()=>{
 const src=readFileSync(new URL('../api/prop-line-markets.js',import.meta.url),'utf8');
 assert.ok(src.includes('propLineEventMatchesDate(e,date,league)'));
 assert.ok(src.includes('normalizePropLinePlayerOffer(book,market,outcome)'));
 assert.ok(src.includes("if(normalized)offers.push(normalized)"));
 assert.ok(src.includes("authorized_change_refresh_required"));
 assert.ok(src.includes("verified_change_token_required"));
 assert.ok(src.includes("allowOverwrite:false"));
 assert.ok(src.includes("bookmakers:'draftkings,fanduel'"));
});
