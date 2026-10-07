// ---------------------------------------------------------------
// Blockliste in fester Größe.
// Blockly lässt die Blockliste mit der Arbeitsfläche mitzoomen: Wer nah heranzoomt, hat riesige
// Blöcke in der Liste und sieht nur noch zwei davon. Hier bleibt sie so groß wie beim Start (wie in
// der SPIKE-App); ein Block wechselt seine Größe einmal, wenn er auf die Arbeitsfläche gezogen wird.
// Dazu die Blockliste für das Handy hochkant: eine Leiste ganz unten, über die sich die Kategorien
// schieben, sobald eine gewählt ist.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import { isPhone } from './viewMode';

/** Größe, mit der die Arbeitsfläche beginnt – und die die Blockliste behält. */
export const START_SCALE = 0.72;
/** Namen, unter denen die Blocklisten bei Blockly angemeldet sind (»plugins« beim Aufbau der Arbeitsfläche). */
export const FIXED_FLYOUT = 'blockwerkFesteListe';
export const BOTTOM_FLYOUT = 'blockwerkListeUnten';

/** Auf dem Handy ist die Liste etwas kleiner: Neben den Kategorien bleibt dort wenig Platz. */
const PHONE_SCALE = 0.6;
const listScale = () => isPhone() ? PHONE_SCALE : START_SCALE;

class FixedFlyout extends Blockly.VerticalFlyout {
  override getFlyoutScale(){ return listScale(); }
  // Blockly setzt beim Auslegen der Liste die Größe der Arbeitsfläche ein, ohne nachzufragen
  protected override layout_(contents: Blockly.FlyoutItem[]){
    super.layout_(contents);
    this.workspace_.scale = listScale();
  }
}
Blockly.registry.register(Blockly.registry.Type.FLYOUTS_VERTICAL_TOOLBOX, FIXED_FLYOUT, FixedFlyout);

/**
 * Handy hochkant: Die Blöcke liegen nebeneinander in einer Leiste am unteren Rand. Blockly setzte sie
 * über die Leiste der Kategorien; hier liegt sie ganz unten, und die Kategorien rücken darüber – wie
 * hoch, erfährt das Stylesheet über `--fly-h` am Rahmen der Arbeitsfläche.
 */
class BottomFlyout extends Blockly.HorizontalFlyout {
  override getFlyoutScale(){ return listScale(); }
  protected override layout_(contents: Blockly.FlyoutItem[]){
    super.layout_(contents);
    this.workspace_.scale = listScale();
  }
  override getY(){
    if (!this.isVisible()) return 0;
    return this.targetWorkspace.getMetricsManager().getSvgMetrics().height - this.getHeight();
  }
  private report(){
    this.targetWorkspace?.getInjectionDiv()?.style.setProperty('--fly-h', (this.isVisible() ? this.getHeight() : 0) + 'px');
  }
  override position(){ super.position(); this.report(); }
  override setVisible(visible: boolean){ super.setVisible(visible); this.report(); }
  override dispose(){ this.targetWorkspace?.getInjectionDiv()?.style.removeProperty('--fly-h'); super.dispose(); }
}
Blockly.registry.register(Blockly.registry.Type.FLYOUTS_HORIZONTAL_TOOLBOX, BOTTOM_FLYOUT, BottomFlyout);
