// ---------------------------------------------------------------
// Blockliste in fester Größe.
// Blockly lässt die Blockliste mit der Arbeitsfläche mitzoomen: Wer nah heranzoomt, hat riesige
// Blöcke in der Liste und sieht nur noch zwei davon. Hier bleibt sie so groß wie beim Start (wie in
// der SPIKE-App); ein Block wechselt seine Größe einmal, wenn er auf die Arbeitsfläche gezogen wird.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';

/** Größe, mit der die Arbeitsfläche beginnt – und die die Blockliste behält. */
export const START_SCALE = 0.72;
/** Name, unter dem die Blockliste bei Blockly angemeldet ist (»plugins« beim Aufbau der Arbeitsfläche). */
export const FIXED_FLYOUT = 'blockwerkFesteListe';

/** Auf dem Handy ist die Liste etwas kleiner: Neben den Kategorien bleibt dort wenig Platz. */
const PHONE_SCALE = 0.6;
const listScale = () => window.matchMedia('(max-width: 600px)').matches ? PHONE_SCALE : START_SCALE;

class FixedFlyout extends Blockly.VerticalFlyout {
  override getFlyoutScale(){ return listScale(); }
  // Blockly setzt beim Auslegen der Liste die Größe der Arbeitsfläche ein, ohne nachzufragen
  protected override layout_(contents: Blockly.FlyoutItem[]){
    super.layout_(contents);
    this.workspace_.scale = listScale();
  }
}
Blockly.registry.register(Blockly.registry.Type.FLYOUTS_VERTICAL_TOOLBOX, FIXED_FLYOUT, FixedFlyout);
