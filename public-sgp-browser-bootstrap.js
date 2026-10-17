import {buildBrowserObservedSgpReviews,observedMatchupBookSnapshot,LOCAL_BOOK_KEY} from './lib/public-sgp-browser-parity.js';
window.momentumBrowserBookParity={buildBrowserObservedSgpReviews,observedMatchupBookSnapshot,LOCAL_BOOK_KEY};
window.dispatchEvent(new Event('momentum-browser-book-parity-ready'));
