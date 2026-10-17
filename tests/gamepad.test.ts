import { describe, expect, it } from 'vitest';
import { gamepadName, readGamepad, watchGamepad, type GamepadLike } from '../src/hub/gamepad';

/** Ein Gamepad mit der Standardbelegung: 4 Achsen, 17 Tasten. */
function pad(over: {axes?: number[]; down?: number[]; id?: string; connected?: boolean} = {}): GamepadLike {
  return {
    id:over.id ?? 'Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)', connected:over.connected ?? true,
    axes:over.axes ?? [0, 0, 0, 0],
    buttons:Array.from({length:17}, (_, i) => ({pressed:(over.down ?? []).includes(i)}))
  };
}
const idle = {A:false, B:false, C:false, D:false, E:false, F:false, G:false, H:false, I:false, J:false};
const still = {x:0, y:0};
const rest = {sticks:[still, still], buttons:idle};
/** Joystick 1 */
const left = (gp: GamepadLike) => readGamepad(gp).sticks[0];

describe('Gamepad am Gerät', () => {
  it('übersetzt den linken Stick: rechts und vorn sind positiv, kleine Ausschläge zählen nicht', () => {
    expect(readGamepad(pad())).toEqual(rest);
    expect(left(pad({axes:[1, 0, 0, 0]})).x).toBe(100);
    expect(left(pad({axes:[-1, 0, 0, 0]})).x).toBe(-100);
    // der Browser zählt y nach unten – Stick nach vorn heißt −1
    expect(left(pad({axes:[0, -1, 0, 0]})).y).toBe(100);
    expect(left(pad({axes:[0, 1, 0, 0]})).y).toBe(-100);
    // ein ruhender Stick steht selten genau auf null
    expect(readGamepad(pad({axes:[0.1, -0.15, 0.12, 0.1]}))).toEqual(rest);
    const half = left(pad({axes:[0.59, 0, 0, 0]})).x;
    expect(half).toBeGreaterThan(40);
    expect(half).toBeLessThan(60);
    // der rechte Stick ist Joystick 2
    expect(readGamepad(pad({axes:[0, 0, 1, -1]}))).toEqual({...rest, sticks:[still, {x:100, y:100}]});
  });

  it('nimmt das Steuerkreuz als voll ausgelenkten Stick, solange der Stick ruht', () => {
    expect(left(pad({down:[12]}))).toEqual({x:0, y:100});
    expect(left(pad({down:[13, 15]}))).toEqual({x:100, y:-100});
    expect(left(pad({down:[14]}))).toEqual({x:-100, y:0});
    expect(left(pad({axes:[0.6, 0, 0, 0], down:[14]})).x).toBeGreaterThan(0);
  });

  it('legt die Tasten wie in der Controller-Ansicht: A unten, B rechts, C = X links, D = Y oben, dann E bis J', () => {
    expect(readGamepad(pad({down:[0]})).buttons).toEqual({...idle, A:true});
    expect(readGamepad(pad({down:[1]})).buttons).toEqual({...idle, B:true});
    expect(readGamepad(pad({down:[2]})).buttons).toEqual({...idle, C:true});
    expect(readGamepad(pad({down:[3]})).buttons).toEqual({...idle, D:true});
    // danach der Reihe nach: Schultertasten E/F, Trigger G/H, Ansicht I, Menü J
    expect(readGamepad(pad({down:[4, 7]})).buttons).toEqual({...idle, E:true, H:true});
    expect(readGamepad(pad({down:[8, 9]})).buttons).toEqual({...idle, I:true, J:true});
    // Steuerkreuz und Stick-Klicks sind keine Tasten
    expect(readGamepad(pad({down:[10, 11, 12, 16]})).buttons).toEqual(idle);
    // ein Gerät mit weniger Tasten oder Achsen bringt nichts durcheinander
    expect(readGamepad({id:'x', connected:true, axes:[], buttons:[]})).toEqual(rest);
  });

  it('kürzt den Namen für die Anzeige', () => {
    expect(gamepadName('Xbox Wireless Controller (STANDARD GAMEPAD Vendor: 045e Product: 0b13)')).toBe('Xbox Wireless Controller');
    expect(gamepadName('045e-0b13-Xbox Wireless Controller')).toBe('Xbox Wireless Controller');
    expect(gamepadName('  ')).toBe('Controller');
  });

  it('gibt nur Änderungen weiter und lässt beim Trennen alles los', () => {
    const log: string[] = [];
    let pads: (GamepadLike | null)[] = [null];
    const tick = watchGamepad({
      setStick:(x, y, stick) => log.push(`stick${stick} ${x} ${y}`),
      setButton:(b, down) => log.push(`${b} ${down ? 'ab' : 'auf'}`),
      onGamepad:(name) => log.push(name ? `da: ${name}` : 'weg')
    }, {getGamepads:() => pads, every:() => () => {}});

    tick(); tick();
    expect(log).toEqual([]);                       // ohne Gamepad passiert nichts – Finger und Tastatur bleiben ungestört
    pads = [null, pad()];
    tick(); tick();
    expect(log).toEqual(['da: Xbox Wireless Controller']);   // erkannt, aber nichts gedrückt
    pads = [null, pad({axes:[1, 0, 0, 0], down:[0]})];
    tick(); tick(); tick();
    expect(log.slice(1)).toEqual(['stick1 100 0', 'A ab']);   // jede Änderung genau einmal
    pads = [null, pad({axes:[1, 0, 0, 0]})];
    tick();
    expect(log.slice(3)).toEqual(['A auf']);
    pads = [null, pad({axes:[1, 0, 0, 0], down:[3], connected:false})];
    tick();
    expect(log.slice(4)).toEqual(['stick1 0 0', 'weg']);      // Verbindung weg: Roboter bleibt stehen
    tick();
    expect(log.length).toBe(6);
  });
});
