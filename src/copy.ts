// ---------------------------------------------------------------
// Blöcke kopieren und ausschneiden. Blockly blendet nach Strg+C und Strg+X sieben Sekunden lang
// einen Hinweis über der Arbeitsfläche ein (»Copied. Press Control + V to paste.«). Er steht im
// Weg und sagt nichts, was man nicht gerade selbst getan hat – Blockwerk zeigt ihn nicht.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';

/** Kennungen der Hinweise von Blockly, die Blockwerk nicht zeigt. */
const HIDDEN_HINTS = new Set(['copiedHint', 'cutHint']);

const show = Blockly.Toast.show;
Blockly.Toast.show = function(this: typeof Blockly.Toast, workspace, options){
  if (options.id && HIDDEN_HINTS.has(options.id)) return;
  show.call(this, workspace, options);
};
