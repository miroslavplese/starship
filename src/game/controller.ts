import type { Command, GameState, Result } from '../sim/types';
import { command, createGame, step } from '../sim/game';
import { decode, encode } from './persistence';
import { createSavedExpedition, findSavedExpedition, loadSavedExpedition, readSaveLibrary, updateSavedExpedition, type SavedExpedition } from './saves';
import { DIAGNOSTICS_ENABLED } from './features';

export class GameController {
  state: GameState;
  forcedPause: string | null = 'New expedition';
  reason = 'Captain command';
  modal = false;
  accumulator = 0;
  message = '';
  speed = 1;
  training = false;
  listeners = new Set<() => void>();
  revision = 0;
  saved: SavedExpedition | null = null;
  savesRevision = 0;
  saveIssue = false;
  constructor(seed = 12345, private storage?: Storage) { this.state = createGame(seed); }
  get paused() { return Boolean(this.state.userPaused || this.forcedPause); }
  set paused(value: boolean) { this.state.userPaused = value; if (!value) this.forcedPause = null; }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  snapshot = () => this.revision;
  notify() { this.revision++; this.listeners.forEach(l => l()); }
  dispatch(c: Command): Result {
    if (this.paused && ['crew', 'power', 'target', 'door', 'maneuver', 'ew', 'weapon-priority', 'cease-fire'].includes(c.type)) {
      const trial = structuredClone(this.state);
      for (const queued of trial.queue.splice(0)) command(trial, queued);
      const result = command(trial, c);
      if (!result.ok) { this.message = result.message; this.notify(); return result; }
      if (this.state.queue.length >= 100) { this.message = 'Command queue full. Resume to execute orders.'; this.notify(); return { ok: false, message: this.message }; }
      this.state.queue.push(c); this.state.sequence++;
      this.state.queueMeta ??= []; this.state.queueMeta.push({ tick: this.state.tick, sequence: this.state.sequence });
      this.message = `Order queued (${this.state.queue.length}). Resume to execute.`; this.notify(); return { ok: true };
    }
    const result = command(this.state, c);
    this.message = result.ok ? this.state.events.at(-1)?.message ?? 'Command accepted.' : result.message;
    if (result.ok && this.state.phase !== 'expedition' && !this.training) this.persist();
    else this.notify();
    return result;
  }
  advance(ms: number) {
    if (this.paused || this.modal || this.state.phase !== 'expedition') { this.accumulator = 0; return; }
    if (ms > 250 && DIAGNOSTICS_ENABLED) this.message = 'Performance warning: elapsed backlog discarded.';
    this.accumulator += Math.min(250, ms);
    let updated = false;
    while (this.accumulator >= 50) {
      const safe = this.state.encounter !== 'hostile' && !this.state.customs && !this.state.threat && this.state.crew.every(c => c.health <= 0 || (c.home === 'player' ? c.shipId === 'player' : c.shipId !== 'player')) && this.state.ships[0].rooms.every(r => r.fire === 0 && r.breach === 0 && r.oxygen > 0.2);
      for (let i = 0; i < (safe ? this.speed : 1); i++) {
        const encounter = this.state.encounter, threat = this.state.threat;
        const stranded = this.state.crew.some(c => c.home === 'player' && c.health > 0 && this.state.ships.some(sh => sh.id === c.shipId && sh.doctrine === 'withdrawn'));
        step(this.state);
        const newlyStranded = !stranded && this.state.crew.some(c => c.home === 'player' && c.health > 0 && this.state.ships.some(sh => sh.id === c.shipId && sh.doctrine === 'withdrawn'));
        if (newlyStranded || (this.state.encounter === 'hostile' && encounter !== 'hostile') || (!threat && this.state.threat) || this.state.customs || this.state.phase !== 'expedition') { this.forcedPause = newlyStranded ? 'Away team stranded: emergency tether or abandonment' : 'Contact / decision'; this.reason = this.forcedPause; break; }
      }
      this.accumulator -= 50; updated = true;
      if (this.paused) break;
    }
    if (updated) {
      if (this.state.phase !== 'expedition' && !this.training) this.persist();
      else this.notify();
    }
  }
  togglePause() { this.paused = !this.paused; this.reason = this.paused ? 'Captain command' : ''; this.accumulator = 0; this.notify(); }
  hidden() { this.forcedPause = 'Paused while away'; this.reason = 'Paused while away'; this.accumulator = 0; this.notify(); }
  persist() {
    if (this.training) { this.message = 'Training is reversible and does not overwrite your expedition save.'; this.notify(); return { ok: false as const, message: this.message }; }
    try {
      this.saved = this.saved ? updateSavedExpedition(this.saved, this.state, this.storage) : createSavedExpedition(this.state, 'new', this.storage);
      this.saveIssue = false; this.savesRevision++; this.message = 'Expedition saved and verified.'; this.notify(); return { ok: true as const };
    } catch (error) {
      this.saveIssue = true; this.savesRevision++;
      this.message = `Save failed: ${error instanceof Error ? error.message : String(error)}. Download your current progress or save it as a separate expedition.`;
      this.notify(); return { ok: false as const, message: this.message };
    }
  }
  private keepCurrentProgress() {
    if (this.training) throw new Error('Return from the drill before switching expeditions.');
    if (!this.saved) return;
    const snapshot = encode(this.state);
    const library = readSaveLibrary(this.storage);
    if ([...library.saves, ...library.backups].some(entry => entry.id === this.saved!.id && entry.snapshot === snapshot)) return;
    if (!this.persist().ok) throw new Error('Current progress could not be kept. In Settings, save it as a separate expedition or download it before switching.');
  }
  startExpedition(state: GameState, imported = false) {
    try {
      encode(state);
      this.keepCurrentProgress();
      const saved = createSavedExpedition(state, imported ? 'import' : 'new', this.storage);
      this.saved = saved; this.saveIssue = false; this.savesRevision++; this.replace(state);
      this.message = imported ? 'Imported validated run, paused. Saved as a separate expedition.' : 'New expedition saved separately. Ready for command.';
      this.notify(); return { ok: true as const };
    } catch (error) {
      this.message = `${imported ? 'Import' : 'New expedition'} failed: ${error instanceof Error ? error.message : String(error)}. Live run retained.`;
      this.notify(); return { ok: false as const, message: this.message };
    }
  }
  importExpedition(text: string) {
    try { return this.startExpedition(decode(text), true); }
    catch (error) {
      this.message = `Import failed: ${error instanceof Error ? error.message : String(error)}. Live run retained.`;
      this.notify(); return { ok: false as const, message: this.message };
    }
  }
  saveSeparateCopy() {
    if (this.training) { this.message = 'Return from the drill before saving a separate expedition.'; this.notify(); return; }
    try {
      this.saved = createSavedExpedition(this.state, 'new', this.storage);
      this.saveIssue = false; this.savesRevision++; this.message = 'Current progress saved and verified as a separate expedition.';
    } catch (error) { this.message = `Save failed: ${error instanceof Error ? error.message : String(error)}. Existing expeditions and live progress were kept.`; }
    this.notify();
  }
  load(key: string) {
    try {
      const selected = findSavedExpedition(key, this.storage);
      if (!selected) throw new Error('Saved expedition unavailable; use another save or recovery copy.');
      this.keepCurrentProgress();
      const saved = selected.recovery ? createSavedExpedition(selected.state, 'recovery', this.storage, selected) : loadSavedExpedition(key, this.storage);
      this.saved = saved; this.saveIssue = false; this.savesRevision++; this.replace(decode(saved.snapshot));
      this.message = 'Expedition loaded paused. Resume explicitly.'; this.notify(); return { ok: true as const };
    } catch (error) {
      this.message = `Load failed: ${error instanceof Error ? error.message : String(error)}. Live run retained.`;
      this.notify(); return { ok: false as const, message: this.message };
    }
  }
  replace(state: GameState) { this.state = state; this.forcedPause = 'Loaded / new expedition'; this.reason = 'Loaded / new expedition'; this.accumulator = 0; this.notify(); }
}
