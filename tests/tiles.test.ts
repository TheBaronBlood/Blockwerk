import { describe, expect, it } from 'vitest';
import {
  cellAt, mapSize, openEnds, readTileMap, resizeMap, startPose, tapTile, TEMPLATES, TILE_KINDS, tileAt, tileExits, tileShapes, turnTile,
  type Tile, type TileMap
} from '../src/sim/tiles';

const empty = (cols = 3, rows = 2): TileMap => ({cols, rows, tiles:new Array(cols * rows).fill(null)});
/** Mitte des Felds (Spalte, Zeile) in Millimetern, auf Wunsch ein Stück daneben. */
const at = (col: number, row: number, dx = 0, dy = 0) => ({x:col * 300 + 150 + dx, y:row * 300 + 150 + dy});
const tile = (kind: Tile['kind'], turn = 0, green?: number): Tile => green ? {kind, turn, green} : {kind, turn};

describe('Platten', () => {
  it('an welchen Seiten die Linie ankommt', () => {
    expect(tileExits(tile('straight'))).toBe('NS');
    expect(tileExits(tile('curve'))).toBe('ES');
    expect(tileExits(tile('corner'))).toBe('ES');
    expect(tileExits(tile('tee'))).toBe('ESW');
    expect(tileExits(tile('cross'))).toBe('NESW');
    expect(tileExits(tile('gap'))).toBe('NS');
    expect(tileExits(tile('circle'))).toBe('NESW');
    expect(tileExits(tile('end'))).toBe('S');
    for (const kind of ['zigzag', 'wave', 'goal'] as const) expect(tileExits(tile(kind)), kind).toBe('NS');
  });
  it('drehen geht im Uhrzeigersinn: aus unten wird links', () => {
    expect(tileExits(tile('straight', 1))).toBe('EW');
    expect([0, 1, 2, 3].map(turn => tileExits(tile('curve', turn)))).toEqual(['ES', 'SW', 'NW', 'NE']);
    expect([0, 1, 2, 3].map(turn => tileExits(tile('tee', turn)))).toEqual(['ESW', 'NSW', 'NEW', 'NES']);
    expect(tileExits(tile('end', 2))).toBe('N');
    // mehr als eine ganze Drehung zählt wie der Rest
    expect(tileExits(tile('curve', 5))).toBe('SW');
  });
  it('jede Platte bleibt auf ihrem Feld', () => {
    for (const kind of TILE_KINDS) for (const turn of [0, 1, 2, 3]){
      const {lines, rects} = tileShapes(tile(kind, turn, 15));
      for (const p of lines.flat()){ expect(p.x, kind).toBeGreaterThanOrEqual(0); expect(p.x, kind).toBeLessThanOrEqual(300); expect(p.y, kind).toBeGreaterThanOrEqual(0); expect(p.y, kind).toBeLessThanOrEqual(300); }
      for (const r of rects){ expect(r.x).toBeGreaterThanOrEqual(0); expect(r.x + r.w).toBeLessThanOrEqual(300); expect(r.y).toBeGreaterThanOrEqual(0); expect(r.y + r.h).toBeLessThanOrEqual(300); }
    }
  });
  it('die Lücke unterbricht die Linie in der Mitte', () => {
    const [first, second] = tileShapes(tile('gap')).lines;
    expect(first[first.length - 1]).toEqual({x:150, y:100}); expect(second[0]).toEqual({x:150, y:200});
  });
  it('die Ziellinie ist ein roter Streifen quer zur Linie', () => {
    expect(tileShapes(tile('goal')).rects).toEqual([{x:0, y:137.5, w:300, h:25, color:'red'}]);
    expect(tileShapes(tile('goal', 1)).rects).toEqual([{x:137.5, y:0, w:25, h:300, color:'red'}]);
  });
});

describe('grüne Punkte', () => {
  it('liegen in den Ecken der Kreuzung, direkt an beiden Linien', () => {
    // oben links: die Linie ist 20 mm breit, der Punkt 25 mm – er reicht von 115 bis 140
    expect(tileShapes(tile('cross', 0, 1)).rects).toEqual([{x:115, y:115, w:25, h:25, color:'green'}]);
    expect(tileShapes(tile('cross', 0, 2)).rects[0]).toMatchObject({x:160, y:115});
    expect(tileShapes(tile('cross', 0, 4)).rects[0]).toMatchObject({x:160, y:160});
    expect(tileShapes(tile('cross', 0, 8)).rects[0]).toMatchObject({x:115, y:160});
    expect(tileShapes(tile('cross', 0, 15)).rects).toHaveLength(4);
  });
  it('drehen sich mit der Platte', () => {
    // oben links gesetzt, einmal gedreht: oben rechts
    expect(tileShapes(tile('tee', 1, 1)).rects[0]).toMatchObject({x:160, y:115});
  });
  it('ein Tipp in die Ecke setzt den Punkt dort, ein zweiter nimmt ihn weg', () => {
    let map = tapTile(empty(), 'cross', at(1, 0));
    map = tapTile(map, 'green', at(1, 0, 40, 40));   // unten rechts
    expect(tileAt(map, 1, 0)).toEqual({kind:'cross', turn:0, green:4});
    map = tapTile(map, 'green', at(1, 0, -40, 40));  // unten links dazu
    expect(tileAt(map, 1, 0)?.green).toBe(12);
    map = tapTile(map, 'green', at(1, 0, 40, 40));
    map = tapTile(map, 'green', at(1, 0, -40, 40));
    expect(tileAt(map, 1, 0)).toEqual({kind:'cross', turn:0});
  });
  it('an der gedrehten Platte landet der Punkt in der Ecke, in die getippt wurde', () => {
    let map = tapTile(empty(), 'tee', at(0, 0));
    map = turnTile(map, 0, 0);
    map = tapTile(map, 'green', at(0, 0, -40, 40));   // unten links, wie man es sieht
    expect(tileShapes(tileAt(map, 0, 0)!).rects[0]).toMatchObject({x:115, y:160});
  });
  it('gibt es nur, wo sich Linien treffen', () => {
    const map = tapTile(empty(), 'straight', at(0, 0));
    expect(tapTile(map, 'green', at(0, 0, 40, 40))).toBe(map);
    expect(tapTile(map, 'green', at(2, 1))).toBe(map);   // leeres Feld
    expect(readTileMap({cols:2, rows:2, tiles:[{kind:'curve', turn:0, green:5}, null, null, null]})?.tiles[0]).toEqual({kind:'curve', turn:0});
  });
});

describe('Bahn bauen', () => {
  it('ein Tipp legt die Platte, noch einer dreht sie', () => {
    let map = tapTile(empty(), 'curve', at(2, 1));
    expect(tileAt(map, 2, 1)).toEqual({kind:'curve', turn:0});
    map = tapTile(map, 'curve', at(2, 1));
    expect(tileAt(map, 2, 1)).toEqual({kind:'curve', turn:1});
    for (let i = 0; i < 3; i++) map = tapTile(map, 'curve', at(2, 1));
    expect(tileAt(map, 2, 1)?.turn).toBe(0);
  });
  it('eine andere Platte übernimmt, wie die alte lag; der Radierer leert das Feld', () => {
    let map = tapTile(tapTile(empty(), 'straight', at(0, 0)), 'straight', at(0, 0));
    map = tapTile(map, 'gap', at(0, 0));
    expect(tileAt(map, 0, 0)).toEqual({kind:'gap', turn:1});
    map = tapTile(map, 'erase', at(0, 0));
    expect(tileAt(map, 0, 0)).toBeNull();
    expect(tapTile(map, 'erase', at(0, 0))).toBe(map);
  });
  it('neben der Bahn bewirkt ein Tipp nichts', () => {
    const map = empty();
    expect(tapTile(map, 'cross', {x:-5, y:10})).toBe(map);
    expect(tapTile(map, 'cross', {x:901, y:10})).toBe(map);
    expect(cellAt(map, {x:899, y:599})).toEqual({col:2, row:1});
    expect(cellAt(map, {x:900, y:599})).toBeNull();
  });
  it('größer und kleiner: was hineinpasst, bleibt liegen', () => {
    const map = tapTile(tapTile(empty(3, 2), 'cross', at(0, 0)), 'curve', at(2, 1));
    const bigger = resizeMap(map, 4, 3);
    expect(mapSize(bigger)).toEqual({width:1200, height:900});
    expect(tileAt(bigger, 0, 0)?.kind).toBe('cross'); expect(tileAt(bigger, 2, 1)?.kind).toBe('curve'); expect(tileAt(bigger, 3, 2)).toBeNull();
    const smaller = resizeMap(map, 2, 2);
    expect(smaller.tiles.filter(t => t)).toEqual([{kind:'cross', turn:0}]);
    // nicht kleiner als zwei mal zwei, nicht größer als acht mal sechs
    expect(mapSize(resizeMap(map, 1, 0))).toEqual({width:600, height:600});
    expect(mapSize(resizeMap(map, 99, 99))).toEqual({width:2400, height:1800});
  });
  it('zählt Linienenden, die ins Leere laufen', () => {
    let map = tapTile(empty(), 'straight', at(0, 0));
    expect(openEnds(map)).toBe(2);
    map = tapTile(map, 'straight', at(0, 1));
    expect(openEnds(map)).toBe(2);   // die beiden treffen sich, oben und unten ist der Rand
    map = tapTile(map, 'end', at(0, 1));
    map = turnTile(turnTile(map, 0, 1), 0, 1);   // das Linienende zeigt jetzt nach oben
    expect(openEnds(map)).toBe(1);
  });
});

describe('Vorlagen und Dateien', () => {
  it('jede Vorlage ist eine geschlossene Bahn', () => {
    for (const template of TEMPLATES){
      const map = template.make();
      expect(map.tiles, template.id).toHaveLength(map.cols * map.rows);
      expect(openEnds(map), template.id).toBe(0);
      expect(readTileMap(JSON.parse(JSON.stringify(map))), template.id).toEqual(map);
    }
  });
  it('der Roboter beginnt auf der untersten Geraden, in ihre Richtung', () => {
    // Rundkurs: unten liegt die Gerade quer, im zweiten Feld der dritten Zeile
    expect(startPose(TEMPLATES[0].make())).toEqual({x:400, y:750, heading:0});
    expect(startPose(tapTile(empty(), 'straight', at(2, 0)))).toEqual({x:750, y:200, heading:-90});
    expect(startPose(empty(4, 2))).toEqual({x:600, y:300, heading:0});
  });
  it('die Abkürzung: grüne Punkte an beiden Abzweigen', () => {
    const map = TEMPLATES.find(t => t.id === 'abkuerzung')!.make();
    // oben: für den, der von rechts kommt, links ab – der Punkt liegt vor dem Abzweig auf der linken Seite: unten rechts
    expect(tileShapes(tileAt(map, 1, 0)!).rects[0]).toMatchObject({x:160, y:160, color:'green'});
    // unten: von oben kommend wieder links – oben rechts
    expect(tileShapes(tileAt(map, 1, 2)!).rects[0]).toMatchObject({x:160, y:115, color:'green'});
  });
  it('was keine Bahn ist, wird abgelehnt', () => {
    for (const bad of [null, 'bahn', {}, {cols:4, rows:3, tiles:[]}, {cols:1, rows:3, tiles:[null, null, null]}, {cols:2, rows:2, tiles:[{kind:'loop', turn:0}, null, null, null]},
      {cols:2, rows:2, tiles:[{kind:'curve'}, null, null, null]}, {cols:9, rows:2, tiles:new Array(18).fill(null)}]) expect(readTileMap(bad)).toBeNull();
    expect(readTileMap({cols:2, rows:2, tiles:[{kind:'cross', turn:7, green:31}, null, null, null]})?.tiles[0]).toEqual({kind:'cross', turn:3, green:15});
  });
});
