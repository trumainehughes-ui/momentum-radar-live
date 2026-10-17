import {automaticPublishedDKReview} from './lib/nfl-automatic-published-book-review.js';
window.momentumAutomaticPublishedDKReview=automaticPublishedDKReview;
window.dispatchEvent(new Event('momentum-automatic-dk-publication-ready'));
