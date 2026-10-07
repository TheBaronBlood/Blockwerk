import { describe, expect, it } from 'vitest';
import { viewModeFor } from '../src/viewMode';

describe('Ansicht nach dem Format des Fensters', () => {
  it('erkennt Handys hochkant und quer', () => {
    for (const [w, h] of [[390, 844], [360, 640], [412, 915], [320, 568], [430, 932]]) expect(viewModeFor(w, h), `${w}×${h}`).toBe('phone-portrait');
    for (const [w, h] of [[844, 390], [640, 360], [915, 412], [568, 320], [932, 430]]) expect(viewModeFor(w, h), `${w}×${h}`).toBe('phone-landscape');
  });
  it('lässt Tablets und Computer in der breiten Ansicht', () => {
    for (const [w, h] of [[768, 1024], [1024, 768], [820, 1180], [1180, 820], [744, 1133], [1133, 744], [1280, 800], [1920, 1080], [1366, 650]])
      expect(viewModeFor(w, h), `${w}×${h}`).toBe('wide');
  });
  it('richtet sich allein nach dem Format – auch ein schmales Fenster am Computer zählt', () => {
    expect(viewModeFor(500, 900)).toBe('phone-portrait');
    expect(viewModeFor(1200, 400)).toBe('phone-landscape');
    // Handy hochkant mit offener Bildschirmtastatur: weiter hochkant, nicht quer
    expect(viewModeFor(390, 450)).toBe('phone-portrait');
    expect(viewModeFor(601, 900)).toBe('wide');
  });
});
