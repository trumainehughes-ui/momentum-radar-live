// Only for unpriced, game-scoped NFL analytics SGP research.
// Current-game roster, official injury holds, completed-game opportunity and
// matchup identity are independently checked by the caller. This helper does
// NOT authorize bookmaker legs, executable prices or confirmed-starter labels.
const unsafe=/\b(OUT|INACTIVE|IR|PUP|NFI|SUSPENDED|DOUBTFUL|QUESTIONABLE|UNKNOWN|REPORTED_OTHER)\b/i;
export function nflModelOnlySkillRoleEligible(role){
 if(!role||role.recommendationEligible!==true)return false;
 const status=String(role.starterStatus||'').toUpperCase();
 const availability=String(role.availability||'UNREPORTED').toUpperCase();
 if(unsafe.test(availability))return false;
 if(role.starterVerified===true&&role.verification?.role?.verified===true&&
    ['CONFIRMED_STARTER','EXPECTED_STARTER'].includes(status))return true;
 // A projected high-usage role is sufficient ONLY for model-only research,
 // never for an actual sportsbook ticket or official starting-lineup claim.
 return role.gameModelOnly===true&&role.starterVerified===false&&
   role.confirmedStarter===false&&role.verification?.role?.verified===false&&
   role.roleConfidence==='CONDITIONAL_DAY_AHEAD'&&
   status==='PROJECTED_HIGH_USAGE_ROLE';
}
