const url='https://www.nfl.com/injuries/league/2026/reg5';
try{
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
 const html=await response.text();
 console.log(JSON.stringify({status:response.status,length:html.length,tableCount:(html.match(/<table/ig)||[]).length,
 h2Count:(html.match(/<h2/ig)||[]).length,hasJaylonJones:html.includes('Jaylon Jones'),
 hasBarkley:html.includes('Saquon Barkley'),htmlTitle:(html.match(/<title[^>]*>([^<]*)/i)||[])[1]||null},null,2));
}catch(e){console.log(JSON.stringify({error:String(e.message||e)}))}

const r=await fetch(url,{signal:AbortSignal.timeout(14000)});
const html=await r.text();
function snippet(token,width=260){const i=html.indexOf(token);return i<0?'NOT_FOUND':html.slice(Math.max(0,i-width),i+width).replace(/\s+/g,' ').slice(0,width*2);}
console.log('TEAM_ROW_CONTEXT',snippet('Jaylon Jones',430));
console.log('TEAM_HEADING_CONTEXT',snippet('Jaguars',650));
console.log('FIRST_TABLE_CONTEXT',snippet('<table',600));
console.log('PARTICULAR_GAME_CONTEXT',snippet('Eagles',600));
