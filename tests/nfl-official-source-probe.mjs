const url='https://www.nfl.com/injuries/league/2026/reg5';
try{
 const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
 const html=await response.text();
 console.log(JSON.stringify({status:response.status,length:html.length,tableCount:(html.match(/<table/ig)||[]).length,
 h2Count:(html.match(/<h2/ig)||[]).length,hasJaylonJones:html.includes('Jaylon Jones'),
 hasBarkley:html.includes('Saquon Barkley'),htmlTitle:(html.match(/<title[^>]*>([^<]*)/i)||[])[1]||null},null,2));
}catch(e){console.log(JSON.stringify({error:String(e.message||e)}))}
