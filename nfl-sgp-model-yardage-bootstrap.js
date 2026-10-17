import {buildNflProjectedSgpTierDetails,renderNflProjectedSgpTierDetails}
 from './lib/nfl-sgp-model-yardage-cards.js';
window.momentumNflSgpModelYardage={
 buildNflProjectedSgpTierDetails,renderNflProjectedSgpTierDetails
};
window.dispatchEvent(new Event('momentum-nfl-sgp-yardage-ready'));
