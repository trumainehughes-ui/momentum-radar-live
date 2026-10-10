// Server-side T-minus-30 gate for the NFL matchup/prop sources already fetched
// in this request. A finalCheck query is an intention, never proof of success.
// No new provider calls, persistence, picks, or bookmaker quotes are made here.
const FINAL_WINDOW_MS=30*60*1000;
const MAX_EVIDENCE_AGE_MS=15*60*1000;

export function assessNflPregameReconciliation({
  gameId,home,away,kickoff,now,requested=false,
  rosterChecked=false,injuryFeedChecked=false,injuryCheckedAt=null,
  rolePlayers=[],marketEvidence=null,sgoShadow=null
}={}){
  const blockers=[];
  const fail=(ok,name)=>{if(!ok)blockers.push(name)};
  const kickoffMs=Date.parse(String(kickoff||""));
  const scoped=Boolean(gameId&&home&&away&&home!==away&&
    Number.isFinite(kickoffMs)&&Number.isFinite(now));
  const beforeKickoff=scoped&&now<=kickoffMs;
  const inWindow=beforeKickoff&&kickoffMs-now<=FINAL_WINDOW_MS;
  const sourceFresh=t=>{
    const at=Date.parse(String(t||""));
    return Number.isFinite(at)&&at<=now&&now-at<=MAX_EVIDENCE_AGE_MS&&
      at<=kickoffMs;
  };
  fail(scoped,"game_and_kickoff_not_verified");
  fail(rosterChecked===true,"current_teams_rosters_incomplete");
  fail(injuryFeedChecked===true && sourceFresh(injuryCheckedAt),
    "current_injury_feed_unverified");
  const allPlayers=Array.isArray(rolePlayers)?rolePlayers:[];
  const freshStarter=team=>allPlayers.some(p=>
    p?.team===team&&p?.position==="QB"&&p?.starterVerified===true&&
    p?.starterStatus==="CONFIRMED_STARTER"&&
    p?.verification?.role?.verified===true&&
    sourceFresh(p.verification.role.checkedAt));
  fail(scoped&&freshStarter(home)&&freshStarter(away),
    "both_current_starting_quarterbacks_unverified");
  fail(marketEvidence?.state==="BOOK_LINES_OBSERVED_UNQUOTED"&&
    Number(marketEvidence.observedBookLines)>0&&sgoShadow?.ready===true&&
    sgoShadow?.crosswalkVerified===true&&
    Number(sgoShadow.quoteRows)>0,"fresh_game_scoped_book_lines_unverified");

  const sourceChecksPassed=blockers.length===0;
  const verified=requested===true&&inWindow&&sourceChecksPassed;
  const phase=!scoped?"NO_GAME":!beforeKickoff?"KICKOFF_PASSED":
    !inWindow?"BEFORE_T_MINUS_30":!requested?"NOT_REQUESTED":
    verified?"SOURCES_RECONCILED":"RECONCILIATION_BLOCKED";
  return {
    phase,requested:requested===true,withinFinalWindow:inWindow,
    sourceChecksPassed,
    finalPregameVerifiedAt:verified?new Date(now).toISOString():null,
    missingEvidence:blockers,
    // An independently quoted *combined* SGP is a separate release gate.
    combinedSgpQuoteVerified:false,advisoryOnly:true,
    message:verified
      ?"Final pregame source reconciliation passed. Combined SGP quote verification is still required."
      :phase==="BEFORE_T_MINUS_30"
      ?"Final check is due within 30 minutes of kickoff; earlier scans are preliminary."
      :phase==="KICKOFF_PASSED"
      ?"Kickoff has passed; no new pregame validation can be issued."
      :"Final pregame validation is pending: "+blockers.length+
       " source checks are incomplete."
  };
}
