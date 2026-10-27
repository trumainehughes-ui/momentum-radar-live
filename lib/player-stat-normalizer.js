// Numeric ESPN player boxscore stats for research only, never sportsbook lines.
export function normalizePlayerBoxscoreRecord(record){
 const labels=Array.isArray(record?.statLabels)?record.statLabels:[];
 const values=Array.isArray(record?.stats)?record.stats:[];
 const stats={};
 for(let i=0;i<labels.length;i++){
  const key=String(labels[i]||'').trim().toUpperCase();
  const raw=String(values[i]??'').trim();
  if(!key||!raw||!/^[-+]?\d+(?:\.\d+)?$/.test(raw))continue;
  stats[key]=Number(raw);
 }
 const category=String(record?.category||'').toLowerCase();
 const league=String(record?.league||'').toUpperCase();
 const select=(key)=>Number.isFinite(stats[key])?stats[key]:null;
 return {...record,category:category||null,numericStats:stats,
  // YDS is meaningful only with a passing/rushing/receiving category.
  passingYards:category==='passing'?select('YDS'):null,
  rushingYards:category==='rushing'?select('YDS'):null,
  receivingYards:category==='receiving'?select('YDS'):null,
  points:league==='NBA'?select('PTS'):null,
  rebounds:league==='NBA'?select('REB'):null,
  assists:league==='NBA'?select('AST'):null,
  homeRuns:league==='MLB'?select('HR'):null,
  hits:league==='MLB'?select('H'):null
 };
}
