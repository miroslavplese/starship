import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AudioCues } from '../../src/game/audio';

class Context {
  state = 'running';
  currentTime = 1;
  destination = {};
  close = vi.fn(async () => {});
  resume = vi.fn(async () => {});
  createOscillator() {
    const node = { type: 'sine', frequency: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn(), start: vi.fn(), stop: vi.fn() };
    return node;
  }
  createGain() { return { gain: { setValueAtTime: vi.fn(), exponentialRampToValueAtTime: vi.fn() }, connect: vi.fn() }; }
}
beforeEach(() => vi.stubGlobal('AudioContext', Context));
afterEach(() => vi.unstubAllGlobals());

describe('original synthesized cue lifecycle', () => {
  it('creates one gesture-started context and disposes it', () => {
    const cues = new AudioCues();
    expect(cues.context).toBeNull();
    cues.start(); const context = cues.context;
    cues.start(); expect(cues.context).toBe(context);
    cues.dispose(); expect(context?.close).toHaveBeenCalledOnce(); expect(cues.context).toBeNull();
  });
  it('respects mute and true zero volume without scheduling exponential ramps from zero', () => {
    const cues = new AudioCues(); cues.start(); const spy = vi.spyOn(cues.context!, 'createOscillator');
    cues.muted = true; cues.play('shot', 10);
    cues.muted = false; cues.volume = 0; cues.play('shot', 20);
    expect(spy).not.toHaveBeenCalled();
    cues.volume = .15; cues.play('shot', 20); expect(spy).toHaveBeenCalledOnce();
  });
  it('rate-limits ordinary cues but does not suppress critical hazards behind weapon sounds', () => {
    const cues = new AudioCues(); cues.start(); const spy = vi.spyOn(cues.context!, 'createOscillator');
    cues.play('shot', 100); cues.play('hit', 101);
    expect(spy).toHaveBeenCalledTimes(1);
    cues.play('breach', 101); cues.play('oxygen', 101);
    expect(spy).toHaveBeenCalledTimes(3);
    cues.play('breach', 102); expect(spy).toHaveBeenCalledTimes(3);
    cues.play('breach', 121); expect(spy).toHaveBeenCalledTimes(4);
  });
  it('does not mute a restarted expedition or loaded earlier tick behind the old run cooldown', () => {
    const cues = new AudioCues(); cues.start(); const spy = vi.spyOn(cues.context!, 'createOscillator');
    cues.play('hostile', 10000); cues.play('hostile', 0);
    expect(spy).toHaveBeenCalledTimes(2);
    cues.reset(); cues.play('hostile', 0); expect(spy).toHaveBeenCalledTimes(3);
  });
  it('schedules distinct charge, shot, impact, breach, oxygen, jump and discovery frequencies', () => {
    const cues = new AudioCues(); cues.start();
    const spy = vi.spyOn(cues.context!, 'createOscillator');
    const kinds = ['ready', 'shot', 'hit', 'breach', 'oxygen', 'jump', 'discovery'];
    kinds.forEach((kind, i) => cues.play(kind, i * 40));
    const nodes = spy.mock.results.map(result => result.value);
    expect(nodes.map(node => node.frequency.setValueAtTime)).toHaveLength(kinds.length);
    const frequencies = nodes.map(node => vi.mocked(node.frequency.setValueAtTime).mock.calls[0][0]);
    expect(new Set(frequencies).size).toBe(kinds.length);
    for (const node of nodes) { expect(node.start).toHaveBeenCalledOnce(); expect(node.stop).toHaveBeenCalledWith(1.21); }
  });
  it('uses a real missile cue and never treats inherited event-kind properties as frequencies', () => {
    const cues = new AudioCues(); cues.start(); const spy = vi.spyOn(cues.context!, 'createOscillator');
    cues.play('missile', 0); cues.play('constructor', 40); cues.play('toString', 80);
    const frequencies = spy.mock.results.map(result => vi.mocked(result.value.frequency.setValueAtTime).mock.calls[0][0]);
    expect(frequencies).toEqual([150, 390, 390]);
  });
});
