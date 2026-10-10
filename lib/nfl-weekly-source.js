// Manually verified, DATE-SCOPED published NFL weekly report. Not a live inactive list.
// Future games must have their own independently sourced, dated entries.
// Source: NFL.com Week 5 injury roundup (updated Oct 9, 2026, 4:49 PM ET).
const REPORTS={
 '401872981':{
  date:'2026-10-11',teams:['PHI','JAX'],season:2026,week:5,
  publishedAt:'2026-10-09T20:49:00.000Z',
  url:'https://fantasy-www.nfl.com/news/nfl-week-5-injury-report-player-statuses-for-all-15-games',
  source:'NFL.com published Week 5 game designations',
  entries:[
   {team:'PHI',name:'Saquon Barkley',position:'RB',injury:'Hamstring',status:'OUT'},
   {team:'PHI',name:'Marquise Brown',aliases:['Hollywood Brown'],position:'WR',injury:'Ankle',status:'OUT'},
   {team:'PHI',name:'DeVonta Smith',position:'WR',injury:'Hamstring',status:'OUT'},
   {team:'PHI',name:'Drew Kendall',position:'C',injury:'Knee',status:'OUT'},
   {team:'PHI',name:'Marcus Epps',position:'S',injury:'Groin',status:'OUT'},
   {team:'PHI',name:'Jonathan Greenard',position:'LB',injury:'Ankle',status:'QUESTIONABLE'},
   {team:'JAX',name:'Jaylon Jones',position:'CB',injury:'Hamstring',status:'OUT'},
   {team:'JAX',name:'Eric Murray',position:'S',injury:'Concussion',status:'DOUBTFUL'}
  ]
 }
};
const norm=x=>String(x||'').toUpperCase().replace(/[^A-Z0-9]/g,'');
export function nflPublishedWeeklyGameReport({gameId='',date='',teams=[]}={}){
 const record=REPORTS[String(gameId)];if(!record)return null;
 const actual=teams.map(t=>norm(t.team?.abbreviation||t.abbr||t)).sort();
 if(actual.length!==2||actual.join('|')!==record.teams.map(norm).sort().join('|'))return null;
 if(date&&String(date).slice(0,10)!==record.date)return null;
 return {...record,gameId:String(gameId),entries:record.entries.map(x=>({...x,
   aliases:Array.isArray(x.aliases)?[...x.aliases]:[]}))};
}
