// ---------------------------------------------------------------
// Steuerfeld als schmaler Streifen unter dem Code: für Maus und Tastatur.
// Er zeigt dieselben Teile wie die Controller-Ansicht (padView.ts) – nur nebeneinander statt frei
// angeordnet: die Joysticks, dann die Tasten in Vierergruppen (A–D, E–H, I–J).
// ---------------------------------------------------------------
import type { Pad } from './pad';
import { isStick, partName, STICK_IDS, stickNumber, type TileId } from './padLayout';
import { PAD_BUTTONS } from './padProtocol';
import type { PadView } from './padView';

export function initPadStrip(root: HTMLElement, pad: Pad, view: PadView){
  const sticksEl = root.querySelector<HTMLElement>('.pad-sticks')!, buttonsEl = root.querySelector<HTMLElement>('.pad-buttons')!;
  const keysEl = root.querySelector<HTMLElement>('.pad-keys')!;
  const els = {} as Record<TileId, HTMLElement>;
  for (const id of STICK_IDS){
    const ring = document.createElement('div'), knob = document.createElement('div'), num = document.createElement('span');
    ring.className = 'pad-stick'; knob.className = 'pad-knob'; num.className = 'pad-num';
    ring.dataset.stick = num.textContent = String(stickNumber(id));
    ring.setAttribute('aria-label', partName(id));
    ring.append(knob, num);
    sticksEl.append(ring);
    pad.bindStick(ring, ring, knob, {stick:stickNumber(id)});
    // damit danach auch die Tastatur wirkt
    ring.addEventListener('pointerdown', () => root.focus());
    els[id] = ring;
  }
  const groups: HTMLElement[] = [];
  PAD_BUTTONS.forEach((id, i) => {
    if (i % 4 === 0){ groups.push(document.createElement('div')); groups.at(-1)!.className = 'pad-group'; buttonsEl.append(groups.at(-1)!); }
    const b = document.createElement('button');
    b.type = 'button'; b.dataset.pad = b.textContent = id;
    b.setAttribute('aria-label', partName(id));
    groups.at(-1)!.append(b);
    pad.bindButton(b, id);
    els[id] = b;
  });

  function show(parts: TileId[]){
    for (const [id, e] of Object.entries(els) as [TileId, HTMLElement][]) e.classList.toggle('hidden', !parts.includes(id));
    for (const g of groups) g.classList.toggle('hidden', ![...g.children].some(c => !c.classList.contains('hidden')));
    const sticks = parts.filter(isStick).length, buttons = parts.filter(id => !isStick(id));
    root.classList.toggle('sticks', sticks > 1);
    // die Legende nennt nur, was es gibt; Taste J liegt auf der 0
    const lastKey = String(PAD_BUTTONS.indexOf(buttons.at(-1) as typeof PAD_BUTTONS[number]) + 1).replace('10', '0');
    // umbrochen wird nur zwischen den Angaben
    keysEl.innerHTML = [...(sticks > 1 ? ['<kbd>W A S D</kbd> Joystick 1', '<kbd>I J K L</kbd> Joystick 2'] : ['<kbd>W A S D</kbd> oder Pfeile: Joystick']),
      `<kbd>1</kbd>–<kbd>${lastKey}</kbd> Tasten`].map(s => `<span>${s}</span>`).join(' · ');
  }
  show(view.parts());
  view.onParts(show);
}
