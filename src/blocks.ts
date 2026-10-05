// ---------------------------------------------------------------
// Blockdefinitionen
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { loops } from 'blockly/blocks';
import * as De from 'blockly/msg/de';
import { ICON_PATTERNS } from './matrix';
import './fieldMatrix';

Blockly.setLocale(De as unknown as {[key: string]: string});

// »falls« und Schleifen in Steuerungsfarbe wie in SPIKE
['controls_if','controls_repeat_ext','controls_whileUntil','controls_flow_statements','controls_forEach'].forEach(t => {
  const def = Blockly.Blocks[t]; if (!def) return;
  const init = def.init;
  def.init = function(this: Blockly.Block){ init.call(this); this.setStyle('loop_blocks'); };
});

type Json = Record<string, unknown>;
const PORTS = ['A','B','C','D','E','F'].map(p => [p,p]);
const DIRS = [['normal','CLOCKWISE'],['umgekehrt','COUNTERCLOCKWISE']];
const NUM = (name: string) => ({type:'input_value', name, check:'Number'});
const PORT = {type:'field_dropdown', name:'PORT', options:PORTS};

function pixelIcon(rows: string[], alt: string){
  let rects = '';
  rows.forEach((r,y) => r.split('').forEach((b,x) => {
    rects += `<rect x="${x*5+.5}" y="${y*5+.5}" width="4" height="4" rx=".6" fill="${b==='1' ? '#fff' : 'rgba(255,255,255,.28)'}"/>`;
  }));
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 25 25">${rects}</svg>`;
  return {src:'data:image/svg+xml,' + encodeURIComponent(svg), width:22, height:22, alt};
}
export { ICON_PATTERNS };
const ICONS = Object.entries(ICON_PATTERNS).map(([name, [alt, rows]]) => [pixelIcon(rows, alt), name]);
const COLORS_SENSE = [['Rot','RED'],['Grün','GREEN'],['Blau','BLUE'],['Gelb','YELLOW'],['Weiß','WHITE'],['Schwarz','BLACK'],['keine Farbe','NONE']];
const COLORS_LIGHT = [['grün','GREEN'],['rot','RED'],['blau','BLUE'],['gelb','YELLOW'],['weiß','WHITE'],['aus','OFF']];

const stmt = (o: Json) => Object.assign({previousStatement:null, nextStatement:null, inputsInline:true}, o);
const val = (o: Json, check: string) => Object.assign({output:check, inputsInline:true}, o);

// »Fahrbasis einrichten« lässt sich über den Pfeil vorn zu einer Zeile zusammenklappen:
// Der Block ist groß, wird einmal eingestellt und steht danach meist nur im Weg.
const arrow = (path: string) => 'data:image/svg+xml,' + encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 16 16"><path d="${path}" fill="none" stroke="#fff" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>`);
const ARROW_OPEN = arrow('M3.5 6l4.500 4.500L12.500 6'), ARROW_CLOSED = arrow('M6 3.500l4.500 4.500L6 12.500');
type FoldBlock = Blockly.Block & {folded_: boolean; setFolded(folded: boolean): void};
// als »Mutator« angemeldet, weil Blockly nur dort eigenen gespeicherten Zustand erlaubt
Blockly.Extensions.registerMutator('pb_foldable', {
  folded_: false,
  saveExtraState(this: FoldBlock){ return this.folded_ ? {folded:true} : null; },
  loadExtraState(this: FoldBlock, state: {folded?: boolean}){ this.setFolded(!!state.folded); },
  setFolded(this: FoldBlock, folded: boolean){
    this.folded_ = folded;
    this.inputList.forEach((input, i) => { if (i > 0) input.setVisible(!folded); });
    const toggle = this.getField('FOLD') as Blockly.FieldImage | null;
    toggle?.setValue(folded ? ARROW_CLOSED : ARROW_OPEN);
    toggle?.setTooltip(folded ? 'Einstellungen zeigen' : 'Einstellungen einklappen');
    // eingeklappt steht das Wichtigste in der Kopfzeile
    this.getField('FOLD_INFO')?.setValue(folded ? `Motoren ${this.getFieldValue('LEFT_PORT')} + ${this.getFieldValue('RIGHT_PORT')}` : '');
    if (this.rendered) (this as unknown as Blockly.BlockSvg).queueRender();
  }
}, function(this: Blockly.Block){
  const block = this as FoldBlock;
  const toggle = new Blockly.FieldImage(ARROW_OPEN, 16, 16, 'ein- oder ausklappen', () => block.setFolded(!block.folded_));
  this.inputList[0].insertFieldAt(0, toggle, 'FOLD');
  this.inputList[0].appendField(new Blockly.FieldLabel(''), 'FOLD_INFO');
});

// »abbrechen« und »weiter« gelten auch in »wiederhole fortlaufend«; ohne den Eintrag schaltet Blockly sie dort ab
loops.loopTypes.add('pb_forever');

Blockly.common.defineBlocksWithJsonArray([
  {type:'pb_start', message0:'wenn Programm startet', nextStatement:null, style:'event_blocks',
   tooltip:'Hier beginnt das Programm. Nur Blöcke, die hier andocken, werden übersetzt.'},
  {type:'pb_when', message0:'wenn %1', args0:[{type:'input_value',name:'COND',check:'Boolean'}], nextStatement:null, style:'event_blocks',
   tooltip:'Die Blöcke darunter laufen jedes Mal, wenn die Bedingung wahr wird – gleichzeitig mit dem übrigen Programm.'},
  {type:'pb_when_message', message0:'wenn ich %1 empfange', args0:[{type:'field_input',name:'NAME',text:'los'}], nextStatement:null, style:'event_blocks',
   tooltip:'Die Blöcke darunter laufen jedes Mal, wenn ein anderer Programmteil diese Nachricht sendet.'},
  stmt({type:'pb_send_message', style:'event_blocks', message0:'sende %1', args0:[{type:'field_input',name:'NAME',text:'los'}],
   tooltip:'Sendet eine Nachricht an alle Blöcke »wenn ich … empfange« mit demselben Namen. Das Programm läuft sofort weiter.'}),

  // Fahren
  stmt({type:'pb_drive_setup', style:'drive_blocks', inputsInline:false, mutator:'pb_foldable',
   message0:'Fahrbasis einrichten %1 linker Motor %2 Drehrichtung %3 %4 rechter Motor %5 Drehrichtung %6 %7 Raddurchmesser %8 mm %9 Spurbreite %10 mm %11 Gyrosensor nutzen %12',
   args0:[{type:'input_end_row'},
     {type:'field_dropdown',name:'LEFT_PORT',options:PORTS},{type:'field_dropdown',name:'LEFT_DIR',options:DIRS},{type:'input_end_row'},
     {type:'field_dropdown',name:'RIGHT_PORT',options:PORTS},{type:'field_dropdown',name:'RIGHT_DIR',options:DIRS},{type:'input_end_row'},
     {type:'field_number',name:'WHEEL',value:56,min:1},{type:'input_end_row'},
     {type:'field_number',name:'AXLE',value:112,min:1},{type:'input_end_row'},
     {type:'field_checkbox',name:'GYRO',checked:true}],
   tooltip:'Beschreibt eure Fahrbasis. Gilt für das ganze Programm. Fährt der Roboter rückwärts oder dreht er sich im Kreis, die Drehrichtungen anpassen; die Spurbreite ist der Abstand zwischen den Radmitten.'}),
  stmt({type:'pb_drive_straight', style:'drive_blocks', message0:'fahre geradeaus %1 mm', args0:[NUM('DIST')],
   tooltip:'Fährt die angegebene Strecke. Negative Werte fahren rückwärts.'}),
  stmt({type:'pb_drive_turn', style:'drive_blocks', message0:'drehe auf der Stelle um %1 Grad', args0:[NUM('ANGLE')],
   tooltip:'Positive Werte drehen nach rechts, negative nach links.'}),
  stmt({type:'pb_drive_arc', style:'drive_blocks', message0:'fahre Kurve mit Radius %1 mm über %2 Grad', args0:[NUM('RADIUS'),NUM('ANGLE')],
   tooltip:'Positiver Radius: Kurve nach rechts, negativer Radius: Kurve nach links.'}),
  stmt({type:'pb_drive_drive', style:'drive_blocks', message0:'fahre los mit %1 mm/s und Drehrate %2 Grad/s', args0:[NUM('SPEED'),NUM('RATE')],
   tooltip:'Startet die Fahrt und läuft weiter, bis ein Stopp-Block kommt. Drehrate 0 bedeutet geradeaus.'}),
  stmt({type:'pb_drive_stop', style:'drive_blocks', message0:'Fahrbasis %1', args0:[{type:'field_dropdown',name:'MODE',options:[['anhalten','stop'],['bremsen','brake']]}],
   tooltip:'Beendet eine mit »fahre los« gestartete Fahrt.'}),
  stmt({type:'pb_drive_settings', style:'drive_blocks', message0:'setze Fahrtempo auf %1 mm/s und Drehtempo auf %2 Grad/s', args0:[NUM('SPEED'),NUM('RATE')],
   tooltip:'Gilt für »fahre geradeaus«, »drehe« und »fahre Kurve«.'}),
  stmt({type:'pb_drive_reset', style:'drive_blocks', message0:'setze Strecke und Winkel der Fahrbasis auf 0', tooltip:'Setzt die Zähler der Fahrbasis zurück.'}),
  val({type:'pb_drive_distance', style:'drive_blocks', message0:'gefahrene Strecke in mm', tooltip:'Strecke seit Programmstart oder dem letzten Zurücksetzen.'}, 'Number'),
  val({type:'pb_drive_angle', style:'drive_blocks', message0:'gedrehter Winkel in Grad', tooltip:'Winkel seit Programmstart oder dem letzten Zurücksetzen.'}, 'Number'),

  // Motoren
  stmt({type:'pb_motor_run_angle', style:'motor_blocks', message0:'Motor %1 dreht sich um %2 Grad mit %3 Grad/s', args0:[PORT,NUM('ANGLE'),NUM('SPEED')], tooltip:'Dreht um einen Winkel und wartet, bis der Motor fertig ist.'}),
  stmt({type:'pb_motor_run_time', style:'motor_blocks', message0:'Motor %1 läuft %2 ms mit %3 Grad/s', args0:[PORT,NUM('TIME'),NUM('SPEED')], tooltip:'Läuft eine bestimmte Zeit.'}),
  stmt({type:'pb_motor_run_target', style:'motor_blocks', message0:'Motor %1 fährt zur Position %2 Grad mit %3 Grad/s', args0:[PORT,NUM('TARGET'),NUM('SPEED')], tooltip:'Fährt auf eine feste Position, gemessen ab dem Zurücksetzen.'}),
  stmt({type:'pb_motor_run', style:'motor_blocks', message0:'Motor %1 startet mit %2 Grad/s', args0:[PORT,NUM('SPEED')], tooltip:'Läuft weiter, bis ein Stopp-Block kommt.'}),
  stmt({type:'pb_motor_stop', style:'motor_blocks', message0:'Motor %1 %2', args0:[PORT,{type:'field_dropdown',name:'MODE',options:[['ausrollen lassen','stop'],['bremsen','brake'],['Position halten','hold']]}], tooltip:'Hält den Motor an.'}),
  stmt({type:'pb_motor_reset', style:'motor_blocks', message0:'setze Winkel von Motor %1 auf %2 Grad', args0:[PORT,NUM('ANGLE')], tooltip:'Legt fest, welche Stellung als 0 Grad zählt.'}),
  val({type:'pb_motor_angle', style:'motor_blocks', message0:'Winkel von Motor %1', args0:[PORT], tooltip:'Aktueller Winkel in Grad.'}, 'Number'),
  val({type:'pb_motor_speed', style:'motor_blocks', message0:'Tempo von Motor %1', args0:[PORT], tooltip:'Aktuelle Geschwindigkeit in Grad pro Sekunde.'}, 'Number'),

  // Sensoren
  val({type:'pb_color_is', style:'sensor_blocks', message0:'Farbsensor %1 sieht %2', args0:[PORT,{type:'field_dropdown',name:'COLOR',options:COLORS_SENSE}],
   tooltip:'Erkennt der Sensor die gewählte Farbe? Für schwarze Linien ist »Reflexion« meist zuverlässiger.'}, 'Boolean'),
  val({type:'pb_reflection', style:'sensor_blocks', message0:'Reflexion an Farbsensor %1 in %%', args0:[PORT], tooltip:'0 = sehr dunkel, 100 = sehr hell.'}, 'Number'),
  val({type:'pb_distance', style:'sensor_blocks', message0:'Abstand an Sensor %1 in mm', args0:[PORT], tooltip:'Liefert 2000, wenn nichts erkannt wird.'}, 'Number'),
  val({type:'pb_force_pressed', style:'sensor_blocks', message0:'Kraftsensor %1 gedrückt', args0:[PORT], tooltip:'Wahr, sobald der Taster gedrückt ist.'}, 'Boolean'),
  val({type:'pb_force', style:'sensor_blocks', message0:'Kraft an Sensor %1 in N', args0:[PORT], tooltip:'Druckkraft in Newton.'}, 'Number'),
  val({type:'pb_heading', style:'sensor_blocks', message0:'Ausrichtung des Hubs in Grad', tooltip:'Gemessen vom eingebauten Gyrosensor, positiv nach rechts.'}, 'Number'),
  stmt({type:'pb_reset_heading', style:'sensor_blocks', message0:'setze Ausrichtung des Hubs auf %1 Grad', args0:[NUM('ANGLE')], tooltip:'Legt die aktuelle Richtung als neuen Bezug fest.'}),
  val({type:'pb_button', style:'sensor_blocks', message0:'Hub-Taste %1 gedrückt', args0:[{type:'field_dropdown',name:'BUTTON',options:[['links','LEFT'],['rechts','RIGHT']]}],
   tooltip:'Die mittlere Taste beendet bei Pybricks das Programm.'}, 'Boolean'),
  stmt({type:'pb_timer_reset', style:'sensor_blocks', message0:'setze Stoppuhr auf 0', tooltip:'Startet die Zeitmessung neu.'}),
  val({type:'pb_timer', style:'sensor_blocks', message0:'Stoppuhr in ms', tooltip:'Zeit seit Programmstart oder dem letzten Zurücksetzen.'}, 'Number'),

  // Licht und Ton
  stmt({type:'pb_display_text', style:'hub_blocks', message0:'zeige Text %1', args0:[{type:'input_value',name:'TEXT'}], tooltip:'Lässt den Text über die Lichtmatrix laufen.'}),
  stmt({type:'pb_display_number', style:'hub_blocks', message0:'zeige Zahl %1', args0:[NUM('NUM')], tooltip:'Zeigt Zahlen von −99 bis 99.'}),
  stmt({type:'pb_display_pixels', style:'hub_blocks', message0:'zeige Muster %1', args0:[{type:'field_matrix', name:'PIXELS'}],
   tooltip:'Zeigt ein eigenes Muster auf der Lichtmatrix. Ein Klick auf das Muster öffnet den Editor: Punkte an- und ausschalten, rechts die Helligkeit wählen, unten Vorlagen.'}),
  stmt({type:'pb_display_icon', style:'hub_blocks', message0:'zeige Bild %1', args0:[{type:'field_dropdown',name:'ICON',options:ICONS}], tooltip:'Zeigt ein Bild auf der Lichtmatrix.'}),
  stmt({type:'pb_display_off', style:'hub_blocks', message0:'schalte Lichtmatrix aus', tooltip:'Löscht die Anzeige.'}),
  stmt({type:'pb_light', style:'hub_blocks', message0:'Statuslicht %1', args0:[{type:'field_dropdown',name:'COLOR',options:COLORS_LIGHT}], tooltip:'Farbe der Mitteltaste.'}),
  stmt({type:'pb_beep', style:'hub_blocks', message0:'Piepton %1 Hz für %2 ms', args0:[NUM('FREQ'),NUM('DUR')], tooltip:'440 Hz ist der Kammerton a.'}),
  stmt({type:'pb_print', style:'hub_blocks', message0:'gib %1 im Terminal aus', args0:[{type:'input_value',name:'TEXT'}], tooltip:'Erscheint im Terminal von Pybricks Code – praktisch zur Fehlersuche.'}),

  // Fernsteuerung: Xbox-Controller
  val({type:'pb_xbox_stick', style:'remote_blocks', message0:'Controller: Stick %1 Achse %2',
   args0:[{type:'field_dropdown',name:'SIDE',options:[['links','left'],['rechts','right']]},
          {type:'field_dropdown',name:'AXIS',options:[['x (seitlich)','0'],['y (vor und zurück)','1']]}],
   tooltip:'Stellung des Sticks von −100 bis 100. In der Mitte ist der Wert 0.'}, 'Number'),
  val({type:'pb_xbox_trigger', style:'remote_blocks', message0:'Controller: Trigger %1',
   args0:[{type:'field_dropdown',name:'SIDE',options:[['links','0'],['rechts','1']]}],
   tooltip:'Wie weit der Trigger (Schultertaste hinten) gedrückt ist: 0 bis 100.'}, 'Number'),
  val({type:'pb_xbox_button', style:'remote_blocks', message0:'Controller: Taste %1 gedrückt',
   args0:[{type:'field_dropdown',name:'BUTTON',options:[['A','A'],['B','B'],['X','X'],['Y','Y'],['LB','LB'],['RB','RB'],
     ['Kreuz hoch','UP'],['Kreuz runter','DOWN'],['Kreuz links','LEFT'],['Kreuz rechts','RIGHT'],['Menü','MENU'],['Ansicht','VIEW']]}],
   tooltip:'Wahr, solange die Taste am Xbox-Controller gedrückt ist.'}, 'Boolean'),
  stmt({type:'pb_xbox_rumble', style:'remote_blocks', message0:'Controller vibriert mit %1 %% für %2 ms', args0:[NUM('POWER'),NUM('DUR')],
   tooltip:'Lässt den Controller vibrieren. Das Programm läuft dabei sofort weiter.'}),
  // Fernsteuerung: LEGO-Fernbedienung
  val({type:'pb_remote_button', style:'remote_blocks', message0:'Fernbedienung: Taste %1 gedrückt',
   args0:[{type:'field_dropdown',name:'BUTTON',options:[['links +','LEFT_PLUS'],['links rot','LEFT'],['links −','LEFT_MINUS'],
     ['rechts +','RIGHT_PLUS'],['rechts rot','RIGHT'],['rechts −','RIGHT_MINUS'],['grün (Mitte)','CENTER']]}],
   tooltip:'Wahr, solange die Taste an der LEGO-Fernbedienung (Powered Up) gedrückt ist.'}, 'Boolean'),
  stmt({type:'pb_remote_light', style:'remote_blocks', message0:'Licht der Fernbedienung %1', args0:[{type:'field_dropdown',name:'COLOR',options:COLORS_LIGHT}],
   tooltip:'Farbe des Lichts an der LEGO-Fernbedienung.'}),
  // Fernsteuerung: Steuerfeld in Blockwerk
  val({type:'pb_pad_stick', style:'remote_blocks', message0:'Steuerfeld: Joystick %1',
   args0:[{type:'field_dropdown',name:'AXIS',options:[['x (seitlich)','x'],['y (vor und zurück)','y']]}],
   tooltip:'Stellung des Joysticks im Steuerfeld von Blockwerk: −100 bis 100.'}, 'Number'),
  val({type:'pb_pad_button', style:'remote_blocks', message0:'Steuerfeld: Taste %1 gedrückt',
   args0:[{type:'field_dropdown',name:'BUTTON',options:[['A','A'],['B','B'],['C','C'],['D','D']]}],
   tooltip:'Wahr, solange die Taste im Steuerfeld von Blockwerk gedrückt ist.'}, 'Boolean'),

  // Steuerung
  stmt({type:'pb_wait', style:'loop_blocks', message0:'warte %1 ms', args0:[NUM('MS')], tooltip:'1000 ms sind eine Sekunde.'}),
  {type:'pb_forever', style:'loop_blocks', message0:'wiederhole fortlaufend %1 %2', args0:[{type:'input_end_row'},{type:'input_statement',name:'DO'}],
   previousStatement:null, tooltip:'Wiederholt die Blöcke darin, bis das Programm beendet wird.'},
  stmt({type:'pb_wait_until', style:'loop_blocks', message0:'warte bis %1', args0:[{type:'input_value',name:'COND',check:'Boolean'}], tooltip:'Wartet, bis die Bedingung erfüllt ist.'}),

  // Platzhalter für SPIKE-Blöcke, die der Import nicht übersetzen kann
  stmt({type:'pb_unsupported', style:'unsupported_blocks', message0:'⚠ nicht übersetzt: %1', args0:[{type:'field_label_serializable',name:'WHAT',text:''}],
   tooltip:'Diesen Block aus der SPIKE-App konnte Blockwerk nicht übersetzen. Er tut nichts – ersetzt ihn durch passende Blöcke.'}),
  val({type:'pb_unsupported_value', style:'unsupported_blocks', message0:'⚠ nicht übersetzt: %1', args0:[{type:'field_label_serializable',name:'WHAT',text:''}],
   tooltip:'Diesen Wert aus der SPIKE-App konnte Blockwerk nicht übersetzen. Er liefert 0 – ersetzt ihn durch einen passenden Block.'}, null as unknown as string),

  // Operatoren
  val({type:'pb_abs', style:'math_blocks', message0:'Betrag von %1', args0:[NUM('NUM')], tooltip:'Macht negative Zahlen positiv.'}, 'Number')
]);
