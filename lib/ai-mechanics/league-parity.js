// Cross-league Momentum Radar feature contract. Sport-specific stat identities
// differ, but identical provider, AI and pricing safeguards apply to both.
import { AI_MECHANICS } from "./guardrails.js";

const tiers = Object.freeze({
  Small: Object.freeze({minAmericanOdds:1900,maxAmericanOdds:2900}),
  Medium: Object.freeze({minAmericanOdds:2900,maxAmericanOdds:7900}),
  Nuke: Object.freeze({minAmericanOdds:10000,maxAmericanOdds:Infinity})
});
const shared = Object.freeze({
  aiMechanics:Object.freeze([...AI_MECHANICS]),
  books:Object.freeze(["DraftKings","FanDuel"]),
  requiredControls:Object.freeze([
    "game_identity","player_identity","confirmed_starter","injury_availability",
    "team_offense_vs_defense","defense_vs_position","market_freshness",
    "quote_provenance","cache_expiry","same_book_sgp","combined_quote_required",
    "small_medium_nuke","read_only_shadow","postgame_learning","game_analyzer"
  ]),
  tiers,refreshMinutes:15,finalPregameCheckMinutes:30,
  liveCombinedQuoteRequired:true,publishAutomatically:false
});

export const LEAGUE_PARITY = Object.freeze({
  NFL:Object.freeze({...shared,
    league:"NFL",sport:"football",marketTypes:Object.freeze([
      "passing_yards","rushing_yards","receiving_yards","receptions","anytime_td"
    ]), yardageModelTargetStep:5,
    positionTypes:Object.freeze(["QB","RB","WR","TE"])
  }),
  NBA:Object.freeze({...shared,
    league:"NBA",sport:"basketball",marketTypes:Object.freeze([
      "points","rebounds","assists","three_pointers","pra",
      "points_rebounds","points_assists","rebounds_assists",
      "steals","blocks","double_double","triple_double"
    ]),
    // No NFL-style five-YARD rounding for NBA. Exact bookmaker half-point
    // and alternate lines must be preserved rather than manufactured.
    yardageModelTargetStep:null,
    positionTypes:Object.freeze(["PG","SG","SF","PF","C","G","F"])
  })
});

export function leaguePolicy(league) {
  return Object.prototype.hasOwnProperty.call(LEAGUE_PARITY,league)
    ? LEAGUE_PARITY[league] : null;
}
export function supportedLeagueMarket(league,market) {
  return leaguePolicy(league)?.marketTypes.includes(market) === true;
}
export function sharedLeagueControlsIdentical() {
  const a=LEAGUE_PARITY.NFL,b=LEAGUE_PARITY.NBA;
  return JSON.stringify(a.requiredControls)===JSON.stringify(b.requiredControls) &&
    JSON.stringify(a.aiMechanics)===JSON.stringify(b.aiMechanics) &&
    JSON.stringify(a.tiers)===JSON.stringify(b.tiers) &&
    a.refreshMinutes===b.refreshMinutes &&
    a.finalPregameCheckMinutes===b.finalPregameCheckMinutes &&
    a.publishAutomatically===b.publishAutomatically;
}
