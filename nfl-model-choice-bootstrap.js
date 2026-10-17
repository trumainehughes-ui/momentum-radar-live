import {
 buildNflModelChoiceBoard,renderNflModelChoiceBoard,
 installNflModelChoiceInteractions
} from './lib/nfl-model-choice-board.js';
window.momentumNflModelChoice={buildNflModelChoiceBoard,renderNflModelChoiceBoard};
installNflModelChoiceInteractions(document);
window.dispatchEvent(new Event('momentum-nfl-model-choice-ready'));
