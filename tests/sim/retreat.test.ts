import { describe, expect, it } from 'vitest';
import { command, createGame, step } from '../../src/sim/game';
import { decode, encode } from '../../src/game/persistence';
import { GameController } from '../../src/game/controller';
import { missionSearch } from '../../src/sim/missions';
import type { Command, GameState } from '../../src/sim/types';

function run(s: GameState, count: number) { for (let i = 0; i < count; i++) step(s); }
function issue(s: GameState, c: Command) { expect(command(s, c)).toEqual({ ok: true }); }
function contact() {
  const s = createGame(12345), pirate = s.region[0].locations.find(l => l.kind === 'pirate')!;
  issue(s, { type: 'contract', id: s.contracts.find(c => c.kind === 'bounty' && c.origin === s.locationId)!.id, action: 'accept' });
  pirate.known = 3;
  issue(s, { type: 'travel', destination: pirate.id, system: false }); run(s, 140);
  const enemy = s.ships.find(sh => sh.doctrine === 'pirate' || sh.doctrine === 'military')!;
  s.ships.forEach(sh => { sh.weapons = []; });
  s.ships[0].modules.push('teleporter'); enemy.shields = 0;
  return { s, enemy };
}
function withdraw(s: GameState) {
  const enemy = s.ships.find(sh => sh.doctrine === 'pirate' || sh.doctrine === 'military')!;
  enemy.hull = 8; enemy.ftl = 600;
  s.tick = Math.ceil((s.tick + 1) / 40) * 40 - 1;
  step(s);
  return enemy;
}

describe('withdrawn contacts and stranded crew', () => {
  it('removes an empty withdrawn contact without bounty, salvage or a boardable wreck; departure remains valid', () => {
    const { s, enemy } = contact(), credits = s.ships[0].credits;
    withdraw(s);
    expect(enemy.doctrine).toBe('withdrawn');
    expect(s.encounter).toBe('none');
    expect(s.ships.some(sh => sh.id === enemy.id)).toBe(false);
    expect(s.contracts.find(c => c.kind === 'bounty' && c.status === 'active')!.targetDefeated).not.toBe(true);
    expect(s.ships[0].credits).toBe(credits);
    expect(command(s, { type: 'board', crew: s.crew[0].id }).ok).toBe(false);
    expect(Object.keys(s.wrecks ?? {})).toHaveLength(0);
    issue(s, { type: 'travel', destination: 's0-station', system: false }); run(s, 140);
    expect(decode(encode(s)).locationId).toBe('s0-station');
  });

  it('preserves stranded crew without silent movement, death, loot or normal recall through save/load, then charges explicit extraction', () => {
    const { s, enemy } = contact(), crew = s.crew[1];
    issue(s, { type: 'board', crew: crew.id });
    issue(s, { type: 'recall', emergency: false });
    crew.progress = 95;
    withdraw(s);
    const stranded = decode(encode(s)), away = stranded.crew.find(c => c.id === crew.id)!;
    expect(away.shipId).toBe(enemy.id); expect(away.health).toBe(100);
    expect(away.task).toBe('idle'); expect(away.path).toEqual([]);
    run(stranded, 200);
    expect(away.shipId).toBe(enemy.id); expect(away.health).toBe(100);
    const before = encode(stranded);
    expect(command(stranded, { type: 'recall', emergency: false })).toMatchObject({ ok: false, message: expect.stringContaining('withdrawn') });
    expect(command(stranded, { type: 'travel', destination: 's0-station', system: false }).ok).toBe(false);
    expect(command(stranded, { type: 'service', service: 'rescue' }).ok).toBe(false);
    expect(command(stranded, { type: 'crew', crew: away.id, room: away.room, task: 'move' }).ok).toBe(false);
    expect(missionSearch(stranded, enemy.id, away.room, away.id).ok).toBe(false);
    expect(encode(stranded)).toBe(before);
    stranded.ships[0].cargo.food = 1;
    const credits = stranded.ships[0].credits;
    issue(stranded, { type: 'recall', emergency: true });
    expect(stranded.ships[0].credits).toBe(credits - 20);
    expect(stranded.ships[0].cargo).toEqual({}); expect(away.health).toBe(90);
    run(stranded, 99); expect(away.shipId).toBe(enemy.id);
    run(stranded, 1); expect(away.shipId).toBe('player');
    expect(stranded.ships.some(sh => sh.id === enemy.id)).toBe(false);
    issue(stranded, { type: 'travel', destination: 's0-station', system: false }); run(stranded, 140);
    expect(decode(encode(stranded)).locationId).toBe('s0-station');
  });

  it('keeps an entirely stranded living roster recoverable or explicitly abandonable, including unpaid extraction debt', () => {
    const { s } = contact(), living = s.crew.filter(c => c.home === 'player');
    for (const crew of living) issue(s, { type: 'board', crew: crew.id, confirm: true });
    withdraw(s);
    run(s, 120);
    expect(s.phase).toBe('expedition');
    expect(living.every(c => c.shipId !== 'player' && c.health === 100)).toBe(true);
    const abandoned = decode(encode(s));
    issue(abandoned, { type: 'abandon', confirm: true });
    expect(decode(encode(abandoned)).phase).toBe('abandoned');
    s.ships[0].credits = 0;
    issue(s, { type: 'recall', emergency: true }); run(s, 100);
    expect(s.ships[0].debt).toBe(20);
    expect(living.every(c => c.shipId === 'player' && c.health === 90)).toBe(true);
    expect(decode(encode(s)).phase).toBe('expedition');
  });

  it('auto-pauses exactly when a living away team becomes stranded', () => {
    const { s, enemy } = contact();
    issue(s, { type: 'board', crew: s.crew[1].id });
    enemy.hull = 8; enemy.ftl = 600; s.tick = 159;
    const api = new GameController(); api.replace(s); api.paused = false; api.advance(50);
    expect(api.paused).toBe(true); expect(api.reason).toContain('stranded');
    expect(api.state.crew[1].shipId).toBe(enemy.id);
  });

  it('guardian retreat still secures passage with no kill payout or remaining free wreck', () => {
    const s = createGame(1); s.systemId = 's6'; s.locationId = 's6-station';
    s.coordinates = ['s2', 's4', 's5']; s.region[7].known = true; s.ships[0].ftl = 600;
    issue(s, { type: 'travel', destination: 's7', system: true, confirm: true }); run(s, 100);
    s.ships.forEach(sh => { sh.weapons = []; });
    const credits = s.ships[0].credits;
    withdraw(s);
    expect(s.guardian).toBe(true); expect(s.ships[0].credits).toBe(credits);
    expect(s.ships).toHaveLength(1);
    expect(decode(encode(s)).guardian).toBe(true);
  });

  it('continues a paid extraction timer through save/load without charging twice', () => {
    const { s } = contact(), crew = s.crew[1];
    issue(s, { type: 'board', crew: crew.id }); withdraw(s);
    issue(s, { type: 'recall', emergency: true }); run(s, 45);
    const restored = decode(encode(s)), away = restored.crew.find(c => c.id === crew.id)!;
    expect(away.progress).toBe(45);
    run(restored, 54); expect(away.shipId).not.toBe('player');
    run(restored, 1); expect(away.shipId).toBe('player');
    expect(restored.ships[0].credits).toBe(40);
  });

  it('does not strand the player vessel or archive a withdrawn contact through import', () => {
    const { s, enemy } = contact();
    s.ships[0].doctrine = 'withdrawn';
    expect(() => encode(s)).toThrow('identities');
    s.ships[0].doctrine = 'player';
    enemy.doctrine = 'withdrawn';
    s.wrecks = { [s.region[0].locations.find(l => l.kind === 'derelict')!.id]: enemy };
    expect(() => encode(s)).toThrow('Only authored derelicts');
  });

  it('hostile boarders already aboard remain dangerous after their vessel withdraws', () => {
    const { s, enemy } = contact(), boarder = s.crew.find(c => c.home === enemy.id)!;
    boarder.shipId = 'player'; boarder.room = s.crew[0].room; boarder.path = []; boarder.task = 'fight';
    const health = s.crew[0].health;
    withdraw(s);
    expect(s.encounter).toBe('none');
    expect(s.crew.some(c => c.id === boarder.id)).toBe(true);
    run(s, 20);
    expect(s.crew[0].health).toBeLessThan(health);
    expect(decode(encode(s)).crew.some(c => c.id === boarder.id)).toBe(true);
  });
});
