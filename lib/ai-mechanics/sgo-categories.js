// Translate SportsGameOdds market identifiers into our canonical NFL categories.
// Unknown markets fail closed rather than being guessed from a player name.
export function nflSgoCategory(row) {
  if (!row || row.periodID !== "game") return null;
  const key=String(row.marketName||"").toLowerCase();
  if (row.betTypeID==="ou" && row.sideID!=="over") return null;
  if (key.startsWith("player_pass_yds")) return "passing_yards";
  if (key.startsWith("player_rush_yds")) return "rushing_yards";
  if (key.startsWith("player_reception_yds")) return "receiving_yards";
  if (key.startsWith("player_receptions")) return "receptions";
  const stat=String(row.statID||"").toLowerCase();
  const label=(stat+" "+key).toLowerCase();
  if (row.betTypeID==="yn" && row.sideID==="yes" && stat==="touchdowns") return "anytime_td";
  if (row.betTypeID!=="ou" || row.sideID!=="over") return null;
  if (label.includes("passing")&&label.includes("yard")&&!label.includes("rushing")&&!label.includes("receiving")) return "passing_yards";
  if (label.includes("rushing")&&label.includes("yard")&&!label.includes("passing")&&!label.includes("receiving")) return "rushing_yards";
  if ((label.includes("receiving")||label.includes("reception"))&&label.includes("yard")&&!label.includes("rushing")) return "receiving_yards";
  if (label.includes("reception")&&!label.includes("yard")&&!label.includes("longest")) return "receptions";
  return null;
}
