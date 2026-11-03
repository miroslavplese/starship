import type { Command, GameState, Result } from '../sim/types';
import { command, createGame, step } from '../sim/game';
import { decode, PREVIOUS_KEY, save, SAVE_KEY } from './persistence';
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
  constructor(seed = 12345) { this.state = createGame(seed); }
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
    const r = save(this.state); this.message = r.ok ? r.quarantined ? 'Expedition saved and verified. An unreadable backup was kept for recovery.' : 'Expedition saved and verified.' : r.message; this.notify(); return r;
  }
  load(previous = false) {
    if (this.training) { this.message = 'Return from the drill before loading another expedition.'; this.notify(); return; }
    try {
      const text = localStorage.getItem(previous ? PREVIOUS_KEY : SAVE_KEY);
      if (!text) throw new Error(previous ? 'No previous save is available.' : 'No saved expedition is available.');
      this.replace(decode(text)); this.message = 'Expedition loaded paused. Resume explicitly.';
    } catch (e) { this.message = `Load failed: ${e instanceof Error ? e.message : String(e)}`; }
    this.notify();
  }
  replace(state: GameState) { this.state = state; this.forcedPause = 'Loaded / new expedition'; this.reason = 'Loaded / new expedition'; this.accumulator = 0; this.notify(); }
}
