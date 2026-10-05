// ---------------------------------------------------------------
// Projektdatei lesen und prüfen, bevor die Arbeitsfläche angefasst wird (ohne DOM).
// Eine fremde Datei darf weder das jetzige Programm zerstören noch ungefragt Erweiterungen
// installieren: Deren Python läuft später auf dem Hub.
// ---------------------------------------------------------------
import * as Blockly from 'blockly';
import type { WorkspaceState } from './examples';
import { parseExtension, type Extension } from './ext/parse';
import { isExtensionType, stripBlocks } from './ext/register';
import { getExtension, installExtension, removeExtension } from './ext/store';

export class ProjectError extends Error {}

/** Erweiterung, die ein Projekt mitbringt und die es hier so noch nicht gibt. */
export interface BroughtExtension {
  ext: Extension;
  /** die installierte Erweiterung gleichen Namens, die dabei ersetzt würde */
  replaces: Extension | null;
}
export interface ProjectFile { state: WorkspaceState; brought: BroughtExtension[] }

/** Liest eine Projektdatei. Installiert nichts – `brought` nennt nur, was das Projekt mitbringt. */
export function readProject(text: string): ProjectFile {
  let data: unknown;
  try { data = JSON.parse(text); } catch { throw new ProjectError('Die Datei ist kein gültiges Blockwerk-Projekt.'); }
  const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
  if (!isObject(data)) throw new ProjectError('Die Datei ist kein gültiges Blockwerk-Projekt.');
  // ältere Dateien enthalten nur die Arbeitsfläche
  const state = data.workspace ?? data;
  if (!isObject(state)) throw new ProjectError('Die Datei ist kein gültiges Blockwerk-Projekt.');

  const brought: BroughtExtension[] = [];
  for (const source of Array.isArray(data.extensions) ? data.extensions : []){
    if (typeof source !== 'string') continue;
    const {ext, errors} = parseExtension(source);
    // fehlerhafte ließen sich ohnehin nicht installieren; doppelte zählen einmal
    if (!ext || errors.length || brought.some(b => b.ext.id === ext.id)) continue;
    const installed = getExtension(ext.id) ?? null;
    if (installed?.source === source) continue;   // genau so schon vorhanden
    brought.push({ext, replaces:installed});
  }
  return {state:state as WorkspaceState, brought};
}

/**
 * Prüft, ob sich ein Stand mit den jetzt bekannten Blöcken laden lässt – in einer eigenen
 * Arbeitsfläche ohne Oberfläche. Wirft den Fehler von Blockly (unbekannter Block, Eingabe fehlt …).
 */
export function checkState(state: WorkspaceState): void {
  const probe = new Blockly.Workspace();
  Blockly.Events.disable();
  try { Blockly.serialization.workspaces.load(state, probe); }
  finally { Blockly.Events.enable(); probe.dispose(); }
}

/** Installiert mitgebrachte Erweiterungen. Die gelieferte Funktion stellt den Stand davor wieder her. */
export function installBrought(list: BroughtExtension[]): () => void {
  for (const b of list) installExtension(b.ext.source);
  return () => { for (const b of list){ if (b.replaces) installExtension(b.replaces.source); else removeExtension(b.ext.id); } };
}

/**
 * Der Stand für »ohne Erweiterungen öffnen«: ohne Blöcke, die es hier nicht gibt, und ohne die
 * Blöcke der mitgebrachten Erweiterungen – auch dann, wenn hier schon eine Erweiterung mit
 * demselben Namen installiert ist. Deren Blöcke hießen gleich, täten aber etwas anderes.
 */
export const withoutExtensions = (state: WorkspaceState, brought: BroughtExtension[]): WorkspaceState =>
  stripBlocks(state, type => !Blockly.Blocks[type] || brought.some(b => isExtensionType(type, b.ext.id)));
