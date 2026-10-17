import {renderPublicMatchupIntelligence} from './lib/nfl-public-matchup-intelligence-cards.js';
window.momentumPublicMatchupIntelligence={renderPublicMatchupIntelligence};
window.dispatchEvent(new Event('momentum-public-matchup-intelligence-ready'));
