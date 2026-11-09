// NFL regular and postseason belong to the season that starts in the prior fall.
export function nflSeasonForDate(value){
 const s=String(value??'');
 const m=/^(\d{4})(?:-?)(\d{2})(?:-?)(\d{2})/.exec(s);
 if(!m)return null;
 const year=Number(m[1]),month=Number(m[2]),day=Number(m[3]);
 const date=new Date(Date.UTC(year,month-1,day));
 if(date.getUTCFullYear()!==year||date.getUTCMonth()+1!==month||date.getUTCDate()!==day)return null;
 return month<=3?year-1:year;
}
export function nflCanonicalTeamAbbr(value){
 const key=String(value??'').trim().toUpperCase();
 return ({LA:'LAR',WAS:'WSH',JAC:'JAX'})[key]||key;
}
