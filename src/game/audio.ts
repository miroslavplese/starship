export class AudioCues {
  context: AudioContext | null = null;
  muted = false;
  volume = 0.15;
  lastTick = -100;
  criticalTicks = new Map<string, number>();
  reset() { this.lastTick = -100; this.criticalTicks.clear(); }
  start() { if (!this.context) this.context = new AudioContext(); if (this.context.state === 'suspended') void this.context.resume(); }
  play(kind: string, tick: number) {
    if (!this.context || this.muted || this.volume <= 0) return;
    if (tick < this.lastTick) this.reset();
    const critical = ['fire', 'breach', 'oxygen', 'injury', 'failure', 'defeat', 'hostile', 'stranded'].includes(kind);
    if (critical ? tick - (this.criticalTicks.get(kind) ?? -100) < 20 : tick - this.lastTick < 4) return;
    if (critical) this.criticalTicks.set(kind, tick);
    this.lastTick = tick;
    const osc = this.context.createOscillator(), gain = this.context.createGain(), now = this.context.currentTime;
    const frequencies: Record<string, number> = { shot: 180, missile: 150, hit: 90, fire: 80, breach: 65, oxygen: 110, injury: 130, failure: 55, defeat: 55, stranded: 120, ready: 660, jump: 330, scan: 550, discovery: 880, arrival: 440, boarding: 260, service: 520, hostile: 140 };
    osc.type = ['hit', 'breach', 'fire'].includes(kind) ? 'sawtooth' : 'sine';
    osc.frequency.setValueAtTime(Object.hasOwn(frequencies, kind) ? frequencies[kind] : 390, now); osc.frequency.exponentialRampToValueAtTime(60, now + 0.18);
    gain.gain.setValueAtTime(this.volume, now); gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    osc.connect(gain); gain.connect(this.context.destination); osc.start(); osc.stop(now + 0.21);
  }
  dispose() { if (this.context) void this.context.close(); this.context = null; }
}
