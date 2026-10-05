import { describe, expect, it } from 'vitest';
import {
  defaultLayout, defaultLayouts, fits, GRIDS, moveTile, orientationFor, resizeTile, sanitizeLayouts, sizeRange, TILE_IDS,
  type Orientation, type Tile
} from '../src/hub/padLayout';

const get = (tiles: Tile[], id: string) => tiles.find(t => t.id === id)!;

describe('Anordnung des Steuerfelds', () => {
  for (const o of Object.keys(GRIDS) as Orientation[]){
    it(`${o}: die Ausgangslage enthält jedes Teil einmal, im Raster und ohne Überdeckung`, () => {
      const tiles = defaultLayout(o);
      expect(tiles.map(t => t.id).sort()).toEqual([...TILE_IDS].sort());
      for (const t of tiles) expect(fits(tiles, t, GRIDS[o])).toBe(true);
    });
    it(`${o}: Joystick links, Tasten rechts, alles in der unteren Hälfte – für die Daumen`, () => {
      const tiles = defaultLayout(o), g = GRIDS[o];
      const stick = get(tiles, 'stick');
      expect(stick.col + stick.size / 2).toBeLessThan(g.cols / 2);
      for (const t of tiles.filter(t => t.id !== 'stick')) expect(t.col + t.size / 2).toBeGreaterThan(g.cols / 2);
      for (const t of tiles) expect(t.row + t.size / 2).toBeGreaterThanOrEqual(g.rows / 4);
    });
  }

  it('wählt das Raster nach der Form der Fläche: Tablet quer, Handy quer flach, sonst hoch', () => {
    expect(orientationFor(1260, 690)).toBe('quer');    // Tablet 16:10
    expect(orientationFor(1004, 650)).toBe('quer');    // iPad 4:3
    expect(orientationFor(895, 290)).toBe('flach');    // Handy quer
    expect(orientationFor(780, 1100)).toBe('hoch');
    expect(orientationFor(400, 760)).toBe('hoch');
    // in jedem Raster sind die Felder dann ungefähr quadratisch
    for (const [w, h] of [[1260, 690], [1004, 650], [895, 290], [780, 1100], [400, 760]]){
      const g = GRIDS[orientationFor(w, h)], ratio = (w / g.cols) / (h / g.rows);
      expect(ratio).toBeGreaterThan(0.6);
      expect(ratio).toBeLessThan(1.6);
    }
  });

  it('verschiebt ein Teil auf einen freien Platz und weigert sich bei besetztem oder außerhalb', () => {
    const tiles = defaultLayout('quer'), g = GRIDS.quer;
    const moved = moveTile(tiles, 'A', 6, 0, g)!;
    expect(get(moved, 'A')).toEqual({id:'A', col:6, row:0, size:2});
    expect(get(tiles, 'A').col).toBe(12);                // die alte Liste bleibt unverändert
    const stick = get(tiles, 'stick');
    expect(moveTile(tiles, 'A', stick.col + 1, stick.row + 1, g)).toBeNull();   // auf dem Joystick
    expect(moveTile(tiles, 'A', g.cols - 1, 0, g)).toBeNull();                  // ragt hinaus
    expect(moveTile(tiles, 'A', -1, 0, g)).toBeNull();
    // ein Teil darf auf seinem eigenen Platz liegen bleiben
    expect(moveTile(tiles, 'A', 12, 6, g)).not.toBeNull();
  });

  it('ändert die Größe um die Mitte und hält die Grenzen ein', () => {
    const g = GRIDS.quer;
    const alone: Tile[] = [{id:'stick', col:4, row:2, size:3}, {id:'A', col:9, row:0, size:1}, {id:'B', col:11, row:0, size:1}, {id:'C', col:13, row:0, size:1}, {id:'D', col:15, row:0, size:1}];
    const bigger = get(resizeTile(alone, 'stick', 2, g)!, 'stick');
    expect(bigger).toEqual({id:'stick', col:3, row:1, size:5});
    const [min, max] = sizeRange('stick');
    let tiles = alone;
    for (let i = 0; i < 10; i++) tiles = resizeTile(tiles, 'stick', 1, g) ?? tiles;
    expect(get(tiles, 'stick').size).toBe(max);
    for (let i = 0; i < 10; i++) tiles = resizeTile(tiles, 'stick', -1, g) ?? tiles;
    expect(get(tiles, 'stick').size).toBe(min);
    // eine Taste am Rand wächst nach innen statt über den Rand
    const edge = get(resizeTile(alone, 'D', 1, g)!, 'D');
    expect(edge.size).toBe(2);
    expect(edge.col + edge.size).toBeLessThanOrEqual(g.cols);
    expect(edge.row).toBeGreaterThanOrEqual(0);
    // eingekeilt zwischen zwei Nachbarn in der obersten Reihe geht es nicht größer
    const tight: Tile[] = [{id:'stick', col:0, row:5, size:3}, {id:'A', col:9, row:0, size:2}, {id:'B', col:11, row:0, size:1}, {id:'C', col:12, row:0, size:2}, {id:'D', col:10, row:2, size:3}];
    for (const t of tight) expect(fits(tight, t, g)).toBe(true);
    expect(resizeTile(tight, 'B', 1, g)).toBeNull();
  });

  it('nimmt eine gespeicherte Anordnung nur an, wenn sie stimmt', () => {
    const good = defaultLayouts();
    good.quer = moveTile(good.quer, 'A', 6, 0, GRIDS.quer)!;
    // die Reihenfolge der Teile ist nach dem Prüfen immer dieselbe
    const sorted = (tiles: Tile[]) => TILE_IDS.map(id => get(tiles, id));
    const order = (l: typeof good) => ({quer:sorted(l.quer), flach:sorted(l.flach), hoch:sorted(l.hoch)});
    expect(sanitizeLayouts(JSON.parse(JSON.stringify(good)))).toEqual(order(good));
    expect(sanitizeLayouts(null)).toEqual(defaultLayouts());
    expect(sanitizeLayouts('unsinn')).toEqual(defaultLayouts());
    // überdeckt, fehlt, außerhalb, keine ganze Zahl: jeweils zurück zur Ausgangslage – nur für dieses Format
    const overlap = {...good, hoch:good.hoch.map(t => ({...t, col:0, row:0}))};
    expect(sanitizeLayouts(overlap)).toEqual({...order(good), hoch:defaultLayout('hoch')});
    expect(sanitizeLayouts({quer:good.quer.slice(1), hoch:good.hoch}).quer).toEqual(defaultLayout('quer'));
    expect(sanitizeLayouts({quer:good.quer.map(t => t.id === 'A' ? {...t, col:99} : t)}).quer).toEqual(defaultLayout('quer'));
    expect(sanitizeLayouts({quer:good.quer.map(t => t.id === 'A' ? {...t, size:1.5} : t)}).quer).toEqual(defaultLayout('quer'));
    expect(sanitizeLayouts({quer:good.quer.map(t => t.id === 'A' ? {...t, size:9} : t)}).quer).toEqual(defaultLayout('quer'));
  });
});
