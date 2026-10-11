// Single source of truth for SGP risk labels across NFL and NBA.
// Positive American odds are NET profit per $100 stake; +2000 yields
// $200 NET on a $10 stake. Exact +3000 belongs to Small, not Medium.
export const LEAGUE_SGP_TIERS=Object.freeze(['Small','Medium','Nuke']);
export const LEAGUE_SGP_BOOKS=Object.freeze(['DraftKings','FanDuel']);
export const LEAGUE_SGP_TARGETS=Object.freeze({
 Small:Object.freeze({minimum:2000,maximum:3000,netProfitOnTen:[200,300]}),
 Medium:Object.freeze({minimum:3001,maximum:8000,netProfitOnTen:[300.10,800]}),
 Nuke:Object.freeze({minimum:10000,maximum:null,netProfitOnTen:[1000,null]})
});
