import {fetchDraftKingsNashSelections} from '../lib/draftkings-nash-feed.js';

// Operator-only smoke check. IDs must be discovered from the current first-party
// DraftKings sportsbook; historical example IDs are NOT player-prop defaults.
const [leagueId,categoryId,subcategoryId]=process.argv.slice(2);
if(!leagueId||!categoryId){
 console.error('Usage: node scripts/check-draftkings-nash.mjs LEAGUE_ID CATEGORY_ID [SUBCATEGORY_ID]');
 process.exitCode=2;
}else{
 const result=await fetchDraftKingsNashSelections({leagueId,categoryId,subcategoryId});
 const summary={ok:result.ok,reason:result.reason??null,sourceUrl:result.sourceUrl??null,
  fetchedAt:result.fetchedAt??null,usableSelections:result.selections.length,
  markets:[...new Set(result.selections.map(s=>s.marketName).filter(Boolean))].slice(0,12),
  verifiedSGPQuote:false};
 console.log(JSON.stringify(summary,null,2));
 if(!result.ok)process.exitCode=1;
}
