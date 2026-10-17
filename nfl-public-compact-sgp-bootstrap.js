import {buildPublicCompactNflSgpCards,renderPublicCompactNflSgpCards}
 from './lib/nfl-public-compact-sgp-cards.js';
window.momentumPublicCompactNflSgp={buildPublicCompactNflSgpCards,renderPublicCompactNflSgpCards};
window.dispatchEvent(new Event('momentum-public-compact-sgp-ready'));
