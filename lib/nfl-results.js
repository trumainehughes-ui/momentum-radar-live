export function gradeHistory(p,stats){const a=stats.get(String(p.playerID||p.playerId||'')),cat=String(p.category||p.cat||'').toLowerCase();if(!a)return{status:'UNGRADABLE',actual:null,target:null,margin:null};const actual=['td','anytime_td'].includes(cat)?(a.rushTD||0)+(a.recTD||0):a[cat],target=['td','anytime_td'].includes(cat)?1:(p.threshold??p.line??p.bookOffer?.line??p.bestBook?.line??((p.source==='DATA_MODEL'||p.book==='Data Model')?p.analyticsThreshold:null)??null);if(actual==null||target==null)return{status:'UNGRADABLE',actual,target,margin:null};const margin=Number(actual)-Number(target),atLeast=['td','anytime_td'].includes(cat)||String(p.thresholdType||'').startsWith('AT_LEAST')||p.source==='DATA_MODEL'||p.book==='Data Model';return{status:(atLeast?margin>=0:margin>0)?'HIT':'MISS',actual:Number(actual),target:Number(target),margin,projectionAtLock:Number.isFinite(Number(p.projectionAtLock))?Number(p.projectionAtLock):null,projectionError:Number.isFinite(Number(p.projectionAtLock))?Number(actual)-Number(p.projectionAtLock):null}}
export function parlayStatus(legs){
 const states=legs.map(x=>x.grade?.status);
 if(states.includes('MISS'))return 'MISS';
 if(!states.length||states.some(x=>x==='UNGRADABLE'||!x))return 'UNGRADABLE';
 return states.every(x=>x==='HIT')?'HIT':'PENDING';
}
export function selectedTouchdown(snap,scorer){
 const kickoff=Date.parse(snap?.game?.kickoff),locked=Date.parse(snap?.lockedAt);
 if(!Number.isFinite(kickoff)||!Number.isFinite(locked)||locked>=kickoff)return false;
 const picks=[...(snap.picks||[]),...(snap.sgps||[]).flatMap(s=>s.legs||[])];
 return !!scorer.playerId&&picks.some(p=>['td','anytime_td'].includes(String(p.category||p.cat||p.market||'').toLowerCase())&&String(p.playerId||p.playerID||'')===String(scorer.playerId));
}
