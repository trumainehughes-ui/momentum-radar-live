// Canonical NFL market categories. Never promote alternate periods, sides
// or arbitrary "yes/no" player markets into a full-game yardage OVER.
export function nflSgoCategory(row) {
  if (!row || row.periodID !== "game") return null;
  const key = String(row.marketName || "").toLowerCase();
  const stat = String(row.statID || "").toLowerCase();
  if (row.betTypeID === "yn" && row.sideID === "yes" && stat === "touchdowns")
    return "anytime_td";
  if (row.betTypeID !== "ou" || row.sideID !== "over") return null;
  if (key.startsWith("player_pass_yds")) return "passing_yards";
  if (key.startsWith("player_rush_yds")) return "rushing_yards";
  if (key.startsWith("player_reception_yds")) return "receiving_yards";
  if (key.startsWith("player_receptions")) return "receptions";
  const label = (stat + " " + key).toLowerCase();
  if (label.includes("passing") && label.includes("yard") &&
      !label.includes("rushing") && !label.includes("receiving")) return "passing_yards";
  if (label.includes("rushing") && label.includes("yard") &&
      !label.includes("passing") && !label.includes("receiving")) return "rushing_yards";
  if ((label.includes("receiving") || label.includes("reception")) &&
      label.includes("yard") && !label.includes("rushing")) return "receiving_yards";
  if (label.includes("reception") && !label.includes("yard") &&
      !label.includes("longest")) return "receptions";
  return null;
}
