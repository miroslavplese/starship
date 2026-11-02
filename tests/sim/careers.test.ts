import { describe, expect, it } from 'vitest';
import { cargoUsed, GOODS, price, tradeQuote } from '../../src/content/region';
import { command, createGame, step } from '../../src/sim/game';
import type { Command, GameState, SystemKind, Task } from '../../src/sim/types';

const SEEDS = [1, 2, 3, 4, 5, 6, 7, 9, 42, 12345];
type Career = 'explorer' | 'trader' | 'combat';

function context(s: GameState) {
  const p = s.ships[0];
  const enemy = s.ships.find(p => p.id !== 'player' && p.id !== 'derelict');
  return `seed=${s.seed}, tick=${s.tick}, ${s.systemId}/${s.locationId}, phase=${s.phase}, encounter=${s.encounter}, credits=${p.credits}, fuel=${p.fuel}, hull=${p.hull}, coordinates=${s.coordinates.join(',')}${enemy ? `\nenemy hull=${enemy.hull}, systems=${JSON.stringify(enemy.systems)}` : ''}\n${s.events.slice(-8).map(e => `${e.tick}: ${e.message}`).join('\n')}`;
}

function issue(s: GameState, c: Command) {
  const result = command(s, c);
  expect(result, `${JSON.stringify(c)}\n${context(s)}`).toEqual({ ok: true });
}

function run(s: GameState, ticks: number) {
  for (let i = 0; i < ticks; i++) step(s);
  expect(s.phase, context(s)).toBe('expedition');
}

function until(s: GameState, done: () => boolean, limit: number, label: string) {
  for (let i = 0; !done() && i < limit && s.phase === 'expedition'; i++) step(s);
  expect(done(), `${label}\n${context(s)}`).toBe(true);
  expect(s.phase, context(s)).toBe('expedition');
}

function audit(s: GameState) {
  const p = s.ships[0];
  expect(s.phase, context(s)).toBe('expedition');
  for (const value of [p.credits, p.debt, p.fuel, p.hull, p.missiles, ...Object.values(p.cargo)]) {
    expect(Number.isFinite(value), context(s)).toBe(true);
    expect(value, context(s)).toBeGreaterThanOrEqual(0);
  }
  expect(p.fuel).toBeLessThanOrEqual(p.maxFuel);
  expect(cargoUsed(s)).toBeLessThanOrEqual(p.capacity);
  expect(new Set(s.coordinates).size).toBe(s.coordinates.length);
  expect(new Set(s.rewards).size).toBe(s.rewards.length);
}

function local(s: GameState, destination: string) {
  if (s.locationId === destination) return;
  issue(s, { type: 'travel', destination, system: false });
  until(s, () => !s.travel, 140, `arrival at ${destination}`);
  if (s.threat) issue(s, { type: 'threat', choice: 'evade' });
  if (s.customs) issue(s, { type: 'customs', choice: 'submit' });
  audit(s);
}

function refuel(s: GameState, target = s.ships[0].maxFuel) {
  while (s.ships[0].fuel < target) issue(s, { type: 'service', service: 'fuel' });
}

function jump(s: GameState, destination: string) {
  until(s, () => s.ships[0].ftl >= 600, 600, 'FTL charged');
  issue(s, { type: 'travel', destination, system: true, confirm: true });
  until(s, () => !s.travel, 100, `jump to ${destination}`);
  audit(s);
}

function merchantJump(s: GameState, destination: string): number {
  const station = `${destination}-station`;
  const market = s.markets.find(m => m.id === station)!;
  const candidates = GOODS.filter(g => !g.illegal).map(g => {
    const cost = tradeQuote(s, s.locationId, g.id, 3, true);
    const projectedStock = Math.min(60, market.stock[g.id] + 4);
    const sale = [1, 2, 3].reduce((sum, i) => sum + price(s, station, g.id, false, projectedStock + i), 0);
    return { good: g.id, cost, margin: sale - cost };
  }).filter(c => c.cost <= s.ships[0].credits - 40 && c.margin >= 3).sort((a, b) => b.margin - a.margin);
  const deal = candidates[0];
  if (deal) {
    const credits = s.ships[0].credits;
    issue(s, { type: 'trade', commodity: deal.good, quantity: 3, buy: true });
    expect(s.ships[0].credits).toBe(credits - deal.cost);
  }
  jump(s, destination);
  if (!deal) return 0;
  const before = s.ships[0].credits;
  const sale = tradeQuote(s, s.locationId, deal.good, 3, false);
  issue(s, { type: 'trade', commodity: deal.good, quantity: 3, buy: false });
  expect(s.ships[0].credits).toBe(before + sale);
  expect(s.ships[0].cargo[deal.good]).toBe(0);
  expect(sale, `real three-unit marginal trade ${deal.good}\n${context(s)}`).toBeGreaterThan(deal.cost);
  return sale - deal.cost;
}

function order(s: GameState, crew: string, ship: string, system: SystemKind, task: Task) {
  const room = s.ships.find(p => p.id === ship)!.rooms.find(r => r.system === system)!;
  issue(s, { type: 'crew', crew, room: room.id, task });
}

function deliveries(s: GameState) {
  const contracts = ['courier', 'freight', 'passenger'].map(kind => s.contracts.find(c => c.id === `${s.systemId}-${kind}`)!);
  const before = s.ships[0].credits;
  for (const c of contracts) issue(s, { type: 'contract', id: c.id, action: 'accept' });
  expect(cargoUsed(s)).toBe(5);
  local(s, contracts[0].destination);
  for (const c of contracts) {
    issue(s, { type: 'contract', id: c.id, action: 'complete' });
    expect(c.status).toBe('complete');
    if (c.passenger) expect(c.passenger.status).toBe('delivered');
    const paid = s.ships[0].credits;
    expect(command(s, { type: 'contract', id: c.id, action: 'complete' }).ok).toBe(false);
    expect(s.ships[0].credits).toBe(paid);
  }
  expect(s.ships[0].credits).toBe(before + contracts.reduce((sum, c) => sum + c.reward, 0));
  local(s, contracts[0].origin);
}

function survey(s: GameState, destination: string) {
  local(s, destination);
  issue(s, { type: 'action', action: 'investigate' });
  until(s, () => !s.action, 300, `physical survey of ${destination}`);
  expect(s.discoveries).toContain(destination);
  const snapshot = s.discoveries.slice();
  expect(command(s, { type: 'action', action: 'investigate' }).ok).toBe(false);
  expect(s.discoveries).toEqual(snapshot);
}

function sellData(s: GameState) {
  issue(s, { type: 'service', service: 'data' });
  const credits = s.ships[0].credits;
  expect(command(s, { type: 'service', service: 'data' }).ok).toBe(false);
  expect(s.ships[0].credits).toBe(credits);
}

function explorerWreck(s: GameState) {
  local(s, 's5-wreck');
  const engineer = s.crew.find(c => c.id === 'player-crew-2')!;
  const scientist = s.crew.find(c => c.id === 'player-crew-3')!;
  for (const c of [engineer, scientist]) issue(s, { type: 'board', crew: c.id });
  order(s, engineer.id, 'derelict', 'engines', 'repair');
  order(s, scientist.id, 'derelict', 'weapons', 'extinguish');
  const wreck = s.ships.find(p => p.id === 'derelict')!;
  until(s, () => wreck.rooms.every(r => !r.fire) && wreck.rooms.every(r => !r.breach), 350, 'extinguish wreck and seal its drive breach');
  order(s, scientist.id, 'derelict', 'oxygen', 'repair');
  until(s, () => scientist.path.length === 0 && wreck.systems.find(x => x.kind === 'oxygen')!.health > 0, 150, 'restore physical life support');
  issue(s, { type: 'power', ship: 'derelict', system: 'oxygen', delta: 1 });
  until(s, () => wreck.rooms.every(r => r.oxygen > .7), 1200, 'wreck atmosphere replenished');
  order(s, scientist.id, 'derelict', 'medbay', 'operate');
  until(s, () => wreck.systems.find(x => x.kind === 'medbay')!.power > 0, 150, 'power wreck medical support');
  for (const room of wreck.rooms.filter(r => r.system !== 'weapons')) {
    issue(s, { type: 'crew', crew: scientist.id, room: room.id, task: 'search' });
    until(s, () => room.searched, 250, `search ${room.id}`);
  }
  order(s, engineer.id, 'derelict', 'weapons', 'fight');
  until(s, () => engineer.path.length === 0, 150, 'engineer joins final search');
  order(s, scientist.id, 'derelict', 'weapons', 'search');
  until(s, () => wreck.rooms.every(r => r.searched), 250, 'search all ten physical compartments');
  expect(s.coordinates).toContain('s5');
  const defender = s.crew.find(c => c.home === 'enemy' && c.shipId === wreck.id)!;
  until(s, () => defender.health <= 0, 600, 'defeat the armed wreck survivor');
  order(s, scientist.id, 'derelict', 'weapons', 'extinguish');
  until(s, () => !wreck.rooms.find(r => r.system === 'weapons')!.fire, 250, 'extinguish the ruptured ammunition cell');
  issue(s, { type: 'recall', emergency: false });
  until(s, () => s.crew.every(c => c.home !== 'player' || c.health <= 0 || c.shipId === 'player'), 250, 'recall scientists and rescued survivor');
  expect(s.crew.filter(c => c.home === 'player').every(c => c.health > 0)).toBe(true);
  local(s, 's5-station');
}

function fitting(s: GameState, modules: string[]) {
  for (const module of modules) issue(s, { type: 'upgrade', module });
}

function setPower(s: GameState, kind: SystemKind, desired: number) {
  const p = s.ships[0], unit = p.systems.find(x => x.kind === kind)!;
  if (unit.ion > 0 || unit.health <= 0) return;
  const target = Math.min(desired, Math.ceil(unit.cap * unit.health / unit.max), unit.cap);
  while (unit.power > target) issue(s, { type: 'power', ship: p.id, system: kind, delta: -1 });
  while (unit.power < target && p.systems.reduce((sum, x) => sum + x.power, 0) < Math.floor(p.reactor * p.systems.find(x => x.kind === 'reactor')!.health / 100)) {
    issue(s, { type: 'power', ship: p.id, system: kind, delta: 1 });
  }
}

function fight(s: GameState) {
  const p = s.ships[0], enemy = s.ships.find(p => p.doctrine === 'pirate' || p.doctrine === 'military')!;
  expect(enemy, context(s)).toBeDefined();
  const hull = p.hull, credits = p.credits, guardian = s.systemId === 's7';
  for (let ticks = 0; (s.encounter === 'hostile' || s.encounter === 'surrender') && ticks < 6000 && s.phase === 'expedition'; ticks++) {
    if (s.encounter === 'surrender') {
      expect(s.rewards.some(r => r.startsWith('stalemate:')), context(s)).toBe(false);
      issue(s, { type: 'surrender', accept: true });
      continue;
    }
    if (ticks % 20 === 0) {
      setPower(s, 'engines', 1);
      setPower(s, 'medbay', 0);
      setPower(s, 'weapons', 5);
      setPower(s, 'shields', 2);
      setPower(s, 'oxygen', 1);
      setPower(s, 'sensors', 1);
      setPower(s, 'ew', 1);
      if (p.systems.find(x => x.kind === 'ew')!.power > 0) issue(s, { type: 'ew', mode: 'disrupt' });
      const target = enemy.systems.find(x => x.kind === 'engines')!.health > 0 ? 'engines' : 'weapons';
      for (const weapon of p.weapons) {
        const room = `${enemy.id}-${weapon.family === 'ion' ? enemy.modules.includes('ew') ? 'ew' : 'shields' : target}`;
        if (weapon.target !== room || !weapon.auto) issue(s, { type: 'target', weapon: weapon.id, room, auto: true });
      }
      for (const c of s.crew.filter(c => c.home === 'player' && c.health > 0 && c.shipId === 'player')) {
        const invader = s.crew.find(e => e.home !== 'player' && e.shipId === 'player' && e.health > 0);
        const emergency = p.rooms.find(r => r.fire > 0 || r.breach > 0 || p.systems.find(x => x.kind === r.system)!.health < 90);
        const room = invader ? p.rooms.find(r => r.id === invader.room)! : emergency;
        const task = invader ? 'fight' : room?.fire ? 'extinguish' : 'repair';
        if (room && (c.task !== task || (c.path.at(-1) ?? c.room) !== room.id)) issue(s, { type: 'crew', crew: c.id, room: room.id, task });
      }
    }
    step(s);
  }
  run(s, 1);
  if (guardian) {
    expect(s.guardian, context(s)).toBe(true);
    expect(['won', 'none'], context(s)).toContain(s.encounter);
    if (s.encounter === 'none') {
      expect(s.events.some(e => e.kind === 'encounter' && e.message.includes('Cartographer Sentinel: escape; no salvage reward'))).toBe(true);
      expect(p.credits).toBe(credits);
    }
  } else expect(s.encounter, context(s)).toBe('won');
  expect(s.phase, context(s)).toBe('expedition');
  expect(s.rewards).toContain(`encounter:${s.systemId}:${s.locationId}:${enemy.id}`);
  expect(enemy.hull < enemy.maxHull, context(s)).toBe(true);
  expect(p.hull).toBeLessThanOrEqual(hull);
  audit(s);
}

function repair(s: GameState) {
  const p = s.ships[0];
  for (const room of p.rooms) {
    if (room.fire > 0) {
      order(s, 'player-crew-2', p.id, room.system, 'extinguish');
      until(s, () => !room.fire, 300, `extinguish ${room.id}`);
    }
    const unit = p.systems.find(x => x.kind === room.system)!;
    if (room.breach > 0 || unit.health < unit.max) {
      order(s, 'player-crew-2', p.id, room.system, 'repair');
      until(s, () => !room.breach && unit.health === unit.max, 1000, `repair ${room.id}`);
    }
  }
  if (p.hull < p.maxHull) issue(s, { type: 'service', service: 'repair' });
  setPower(s, 'weapons', 2);
  setPower(s, 'shields', 2);
  setPower(s, 'engines', 2);
  setPower(s, 'medbay', 1);
  for (const c of s.crew.filter(c => c.home === 'player' && c.health > 0)) order(s, c.id, p.id, 'medbay', 'heal');
  until(s, () => s.crew.filter(c => c.home === 'player').every(c => c.health === 100), 1200, 'heal battle injuries');
  for (const [index, kind] of ['cockpit', 'engines', 'weapons'].entries()) order(s, `player-crew-${index + 1}`, p.id, kind as SystemKind, 'operate');
  refuel(s);
}

function extract(s: GameState, career: Career) {
  local(s, 's5-station');
  refuel(s);
  jump(s, 's6');
  refuel(s);
  jump(s, 's7');
  if (career === 'combat') fight(s);
  else issue(s, { type: 'objective', choice: 'negotiate' });
  expect(s.guardian).toBe(true);
  local(s, 's7-beacon');
  issue(s, { type: 'objective', choice: 'recover' });
  expect(s.archive).toBe(true);
  jump(s, 's6');
  jump(s, 's3');
  jump(s, 's0');
  expect(s.locationId).toBe('s0-station');
  audit(s);
  issue(s, { type: 'objective', choice: 'handin' });
  expect(s.phase, context(s)).toBe('victory');
  expect(s.events.filter(e => e.kind === 'ending')).toHaveLength(1);
  expect(s.ships[0].modules.length).toBeGreaterThanOrEqual(2);
  expect(s.ships[0].debt).toBe(0);
  console.info(JSON.stringify({ career, seed: s.seed, tick: s.tick, modules: s.ships[0].modules, credits: s.ships[0].credits, fuel: s.ships[0].fuel, hull: s.ships[0].hull, coordinates: s.coordinates, ending: s.phase }));
}

describe('R30/R31 legal new-run career viability', () => {
  it.each(SEEDS)('explorer seed %i: science, physical surveys, ten-room wreck and extraction', seed => {
    const s = createGame(seed);
    deliveries(s);
    fitting(s, ['sensors', 'fuel']);
    const science = s.crew.find(c => c.id === 'player-crew-3')!;
    order(s, science.id, 'player', 'sensors', 'operate');
    jump(s, 's1'); jump(s, 's2');
    survey(s, 's2-planet1');
    expect(s.coordinates).toEqual(['s2']);
    local(s, 's2-station'); sellData(s); refuel(s);
    jump(s, 's3'); jump(s, 's4');
    issue(s, { type: 'action', action: 'scan' });
    until(s, () => !s.action, 80, 'upgraded sensor scan');
    survey(s, 's4-signal1');
    expect(s.coordinates).toEqual(['s2', 's4']);
    expect(s.code).toBe(true);
    local(s, 's4-station'); sellData(s);
    jump(s, 's5');
    explorerWreck(s);
    expect(s.coordinates).toEqual(['s2', 's4', 's5']);
    expect(s.ships[0].modules).toEqual(['sensors', 'fuel']);
    extract(s, 'explorer');
  }, 120_000);

  it.each(SEEDS)('trader seed %i: three delivery types, cargo/fuel fitting, purchased charts and extraction', seed => {
    const s = createGame(seed);
    deliveries(s);
    fitting(s, ['cargo', 'fuel']);
    expect(s.ships[0].capacity).toBe(30);
    expect(s.ships[0].maxFuel).toBe(14);
    let margin = merchantJump(s, 's1'); deliveries(s);
    margin += merchantJump(s, 's2'); deliveries(s);
    issue(s, { type: 'objective', choice: 'chart' });
    margin += merchantJump(s, 's3'); deliveries(s);
    margin += merchantJump(s, 's4'); deliveries(s);
    issue(s, { type: 'objective', choice: 'chart' });
    refuel(s);
    margin += merchantJump(s, 's5'); deliveries(s);
    issue(s, { type: 'objective', choice: 'chart' });
    expect(s.discoveries).toEqual([]);
    expect(s.coordinates).toEqual(['s2', 's4', 's5']);
    expect(s.contracts.filter(c => c.status === 'complete')).toHaveLength(18);
    expect(margin, context(s)).toBeGreaterThan(0);
    expect(s.ships[0].modules).toEqual(['cargo', 'fuel']);
    extract(s, 'trader');
  }, 120_000);

  it.each(SEEDS)('combat seed %i: fitted live raider battles, guardian battle and extraction', seed => {
    const s = createGame(seed);
    deliveries(s); fitting(s, ['reactor', 'kinetic']);
    jump(s, 's1'); deliveries(s); fitting(s, ['laser', 'shields']);
    jump(s, 's2'); deliveries(s); fitting(s, ['fuel']);
    local(s, 's2-outpost'); fitting(s, ['ew']); local(s, 's2-station'); refuel(s, 10);
    for (const system of ['s2', 's4', 's5']) {
      if (s.systemId !== system) {
        if (system === 's4') jump(s, 's3');
        jump(s, system);
      }
      local(s, `${system}-pirate`);
      fight(s);
      expect(s.coordinates).toContain(system);
      local(s, `${system}-station`);
      repair(s);
    }
    expect(s.coordinates).toEqual(['s2', 's4', 's5']);
    expect(s.discoveries).toEqual([]);
    expect(s.ships[0].modules).toEqual(['reactor', 'kinetic', 'laser', 'shields', 'fuel', 'ew']);
    extract(s, 'combat');
  }, 120_000);
});
