// Pure normalization for verified PropLine NFL/NBA player-prop responses.
// A missing/ambiguous player identity never becomes a priced book offer.
// No network access or paid provider calls are made here.
const formatter=new Intl.DateTimeFormat('en-US',{
 timeZone:'America/New_York',year:'numeric',month:'2-digit',day:'2-digit'
});
const validDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(String(s||''));
export function propLineEventMatchesDate(event,requestedDate,league='nfl'){
 if(!validDate(requestedDate))return false;
 const when=new Date(String(event?.commence_time||''));
 if(!Number.isFinite(when.getTime()))return false;
 if(league!=='nfl')return when.toISOString().slice(0,10)===requestedDate;
 const parts=Object.fromEntries(formatter.formatToParts(when)
  .filter(x=>['year','month','day'].includes(x.type)).map(x=>[x.type,x.value]));
 return [parts.year,parts.month,parts.day].join('-')===requestedDate;
}

const badName=/^(?:over|under|yes|no|n\/a|none|unknown)$/i;
export function normalizePropLinePlayerOffer(book,market,outcome){
 const bookKey=String(book?.key||'').toLowerCase(),
  marketKey=String(market?.key||'');
 if(!['draftkings','fanduel'].includes(bookKey)||
   !/^player_[a-z0-9_]+$/.test(marketKey)||!outcome)return null;
 const td=marketKey==='player_anytime_td',
  side=String(outcome.name||'').trim(),
  description=String(outcome.description||'').trim();
 if(td){
  if(/^no$/i.test(side))return null;
 }else if(!/^over$/i.test(side))return null;
 // The anytime scorer may be the one-way outcome name with no description;
 // two-way pass/rush/receive props must identify the player in description.
 const player=td?(side&&!badName.test(side)?side:description):description;
 if(!player||badName.test(player)||player.length>130)return null;
 // A missing/blank provider line must never become a zero-yard prop through
 // Number(null), Number('') or a later renderer's numeric coercion.
 // One-way anytime touchdowns are legitimate without a numeric threshold.
 if(!td&&(outcome.point===null||outcome.point===undefined||
   String(outcome.point).trim()===''||
   !Number.isFinite(Number(outcome.point))||Number(outcome.point)<=0))
  return null;
 const odds=outcome.price;
 if(odds===null||odds===undefined||odds===''||
   !Number.isFinite(Number(odds))||Number(odds)===0)return null;
 const at=outcome.last_update||market.last_update||book.last_update||null;
 return {book:bookKey,market:marketKey,player,
  side:td?'Yes':'Over',point:outcome.point??null,
  // Keep the real bookmaker's exact outcome tuple for a uniquely matched
  // named SGP leg when its book_outcome_id is unavailable.
  outcomeName:side,outcomeDescription:description,
  americanOdds:Number(odds),bookOutcomeId:outcome.book_outcome_id??null,
  updatedAt:at};
}
