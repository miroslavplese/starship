import { describe, expect, it, vi } from 'vitest';
import { command, createGame, step } from '../../src/sim/game';
import { cargoUsed, generateRegion, GOODS, price } from '../../src/content/region';
import { decode, encode, save, SAVE_KEY, PREVIOUS_KEY } from '../../src/game/persistence';
import { GameController } from '../../src/game/controller';
import { createShip } from '../../src/content/ships';
import type { Command, GameState } from '../../src/sim/types';

function run(s: GameState, count: number) { for (let i = 0; i < count; i++) step(s); }
function issue(s: GameState, c: Command) { const result = command(s, c); expect(result, result.ok ? '' : result.message).toEqual({ ok: true }); }
function fuel(s: GameState) { while (s.ships[0].fuel < s.ships[0].maxFuel) issue(s, { type: 'service', service: 'fuel' }); }
function jump(s: GameState, destination: string) { run(s, 600); issue(s, { type: 'travel', destination, system: true, confirm: true }); run(s, 100); }

describe('strategic rules', () => {
  it('creates a connected objective graph and exact sandbox minimum across 100 seeds', () => {
    for (let seed = 0; seed < 100; seed++) {
      const { region, contracts } = generateRegion(seed), reached = new Set(['s0']), work = ['s0'];
      while (work.length) {
        const next = work.shift();
        for (const id of region.find(r => r.id === next)!.routes) if (!reached.has(id)) { reached.add(id); work.push(id); }
      }
      expect(reached.size).toBe(region.length);
      expect(region.filter(r => r.locations.some(l => l.archive))).toHaveLength(3);
      expect(region[0].locations.filter(l => l.kind === 'planet')).toHaveLength(3);
      expect(region[0].locations.filter(l => l.kind === 'station')).toHaveLength(2);
      expect(region[0].locations.filter(l => l.kind === 'signal')).toHaveLength(3);
      expect(region[0].locations.some(l => l.kind === 'derelict')).toBe(true);
      expect(contracts.some(c => c.kind === 'freight')).toBe(true);
      expect(GOODS).toHaveLength(10);
    }
  });
  it('rejects invalid trades atomically and prevents same-station profit', () => {
    const s = createGame(12345), before = JSON.stringify(s);
    expect(command(s, { type: 'trade', commodity: 'food', quantity: -1, buy: true }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    const credits = s.ships[0].credits, buy = price(s, s.locationId, 'food', true), sell = price(s, s.locationId, 'food', false);
    expect(buy).toBeGreaterThan(sell);
    issue(s, { type: 'trade', commodity: 'food', quantity: 1, buy: true });
    issue(s, { type: 'trade', commodity: 'food', quantity: 1, buy: false });
    expect(s.ships[0].credits).toBeLessThan(credits);
  });
  it('bulk market reversal cannot exploit a changed marginal scarcity price', () => {
    const s = createGame(12), p = s.ships[0];
    p.credits = 10000; p.capacity = 100;
    for (const g of GOODS) {
      p.credits = 10000;
      s.markets[0].stock[g.id] = 60;
      const before = p.credits;
      for (let i = 0; i < 5; i++) {
        issue(s, { type: 'trade', commodity: g.id, quantity: 30, buy: true });
        issue(s, { type: 'trade', commodity: g.id, quantity: 30, buy: false });
      }
      expect(p.credits).toBeLessThan(before);
      expect(s.markets[0].stock[g.id]).toBe(60);
    }
  });
  it('requires currently operational navigation even after FTL is charged', () => {
    const s = createGame(1); run(s, 600);
    const engine = s.ships[0].systems.find(x => x.kind === 'engines')!;
    engine.power = 0;
    const before = JSON.stringify(s);
    expect(command(s, { type: 'travel', destination: 's1', system: true }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
  });
  it('does not pay an escort before the threat is resolved or accept exhausted survey contracts', () => {
    const s = createGame(1), escort = s.contracts.find(c => c.kind === 'escort')!;
    issue(s, { type: 'contract', id: escort.id, action: 'accept' });
    issue(s, { type: 'travel', destination: escort.destination, system: false }); run(s, 140);
    expect(s.encounter).toBe('hostile');
    expect(command(s, { type: 'contract', id: escort.id, action: 'complete' }).ok).toBe(false);
    const other = createGame(1); other.region[0].locations.find(l => l.id === 's0-planet0')!.surveyed = true;
    expect(command(other, { type: 'contract', id: 's0-exploration', action: 'accept' }).ok).toBe(false);
  });
  it('reserves freight, delivers once and releases failed reservations', () => {
    const s = createGame(12345), c = s.contracts.find(c => c.id === 's0-freight')!;
    issue(s, { type: 'contract', id: c.id, action: 'accept' });
    expect(cargoUsed(s)).toBe(3);
    expect(command(s, { type: 'trade', commodity: 'food', quantity: 1, buy: false }).ok).toBe(false);
    issue(s, { type: 'travel', destination: c.destination, system: false }); run(s, 140);
    issue(s, { type: 'contract', id: c.id, action: 'complete' });
    expect(cargoUsed(s)).toBe(0);
    const credits = s.ships[0].credits;
    expect(command(s, { type: 'contract', id: c.id, action: 'complete' }).ok).toBe(false);
    expect(s.ships[0].credits).toBe(credits);
  });
  it('surveys once, sells data once and does not erase coordinates', () => {
    const s = createGame(9);
    s.systemId = 's2'; s.locationId = 's2-planet1';
    issue(s, { type: 'action', action: 'investigate' }); run(s, 300);
    expect(s.coordinates).toEqual(['s2']); expect(s.discoveries).toEqual(['s2-planet1']);
    expect(command(s, { type: 'action', action: 'investigate' }).ok).toBe(false);
    s.locationId = 's2-station';
    issue(s, { type: 'service', service: 'data' });
    expect(command(s, { type: 'service', service: 'data' }).ok).toBe(false);
    expect(s.coordinates).toEqual(['s2']);
  });
  it('completes full Expedition with legal noncombat commands and finite preparation', () => {
    const s = createGame(12345);
    const freight = s.contracts.find(c => c.id === 's0-freight')!;
    issue(s, { type: 'contract', id: freight.id, action: 'accept' });
    issue(s, { type: 'travel', destination: freight.destination, system: false }); run(s, 140);
    issue(s, { type: 'contract', id: freight.id, action: 'complete' });
    jump(s, 's1'); jump(s, 's2');
    issue(s, { type: 'objective', choice: 'chart' });
    jump(s, 's3'); jump(s, 's4');
    issue(s, { type: 'objective', choice: 'chart' });
    issue(s, { type: 'travel', destination: 's4-planet0', system: false }); run(s, 140);
    if (s.threat) issue(s, { type: 'threat', choice: 'evade' });
    issue(s, { type: 'action', action: 'investigate' }); run(s, 300);
    issue(s, { type: 'travel', destination: 's4-station', system: false }); run(s, 140);
    issue(s, { type: 'service', service: 'data' });
    fuel(s);
    jump(s, 's5'); issue(s, { type: 'objective', choice: 'chart' });
    jump(s, 's6'); jump(s, 's7');
    expect(s.coordinates).toHaveLength(3); expect(s.guardian).toBe(false);
    issue(s, { type: 'objective', choice: 'negotiate' });
    issue(s, { type: 'travel', destination: 's7-beacon', system: false }); run(s, 140);
    issue(s, { type: 'objective', choice: 'recover' });
    expect(s.phase).toBe('expedition');
    jump(s, 's6'); jump(s, 's3');
    if (s.ships[0].fuel < 1) issue(s, { type: 'service', service: 'rescue' });
    else jump(s, 's0');
    issue(s, { type: 'objective', choice: 'handin' });
    expect(s.phase).toBe('victory');
    expect(decode(encode(s))).toEqual(s);
  });
  it('minimum rescue remains possible with combined serviced-space failures', () => {
    const s = createGame(1), p = s.ships[0]; p.fuel = 0; p.credits = 0; p.debt = 150; p.hull = 2;
    p.systems.filter(x => ['engines', 'cockpit', 'oxygen'].includes(x.kind)).forEach(x => { x.health = 0; x.power = 0; });
    issue(s, { type: 'service', service: 'rescue' });
    expect(p.fuel).toBe(2); expect(p.hull).toBe(8); expect(p.debt).toBe(150);
    expect(s.phase).toBe('expedition');
  });
  it('rejects guardian withdrawal during a pending local journey atomically', () => {
    const s = createGame(1); s.systemId = 's7'; s.locationId = 's7-planet0';
    s.coordinates = ['s2', 's4', 's5']; s.guardian = true;
    issue(s, { type: 'travel', destination: 's7-beacon', system: false });
    const before = encode(s);
    expect(command(s, { type: 'objective', choice: 'withdraw' }).ok).toBe(false);
    expect(encode(s)).toBe(before);
    run(s, 140);
    issue(s, { type: 'objective', choice: 'withdraw' });
    expect(s.systemId).toBe('s6'); expect(s.locationId).toBe('s6-station');
    expect(decode(encode(s))).toEqual(s);
    run(s, 200);
  });
  it('does not award guardian passage when the player jumps away', () => {
    const s = createGame(1); s.systemId = 's7'; s.locationId = 's7-planet0';
    s.coordinates = ['s2', 's4', 's5']; s.region.find(r => r.id === 's6')!.known = true;
    const guardian = createShip('enemy', true); guardian.name = 'Cartographer Sentinel'; guardian.doctrine = 'military';
    s.ships.push(guardian); s.encounter = 'hostile'; s.ships[0].ftl = 600;
    issue(s, { type: 'travel', destination: 's6', system: true, confirm: true });
    run(s, 100);
    expect(s.systemId).toBe('s6'); expect(s.guardian).toBe(false);
    expect(decode(encode(s))).toEqual(s);
  });
  it('persists command and simulation endings immediately without waiting for autosave', () => {
    const data = new Map<string, string>();
    const storage: Storage = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); }, clear: () => data.clear() };
    vi.stubGlobal('localStorage', storage);
    try {
      const api = new GameController(1);
      api.state.archive = true;
      expect(api.dispatch({ type: 'objective', choice: 'handin' }).ok).toBe(true);
      expect(decode(data.get(SAVE_KEY)! ).phase).toBe('victory');
      api.replace(createGame(1)); api.state.ships[0].hull = 0;
      api.togglePause(); api.advance(50);
      expect(decode(data.get(SAVE_KEY)!).phase).toBe('defeat');
      api.replace(createGame(1)); api.training = true;
      api.dispatch({ type: 'abandon', confirm: true });
      expect(decode(data.get(SAVE_KEY)!).phase).toBe('defeat');
    } finally { vi.unstubAllGlobals(); }
  });
  it('partial wreck rooms and dead away crew survive re-entry and persistence', () => {
    const s = createGame(2);
    issue(s, { type: 'travel', destination: 's0-wreck', system: false }); run(s, 140);
    issue(s, { type: 'board', crew: s.crew[0].id });
    const crew = s.crew[0], wreck = s.ships.find(sh => sh.id === 'derelict')!;
    crew.task = 'search'; crew.progress = 100;
    step(s);
    expect(wreck.rooms[0].searched).toBe(true);
    crew.health = 0;
    issue(s, { type: 'travel', destination: 's0-station', system: false }); run(s, 140);
    expect(s.crew[0].lostAt).toBeDefined();
    expect(decode(encode(s))).toEqual(s);
    issue(s, { type: 'travel', destination: 's0-wreck', system: false }); run(s, 140);
    expect(s.ships.find(sh => sh.id === 'derelict')!.rooms[0].searched).toBe(true);
  });
  it('blocks commerce and delivery until customs resolves', () => {
    const s = createGame(1); s.customs = true;
    const before = JSON.stringify(s);
    expect(command(s, { type: 'trade', commodity: 'food', quantity: 1, buy: true }).ok).toBe(false);
    expect(JSON.stringify(s)).toBe(before);
    issue(s, { type: 'customs', choice: 'submit' });
    expect(s.customs).toBe(false);
  });
  it('persists user pause, queued sequence/tick and rejects power schema mismatch', () => {
    const api = new GameController(9);
    expect(api.dispatch({ type: 'power', ship: 'player', system: 'medbay', delta: 2 }).ok).toBe(false);
    api.dispatch({ type: 'power', ship: 'player', system: 'medbay', delta: 1 });
    const loaded = decode(encode(api.state));
    expect(loaded.userPaused).toBe(true); expect(loaded.queueMeta).toEqual([{ tick: 0, sequence: 1 }]);
    api.togglePause(); api.advance(50);
    expect(api.state.commandHistory?.at(-1)).toMatchObject({ tick: 1, sequence: 1, queued: true });
    api.hidden(); expect(api.state.userPaused).toBe(false); expect(api.paused).toBe(true);
  });
  it('normal recall follows only its route and cannot pass destroyed connections', () => {
    const s = createGame(1);
    issue(s, { type: 'travel', destination: 's0-wreck', system: false }); run(s, 140);
    issue(s, { type: 'board', crew: s.crew[1].id });
    const crew = s.crew[1], wreck = s.ships.find(sh => sh.id === 'derelict')!;
    crew.room = wreck.rooms.at(-1)!.id;
    wreck.doors.forEach(d => d.health = 0);
    expect(command(s, { type: 'recall', emergency: false }).ok).toBe(false);
    const credits = s.ships[0].credits;
    issue(s, { type: 'recall', emergency: true }); run(s, 110);
    expect(crew.shipId).toBe('player'); expect(s.ships[0].credits).toBe(credits - 20);
  });
  it('imports reject corrupt/versioned/oversized/broken saves', () => {
    const s = createGame(4);
    expect(decode(encode(s))).toEqual(s);
    expect(() => decode('{')).toThrow();
    expect(() => decode('x'.repeat(1048577))).toThrow();
    expect(() => decode(encode(s).replace('"schema":1', '"schema":99'))).toThrow();
    s.crew[0].room = 'absent';
    expect(() => encode(s)).toThrow('crew');
    const travel = createGame(1); travel.travel = { destination: 'missing-system', system: true, remaining: 1, total: 100 };
    expect(() => encode(travel)).toThrow('travel destination');
  });
  it('keeps previous good bytes when storage fails', () => {
    const data = new Map<string, string>();
    const storage: Storage = { get length() { return data.size; }, key: i => [...data.keys()][i] ?? null, getItem: k => data.get(k) ?? null, setItem: (k, v) => { data.set(k, v); }, removeItem: k => { data.delete(k); }, clear: () => data.clear() };
    const s = createGame(1); expect(save(s, storage).ok).toBe(true); const old = storage.getItem(SAVE_KEY);
    run(s, 100); expect(save(s, storage).ok).toBe(true); expect(storage.getItem(PREVIOUS_KEY)).toBe(old);
    storage.setItem = () => { throw new Error('QuotaExceeded'); };
    expect(save(s, storage)).toEqual(expect.objectContaining({ ok: false }));
    expect(storage.getItem(PREVIOUS_KEY)).toBe(old);
  });
  it('persists deterministic continuous state across 10k ticks and save boundary', () => {
    const a = createGame(42), b = createGame(42);
    run(a, 10000); run(b, 9000); const loaded = decode(encode(b)); run(loaded, 1000);
    expect(loaded).toEqual(a);
  });
  it('replays a tick-addressed command stream and continuation byte-equivalently', () => {
    const a = createGame(42); let b = createGame(42);
    const stream = new Map<number, Command>([
      [5, { type: 'power', ship: 'player', system: 'medbay', delta: 1 }],
      [45, { type: 'crew', crew: a.crew[1].id, room: a.ships[0].rooms.find(r => r.system === 'shields')!.id, task: 'operate' }],
      [400, { type: 'action', action: 'scan' }],
      [2000, { type: 'trade', commodity: 'food', quantity: 1, buy: true }],
      [2800, { type: 'trade', commodity: 'food', quantity: 1, buy: false }],
    ]);
    for (let tick = 0; tick < 10000; tick++) {
      const c = stream.get(tick);
      if (c) { issue(a, c); issue(b, c); }
      step(a); step(b);
      if (tick === 5000) b = decode(encode(b));
    }
    expect(a).toEqual(b);
    expect(encode(a)).toBe(encode(b));
    expect(a.commandHistory?.map(c => c.tick)).toEqual([...stream.keys()]);
  });
  it('fixed-step results do not depend on presentation frame subdivision', () => {
    const a = new GameController(1), b = new GameController(1);
    a.togglePause(); b.togglePause();
    for (let i = 0; i < 200; i++) a.advance(50);
    for (let i = 0; i < 1000; i++) b.advance(10);
    expect(a.state.tick).toBe(200); expect(a.state).toEqual(b.state);
  });
  it('pauses wall time, clears backlog, and queues orders until resume', () => {
    const api = new GameController(9);
    api.advance(10000); expect(api.state.tick).toBe(0);
    api.dispatch({ type: 'power', ship: 'player', system: 'medbay', delta: 1 });
    expect(api.state.queue.length).toBe(1);
    api.modal = true; api.togglePause(); api.advance(10000); expect(api.state.tick).toBe(0);
    api.modal = false; api.advance(50); expect(api.state.tick).toBe(1); expect(api.state.queue).toHaveLength(0);
    api.hidden(); api.advance(10000); expect(api.state.tick).toBe(1);
  });
});
