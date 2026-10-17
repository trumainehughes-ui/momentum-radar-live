import {selectBestListedBookAlternate} from './lib/sportsbook-listed-alternate-selector.js';
// Loads before the user selects a game; no credentialed network requests.
window.momentumSelectBookAlternate=selectBestListedBookAlternate;
