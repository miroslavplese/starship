import type { Command, GameState, Result } from './types';
import { createCrew, createShip } from '../content/ships';
import { cargoMass, cargoUsed, fittingReason, generateRegion, GOODS, price, tradeQuote, UPGRADES } from '../content/region';
import { currentLocation, currentSystem, event, income, player, random } from './core';
import { path, tacticalCommand, tacticalTick } from './tactical';
import { validateContent } from '../content/validate';
import { convoyShips, missionArrival, missionCommand, missionCustoms, missionIntercept, missionSearch, missionSurvey, missionTick } from './missions';
import { discoveryKind, SURVEY_VALUES } from '../content/expedition';

const reject = (message: string): Result => ({ ok: false, message });
const success: Result = { ok: true };
export function createGame(seed: number, difficulty: GameState['difficulty'] = 'standard'): GameState {
  validateContent(seed);
  const generated = generateRegion(seed >>> 0);
  const state: GameState = { version: 1, contentVersion: 1, seed: seed >>> 0, rng: (seed >>> 0) || 1, tick: 0, nextId: 1, phase: 'expedition', difficulty,
    ships: [createShip('player')], crew: createCrew('player'), projectiles: [], ...generated, systemId: 's0', locationId: 's0-station',
    reputation: { Concord: 0, Freeholds: 0, Syndicate: 0 }, discoveries: [], soldData: [], coordinates: [], archive: false, guardian: false, code: false, beacon: true,
    encounter: 'none', rewards: [], travel: null, action: null, customs: false, events: [], queue: [], sequence: 0, tutorial: 0, wrecks: {}, threat: null, userPaused: true, commandHistory: [], queueMeta: [] };
  event(state, 'briefing', 'Recover archive coordinates in Verdant, Vesper and Nacre. Open Terminus, recover the archive and return to Haven. Surveys, charts and salvage offer alternatives to combat.');
  if (difficulty === 'hard') { state.ships[0].credits = 48; state.ships[0].fuel = 6; }
  const crew = state.crew[(seed >>> 4) % state.crew.length];
  crew.skills.science += seed % 3;
  observe(state);
  return state;
}
function observe(s: GameState) {
  const m = s.markets.find(m => m.id === s.locationId);
  if (m) { m.observed = s.tick; m.prices = Object.fromEntries(GOODS.map(g => [g.id, price(s, m.id, g.id, true)])); }
}
export function jumpCost(s: GameState): number { return 1 + (cargoMass(s) > 20 ? 1 : 0); }
export function command(s: GameState, c: Command, queuedSequence?: number): Result {
  const result = applyCommand(s, c);
  if (result.ok) {
    if (c.type === 'ew' && c.mode === 'intercept') missionIntercept(s);
    if (c.type === 'customs') missionCustoms(s, c.choice);
    reconcileLostCrew(s);
    const sequence = queuedSequence ?? ++s.sequence;
    s.commandHistory ??= []; s.commandHistory.push({ tick: s.tick, sequence, command: structuredClone(c), queued: queuedSequence !== undefined });
    if (s.commandHistory.length > 100) s.commandHistory.shift();
  }
  return result;
}
function applyCommand(s: GameState, c: Command): Result {
  if (s.phase !== 'expedition') return reject('This expedition has ended. Start a new run.');
  const p = player(s), loc = currentLocation(s), sys = currentSystem(s);
  if (s.threat?.awaiting && !['threat', 'crew', 'power', 'target', 'door', 'maneuver', 'ew', 'recall', 'abandon'].includes(c.type) && !(c.type === 'service' && c.service === 'rescue' && !sys.locations.some(l => l.kind === 'station'))) return reject('Resolve the incoming-contact decision before continuing operations.');
  if (s.customs && !['customs', 'crew', 'power', 'target', 'door', 'maneuver', 'ew', 'recall', 'abandon'].includes(c.type)) return reject('Resolve the pending customs inspection before commerce, delivery or departure.');
  const stationAction = ['trade', 'upgrade', 'contract'].includes(c.type) || (c.type === 'service' && c.service !== 'rescue') || (c.type === 'objective' && ['chart', 'handin'].includes(c.choice));
  if (stationAction && loc.kind === 'station' && (s.reputation[sys.faction] ?? 0) < -20 && loc.id !== 's0-station') return reject('Faction docking denied. Haven remains neutral rescue and extraction.');
  if (c.type === 'power' && (!Number.isInteger(c.delta) || Math.abs(c.delta) !== 1)) return reject('Power allocation changes must be exactly +1 or -1.');
  if (c.type === 'cease-fire') {
    const weapon = p.weapons.find(w => w.id === c.weapon);
    if (!weapon) return reject('Weapon is not owned by the player.');
    weapon.auto = false; weapon.target = null; event(s, 'weapon', 'Weapon target cleared; automatic fire cancelled.'); return success;
  }
  if (c.type === 'abandon') {
    if (!c.confirm) return reject('Confirm abandonment; this ends the expedition.');
    s.phase = 'abandoned'; event(s, 'ending', 'Expedition abandoned by captain.'); return success;
  }
  const tactical = tacticalCommand(s, c);
  if (tactical) return tactical;
  if (c.type === 'travel') {
    if (s.travel || s.action) return reject('Finish the current operation first.');
    if (s.crew.some(c => c.home === 'player' && c.shipId !== 'player' && c.health > 0)) return reject('Recall your away team before departure.');
    if (!s.crew.some(c => c.shipId === 'player' && c.health > 0)) return reject('No crew aboard. Use tether recall.');
    if (c.system) {
      const target = s.region.find(r => r.id === c.destination);
      if (!target || !sys.routes.includes(target.id) || !target.known) return reject('No known jump route to this system.');
      if (target.id === 's7' && s.coordinates.length < 3) return reject('Three archive coordinates are required for Terminus.');
      if (p.ftl < 600) return reject('FTL charging: requires 30 powered seconds, engines and cockpit.');
      const engines = p.systems.find(x => x.kind === 'engines'), cockpit = p.systems.find(x => x.kind === 'cockpit');
      if (!engines || engines.power < 1 || engines.health <= 0 || engines.ion > 0 || !cockpit || cockpit.health <= 0 || cockpit.ion > 0) return reject('Jump requires currently powered, operable engines and cockpit, without ion lock.');
      const cost = jumpCost(s);
      if (p.fuel < cost + (target.id === 's7' ? 2 : 0)) return reject('Insufficient fuel reserves; Terminus requires two extra units.');
      if (target.risk >= 3 && !c.confirm) return reject('Confirm deep-space isolation. Emergency beacon sacrifices cargo and adds debt.');
      p.fuel -= cost; p.ftl = 0;
      const duration = p.modules.includes('engines') ? 75 : 100;
      s.travel = { destination: target.id, system: true, remaining: duration, total: duration };
    } else {
      const target = sys.locations.find(l => l.id === c.destination);
      if (!target || target.known < 1 || target.id === loc.id) return reject('Select a detected destination other than your current location.');
      if (s.encounter === 'hostile' || s.encounter === 'surrender') return reject('Resolve the hostile encounter or jump away.');
      const duration = p.modules.includes('engines') ? 100 : 140;
      s.travel = { destination: target.id, system: false, remaining: duration, total: duration };
    }
    if (s.encounter === 'hostile' || s.encounter === 'surrender') { s.encounter = 'none'; s.ships = [p, ...convoyShips(s)]; s.projectiles = []; s.crew = s.crew.filter(c => c.home === 'player'); }
    event(s, 'travel', 'Course laid in. Travel can be paused; hazards interrupt safe fast-forward.'); return success;
  }
  if (c.type === 'action') {
    if (s.action || s.travel || s.encounter === 'hostile') return reject('Cannot start this operation during travel or combat.');
    const sensor = p.systems.find(x => x.kind === 'sensors');
    if (!sensor || sensor.health <= 0 || sensor.power < 1) return reject('Power and repair sensors first.');
    if (c.action === 'probe' && p.credits < 5) return reject('A probe costs 5 credits.');
    if (c.action === 'mine' && (!p.modules.includes('mining') || loc.kind !== 'belt' || loc.deposit <= 0)) return reject('Requires a prospector drill and a detected unexhausted mineral belt.');
    if (c.action === 'mine' && cargoUsed(s) >= p.capacity) return reject('Cargo hold full.');
    if (c.action === 'investigate' && (loc.surveyed || loc.kind === 'station' || loc.kind === 'pirate' || loc.kind === 'derelict')) return reject('No new survey here. Board derelicts physically; stations offer services.');
    if (c.action === 'probe') p.credits -= 5;
    s.action = { kind: c.action, remaining: c.action === 'investigate' ? 300 : c.action === 'mine' ? 240 : p.modules.includes('sensors') ? 80 : 160 };
    return success;
  }
  if (c.type === 'trade') {
    if (loc.kind !== 'station' || s.travel || s.encounter === 'hostile') return reject('Dock at a station to trade.');
    if ((s.reputation[sys.faction] ?? 0) < -20 && loc.id !== 's0-station') return reject('Faction docking denied. Haven remains neutral rescue.');
    const g = GOODS.find(g => g.id === c.commodity), m = s.markets.find(m => m.id === loc.id);
    if (!g || !m || !Number.isInteger(c.quantity) || c.quantity < 1 || c.quantity > 1000) return reject('Trade quantity must be a positive whole number.');
    const total = tradeQuote(s, loc.id, c.commodity, c.quantity, c.buy);
    if (c.buy) {
      if (p.credits < total || m.stock[g.id] < c.quantity || cargoUsed(s) + c.quantity > p.capacity) return reject('Not enough credits, station stock or cargo space.');
      p.credits -= total; m.stock[g.id] -= c.quantity; p.cargo[g.id] = (p.cargo[g.id] ?? 0) + c.quantity;
    } else {
      if ((p.cargo[g.id] ?? 0) < c.quantity) return reject('Insufficient unreserved cargo. Contract freight is held separately.');
      p.cargo[g.id] -= c.quantity; m.stock[g.id] += c.quantity; income(s, total);
    }
    observe(s); event(s, 'trade', `${c.buy ? 'Bought' : 'Sold'} ${c.quantity} ${g.name} for ${total} credits.`); return success;
  }
  if (c.type === 'service') {
    if (c.service === 'rescue') {
      const isolated = !sys.locations.some(l => l.kind === 'station');
      if (s.encounter === 'hostile' && !isolated) return reject('Incoming fire prevents tow. Escape or resolve combat first.');
      if (s.crew.some(c => c.home === 'player' && c.shipId !== 'player' && c.health > 0)) return reject('Use emergency tether extraction before requesting tow.');
      if (isolated && !s.beacon) return reject('Deep-space beacon spent. Repair or explicitly abandon the expedition.');
      const cost = isolated ? 75 : 40;
      const paid = Math.min(p.credits, cost), overflow = p.debt + cost - paid > 150;
      p.credits -= paid; p.debt = Math.min(150, p.debt + cost - paid);
      if (overflow) {
        const baseline = createShip('player');
        p.cargo = {}; p.modules = []; p.reactor = baseline.reactor; p.capacity = baseline.capacity; p.maxFuel = baseline.maxFuel; p.fuel = Math.min(p.fuel, p.maxFuel);
        p.weapons = baseline.weapons.map(w => p.weapons.find(current => current.id === w.id) ?? w);
        for (const x of p.systems) { const original = baseline.systems.find(b => b.kind === x.kind)!; x.cap = original.cap; x.max = original.max; x.health = Math.min(x.health, x.max); x.power = Math.min(x.power, x.cap); }
        for (const bearing of ['bow', 'stern', 'port', 'starboard'] as const) p.armor[bearing] = Math.min(p.armor[bearing], baseline.armor[bearing]);
        let excess = p.systems.reduce((n, x) => n + x.power, 0) - p.reactor;
        for (const x of p.systems.slice().reverse()) { const removed = Math.max(0, Math.min(x.power, excess)); x.power -= removed; excess -= removed; }
        event(s, 'rescue', 'Debt ceiling reached: loose cargo and above-baseline fittings forfeited. Objective knowledge retained.');
      }
      if (isolated) { s.beacon = false; p.cargo = {}; }
      s.systemId = 's0'; s.locationId = 's0-station'; p.fuel = Math.max(p.fuel, 2); p.hull = Math.max(p.hull, 8);
      const reactor = p.systems.find(x => x.kind === 'reactor')!;
      reactor.health = Math.max(reactor.health, Math.ceil(3 * reactor.max / p.reactor)); reactor.ion = 0;
      for (const x of p.systems) if (['engines', 'cockpit', 'oxygen'].includes(x.kind)) { x.health = Math.max(1, x.health); x.ion = 0; if (x.kind !== 'cockpit') x.power = 1; }
      let spare = Math.floor(p.reactor * reactor.health / reactor.max) - p.systems.reduce((n, x) => n + x.power, 0);
      for (const x of p.systems.slice().reverse()) if (!['engines', 'oxygen'].includes(x.kind) && spare < 0) { const released = Math.min(x.power, -spare); x.power -= released; spare += released; }
      s.travel = null; s.action = null; s.threat = null; s.ships = [p, ...convoyShips(s)]; s.encounter = 'none';
      event(s, 'rescue', `Tow to Haven: ${cost} credits, unpaid balance becomes capped debt. Minimum navigation repair only.`); return success;
    }
    if (loc.kind !== 'station' || s.travel) return reject('This service requires docking at a station.');
    if ((s.reputation[sys.faction] ?? 0) < -20 && loc.id !== 's0-station') return reject('Faction docking denied. Use Haven.');
    const discount = s.difficulty === 'relaxed' ? 0.8 : 1;
    if (c.service === 'fuel') {
      const cost = Math.ceil(4 * discount);
      if (p.fuel >= p.maxFuel || p.credits < cost) return reject('Fuel tank full or insufficient credits.');
      p.credits -= cost; p.fuel++; event(s, 'service', `Refueled one unit for ${cost}.`);
    } else if (c.service === 'repair') {
      const cost = Math.ceil(((p.maxHull - p.hull) * 2 + p.systems.reduce((n, x) => n + (x.max - x.health) * 3, 0)) * discount);
      if (cost <= 0) return reject('Hull and systems are already intact.');
      if (p.credits < cost) return reject(`Full repair costs ${cost} credits. Rescue can restore minimum navigation.`);
      p.credits -= cost; p.hull = p.maxHull; p.systems.forEach(x => { x.health = x.max; x.ion = 0; }); p.rooms.forEach(r => { r.breach = 0; r.fire = 0; });
      event(s, 'service', `Ship repaired for ${cost}. Rooms still need oxygen replenishment.`);
    } else if (c.service === 'data') {
      const unsold = s.discoveries.filter(d => !s.soldData.includes(d));
      if (!unsold.length) return reject('No unsold survey data.');
      const total = unsold.reduce((sum, id) => sum + SURVEY_VALUES[discoveryKind(s, id)], 0);
      income(s, total); s.soldData.push(...unsold); event(s, 'discovery', `Sold ${unsold.length} unique surveys for ${total} credits. Objective coordinates retained.`);
    } else if (c.service === 'intel') {
      if (p.credits < 15) return reject('Updated market and route intelligence costs 15.');
      p.credits -= 15; sys.locations.forEach(l => l.known = Math.max(2, l.known)); sys.routes.forEach(id => { const r = s.region.find(r => r.id === id); if (r) r.known = true; });
      s.markets.filter(m => sys.locations.some(l => l.id === m.id)).forEach(m => { m.observed = s.tick; m.prices = Object.fromEntries(GOODS.map(g => [g.id, price(s, m.id, g.id, true)])); });
      s.code = true; event(s, 'scan', 'Purchased fresh market intelligence, neighboring charts and an old guardian identification code.');
    } else if (c.service === 'recruit') {
      const capacity = p.modules.includes('crew') ? 8 : 6;
      if (p.credits < 45 || s.crew.filter(c => c.home === 'player').length >= capacity) return reject(`Recruit costs 45; maximum ${capacity} crew with current berths.`);
      p.credits -= 45; const c = createCrew('player')[1]; c.id = `recruit-${s.nextId++}`; c.name = ['Sera', 'Venn', 'Nia'][s.nextId % 3]; s.crew.push(c); event(s, 'crew', `${c.name} joined the crew.`);
    }
    return success;
  }
  if (c.type === 'upgrade') {
    const u = UPGRADES[c.module];
    if (!u || loc.kind !== 'station' || s.travel) return reject('Select a valid station fitting.');
    const unavailable = fittingReason(s, c.module); if (unavailable) return reject(unavailable);
    if (p.modules.includes(c.module)) return reject('Module already installed.');
    if (p.modules.length >= 6) return reject('All six module slots occupied. Build choices are permanent this expedition.');
    if (p.credits < u.cost) return reject(`Requires ${u.cost} credits.`);
    if (c.module === 'reactor' && p.reactor >= 12) return reject('Reactor already at maximum output.');
    p.credits -= u.cost; p.modules.push(c.module);
    if (c.module === 'reactor') p.reactor = Math.min(12, p.reactor + 2);
    if (c.module === 'cargo') p.capacity += 10;
    if (c.module === 'fuel') p.maxFuel += 4;
    if (c.module === 'armor') for (const k of ['bow', 'stern', 'port', 'starboard'] as const) p.armor[k] += 3;
    if (c.module === 'engines' || c.module === 'shields') { const x = p.systems.find(x => x.kind === c.module); if (x) { x.cap++; x.max++; x.health++; } }
    if (c.module === 'ew') { const x = p.systems.find(x => x.kind === 'ew'); if (x) { x.health = x.max; } }
    if (['laser', 'ion', 'missile', 'beam', 'kinetic', 'experimental'].includes(c.module)) p.weapons.push({ id: `weapon-${s.nextId++}`, family: c.module as typeof p.weapons[number]['family'], charge: 0, target: null, auto: false });
    event(s, 'service', `Installed ${u.name}. ${p.modules.length}/6 module slots occupied.`); return success;
  }
  const mission = missionCommand(s, c);
  if (mission) return mission;
  if (c.type === 'board') {
    const crew = s.crew.find(x => x.id === c.crew && x.home === 'player' && x.health > 0 && x.shipId === 'player');
    const target = s.ships.find(x => x.hull > 0 && (s.encounter === 'hostile' ? x.doctrine === 'pirate' || x.doctrine === 'military' : x.doctrine === 'derelict'));
    if (!crew || !target || !['hostile', 'derelict'].includes(s.encounter)) return reject('Select a living aboard crew member and an accessible vessel.');
    if (s.encounter === 'hostile' && (!p.modules.includes('teleporter') || target.shields > 0)) return reject('Hostile boarding requires a boarding tether and enemy shields down.');
    if (s.crew.filter(x => x.shipId === 'player' && x.health > 0).length === 1 && !c.confirm) return reject('Confirm sending the final crew member. The mothership cannot jump unmanned.');
    crew.shipId = target.id; crew.room = target.rooms[0].id; crew.path = []; crew.task = 'idle';
    event(s, 'boarding', `${crew.name} crossed to ${target.name}; observed entry oxygen ${Math.round(target.rooms[0].oxygen * 100)}%. Recall or priced emergency tether are available.`); return success;
  }
  if (c.type === 'recall') {
    const away = s.crew.filter(x => x.home === 'player' && x.health > 0 && x.shipId !== 'player');
    if (!away.length) return reject('No living away team.');
    const routes = away.map(c => {
      const ship = s.ships.find(sh => sh.id === c.shipId);
      return ship ? path(ship, c.room, ship.rooms[0].id) : null;
    });
    if (!c.emergency && routes.some(route => route === null)) return reject('Docking route blocked. Repair/unlock relevant doors or use emergency tether: 20 credits/debt and 10 health damage.');
    if (c.emergency) {
      const paid = Math.min(20, p.credits); p.credits -= paid; p.debt = Math.min(150, p.debt + 20 - paid);
      away.forEach(x => x.health = Math.max(1, x.health - 10)); p.cargo = {};
    }
    away.forEach((x, i) => {
      x.task = 'return'; x.path = routes[i] ?? []; x.progress = 0;
      if (c.emergency) { x.room = s.ships.find(sh => sh.id === x.shipId)!.rooms[0].id; x.path = []; }
    });
    event(s, 'boarding', c.emergency ? 'Emergency tether initiated: loose cargo forfeited, 10 health per crew, 20 credits/debt.' : 'Away team returning through the docking route.'); return success;
  }
  if (c.type === 'objective') {
    if (['withdraw', 'negotiate', 'spoof'].includes(c.choice) && s.crew.some(c => c.home === 'player' && c.health > 0 && c.shipId !== 'player')) return reject('Recall living away crew before resolving passage or withdrawal.');
    if (c.choice === 'chart') {
      if (loc.kind !== 'station' || !['s2', 's4', 's5'].includes(sys.id) || s.coordinates.includes(sys.id)) return reject('No missing archive chart available at this station.');
      if (p.credits < 30) return reject('Archive chart costs 30 credits; surveying or wreck salvage is the free alternative.');
      p.credits -= 30; coordinate(s, sys.id); return success;
    }
    if (c.choice === 'withdraw') {
      if (sys.id !== 's7') return reject('Withdrawal is only offered at the guardian.');
      if (s.travel || s.action) return reject('Finish the current operation before withdrawing.');
      s.encounter = 'none'; s.ships = [p, ...convoyShips(s)]; s.crew = s.crew.filter(x => x.home === 'player'); s.projectiles = []; s.systemId = 's6'; s.locationId = 's6-station'; event(s, 'travel', 'Withdrew to The Veil. Archive knowledge retained.'); return success;
    }
    if (c.choice === 'negotiate' || c.choice === 'spoof') {
      if (sys.id !== 's7' || s.guardian || s.coordinates.length < 3) return reject('No guardian passage negotiation here.');
      if (c.choice === 'spoof' && (!p.modules.includes('ew') || !s.code)) return reject('EW suite and intercepted/purchased identification code required.');
      if (c.choice === 'negotiate' && p.credits < 80 && s.coordinates.length < 2) return reject('Passage requires 80 credits or two archive survey records.');
      if (c.choice === 'negotiate' && p.credits >= 80) p.credits -= 80;
      s.guardian = true; s.encounter = 'none'; s.projectiles = []; s.ships = [p, ...convoyShips(s)]; s.crew = s.crew.filter(x => x.home === 'player'); event(s, 'objective', 'Guardian passage granted. Knowledge copies retained. Approach the Cartographer Beacon.'); return success;
    }
    if (c.choice === 'recover') {
      if (loc.kind !== 'beacon' || !s.guardian || s.coordinates.length < 3 || s.archive) return reject('Recover at the beacon after obtaining three coordinates and resolving the guardian.');
      s.archive = true; event(s, 'objective', 'Cartographer archive secured. Return to Haven Anchorage for extraction.'); return success;
    }
    if (c.choice === 'handin') {
      if (!s.archive || loc.id !== 's0-station') return reject('Extraction requires the final archive at Haven Anchorage.');
      s.phase = 'victory'; income(s, 150); event(s, 'ending', 'Expedition complete. The Cartographer archive returned to Haven.'); return success;
    }
  }
  if (c.type === 'customs') {
    if (!s.customs) return reject('No pending customs inspection.');
    const illegal = GOODS.filter(g => g.illegal && (p.cargo[g.id] ?? 0) > 0);
    const restrictedFreight = s.contracts.filter(x => x.status === 'active' && x.kind === 'smuggling');
    if (c.choice === 'bribe' && p.credits < 20) return reject('Bribe requires 20 credits.');
    if (c.choice === 'spoof' && !p.modules.includes('ew')) return reject('Manifest spoof requires EW suite.');
    s.customs = false;
    if (c.choice === 'fight') { startEnemy(s); return success; }
    if (c.choice === 'flee') { s.reputation[sys.faction] -= 5; event(s, 'customs', 'Fled inspection; reputation -5.'); return success; }
    if (c.choice === 'bribe') p.credits -= 20;
    const caught = c.choice === 'submit' || (c.choice !== 'bribe' && random(s) > (c.choice === 'spoof' ? 0.85 : 0.45));
    if (caught && (illegal.length || restrictedFreight.length)) {
      illegal.forEach(g => p.cargo[g.id] = 0); restrictedFreight.forEach(c => c.status = 'failed'); s.reputation[sys.faction] -= 4;
      const paid = Math.min(10, p.credits); p.credits -= paid; p.debt = Math.min(150, p.debt + 10 - paid);
      event(s, 'customs', 'Contraband confiscated, smuggling contracts failed; fine 10 and reputation -4.');
    } else event(s, 'customs', 'Inspection cleared. Cargo retained.');
    return success;
  }
  if (c.type === 'threat') {
    if (!s.threat) return reject('No incoming threat.');
    if (c.choice === 'prepare') { s.threat.awaiting = false; event(s, 'threat', 'Crew alerted. Incoming contact countdown continues at normal speed; recall away teams.'); return success; }
    if (c.choice === 'pay' && p.credits < 20) return reject('A safe-passage payment requires 20 credits.');
    const engines = p.systems.find(x => x.kind === 'engines');
    if (c.choice === 'evade' && (!engines || engines.power < 1 || engines.health <= 0 || p.fuel < 1)) return reject('Evasion requires powered engines and one fuel.');
    if (c.choice === 'evade') p.fuel--; else p.credits -= 20;
    event(s, 'travel', c.choice === 'evade' ? 'Spent one fuel changing course; contact avoided.' : 'Paid 20 credits for safe passage.'); s.threat = null; return success;
  }
  return reject('Command not available in this context.');
}
function coordinate(s: GameState, id: string) {
  if (!s.coordinates.includes(id)) { s.coordinates.push(id); event(s, 'objective', `Archive coordinate recovered: ${s.coordinates.length}/3. Objective knowledge cannot be sold or lost.`); }
  if (s.coordinates.length === 3) s.region.forEach(r => r.known = true);
}
function reconcileLostCrew(s: GameState) {
  s.crew = s.crew.filter(c => c.home === 'player' || s.ships.some(sh => sh.id === c.shipId));
  s.projectiles = s.projectiles.filter(p => s.ships.some(sh => sh.id === p.source) && s.ships.some(sh => sh.id === p.target && sh.rooms.some(r => r.id === p.room)));
  for (const sh of s.ships) for (const w of sh.weapons) if (w.target && !s.ships.some(target => target.id !== sh.id && target.rooms.some(r => r.id === w.target))) { w.target = null; w.auto = false; }
  for (const c of s.crew) if (c.home === 'player' && c.health <= 0 && !s.ships.some(sh => sh.id === c.shipId)) {
    c.lostAt = s.events.filter(e => e.kind === 'arrival').at(-1)?.message ?? 'Away vessel';
    c.shipId = 'player'; c.room = player(s).rooms[0].id; c.path = []; c.task = 'idle';
    event(s, 'crew', `${c.name} remains recorded as lost away from the ship. Memorial retained in the roster.`);
  }
}
function startEnemy(s: GameState, guardian = false) {
  const enemy = createShip('enemy', true); if (guardian) enemy.name = 'Cartographer Sentinel';
  enemy.doctrine = guardian || currentSystem(s).faction === 'Concord' ? 'military' : 'pirate';
  if (currentSystem(s).risk >= 1 && enemy.weapons.length > 1) enemy.weapons[1].family = (['ion', 'kinetic', 'missile'] as const)[Math.floor(random(s) * 3)];
  if (guardian) enemy.modules = ['ew', 'teleporter', 'drones'];
  else if (currentSystem(s).risk >= 2) enemy.modules = [(['ew', 'teleporter', 'drones'] as const)[Math.floor(random(s) * 3)]];
  if (enemy.modules.includes('ew')) { const ew = enemy.systems.find(x => x.kind === 'ew'); if (ew && enemy.systems.reduce((n, x) => n + x.power, 0) < enemy.reactor) ew.power = 1; }
  const wreck = s.ships.find(sh => sh.doctrine === 'derelict' && s.crew.some(c => c.shipId === sh.id && c.health > 0 && c.home === 'player'));
  s.ships = [player(s), enemy, ...(wreck ? [wreck] : []), ...convoyShips(s)]; s.crew = s.crew.filter(c => c.home === 'player'); s.crew.push(...createCrew('enemy', true)); s.encounter = 'hostile';
  event(s, 'hostile', `${enemy.name} detected. Pause to assign targets; FTL escape is available when charged.`);
}
export function step(s: GameState) {
  if (s.phase !== 'expedition') return;
  s.tick++;
  const queue = s.queue.splice(0), metadata = s.queueMeta?.splice(0) ?? [];
  queue.forEach((c, i) => { const result = command(s, c, metadata[i]?.sequence ?? ++s.sequence); if (!result.ok) event(s, 'error', result.message); });
  const guardianContact = s.systemId === 's7' && !s.guardian && s.encounter === 'hostile'
    ? s.ships.find(sh => sh.name === 'Cartographer Sentinel')?.id : undefined;
  const retreatMarker = `retreat:${s.systemId}:${s.locationId}`;
  const alreadyRetreated = s.rewards.includes(retreatMarker);
  tacticalTick(s);
  if (s.phase !== 'expedition') return;
  if (guardianContact && !alreadyRetreated && s.rewards.includes(retreatMarker) && !s.travel) {
    s.guardian = true;
    event(s, 'objective', 'The Cartographer Sentinel disengaged under pressure. Terminus passage secured; no destruction bounty was awarded.');
  }
  const p = player(s), sys = currentSystem(s);
  if (s.threat && !s.threat.awaiting && --s.threat.remaining <= 0) { s.threat = null; startEnemy(s); }
  if (s.travel && --s.travel.remaining <= 0) {
    const t = s.travel; s.travel = null;
    const wreck = currentLocation(s).kind === 'derelict' ? s.ships.find(sh => sh.doctrine === 'derelict') : undefined;
    if (wreck) { s.wrecks ??= {}; s.wrecks[s.locationId] = wreck; }
    if (t.system) { s.systemId = t.destination; const arrived = currentSystem(s); s.locationId = arrived.locations.find(l => l.kind === 'station')?.id ?? arrived.locations[0].id; arrived.known = true; }
    else s.locationId = t.destination;
    const loc = currentLocation(s);
    loc.known = 3; observe(s); event(s, 'arrival', `Arrived: ${loc.name}.`);
    if (loc.kind === 'pirate' && !loc.depleted) startEnemy(s);
    if (loc.kind === 'derelict' && !loc.depleted) {
      const derelict = s.wrecks?.[loc.id] ?? createShip('derelict', false, true);
      derelict.name = loc.name;
      if (s.wrecks) delete s.wrecks[loc.id];
      s.ships = [p, derelict, ...convoyShips(s)]; s.encounter = 'derelict';
      event(s, 'boarding', 'Derelict tether secured. Board a crew member, inspect air and physically search compartments. Emergency tether costs 20.');
    } else if (loc.kind !== 'pirate' && s.encounter !== 'hostile') { s.encounter = 'none'; s.ships = [p, ...convoyShips(s)]; }
    if (t.system && s.systemId === 's7' && !s.guardian) startEnemy(s, true);
    if (loc.kind === 'station' && s.systemId !== 's0' && (GOODS.some(g => g.illegal && (p.cargo[g.id] ?? 0) > 0) || s.contracts.some(c => c.status === 'active' && c.kind === 'smuggling'))) { s.customs = true; event(s, 'customs', 'Customs inspection pending. Choose submit, bribe, conceal, spoof, flee or fight.'); }
    missionArrival(s, loc.id);
    if (s.systemId !== 's7' && currentSystem(s).risk >= 2 && loc.kind !== 'station' && loc.kind !== 'pirate' && s.encounter !== 'hostile' && !s.rewards.includes(`approach:${loc.id}`)) {
      s.rewards.push(`approach:${loc.id}`);
      s.threat = { remaining: 240, awaiting: true, source: loc.id };
      event(s, 'threat', 'Long-range contact approaching in 12 seconds. Pause to prepare, evade for one fuel, or pay 20 credits. Away teams can recall before arrival.');
    }
    reconcileLostCrew(s);
  }
  const sensors = p.systems.find(x => x.kind === 'sensors');
  if (s.action && sensors && sensors.power > 0 && sensors.health > 0 && sensors.ion === 0 && --s.action.remaining <= 0) {
    const action = s.action.kind; s.action = null;
    const loc = currentLocation(s), system = currentSystem(s);
    if (action === 'scan' || action === 'probe') {
      system.locations.forEach(l => { l.known = Math.min(3, l.known + (action === 'probe' ? 2 : 1)); });
      system.routes.forEach(id => { const r = s.region.find(r => r.id === id); if (r) r.known = true; });
      if (!s.discoveries.includes(`route:${system.id}`)) s.discoveries.push(`route:${system.id}`);
      event(s, 'scan', 'Signals resolved and neighboring routes charted. Investigate locations for unique survey data.');
    } else if (action === 'mine') {
      if (cargoUsed(s) < p.capacity && loc.deposit > 0) { loc.deposit--; p.cargo.ore = (p.cargo.ore ?? 0) + 1; event(s, 'salvage', 'Extracted one titanium ore. Deposit depleted by one unit.'); }
    } else if (!loc.surveyed) {
      loc.surveyed = true; loc.known = 3; s.discoveries.push(loc.id);
      const science = s.crew.filter(c => c.home === 'player' && c.health > 0).reduce((n, c) => Math.max(n, c.skills.science), 0);
      income(s, 15 + Math.min(10, science) + (p.modules.includes('sensors') ? 5 : 0)); if (loc.archive) coordinate(s, system.id);
      event(s, 'discovery', `${loc.name} surveyed. Field grant received; unique survey data can be sold once.`);
      if (loc.kind === 'signal') s.code = true;
      missionSurvey(s, loc.id);
    }
  }
  for (const c of s.crew.filter(c => c.home === 'player' && c.shipId !== 'player' && c.health > 0)) {
    if (c.task === 'return') {
      const ship = s.ships.find(sh => sh.id === c.shipId);
      if (c.path.length === 0 && ship && c.room === ship.rooms[0].id && ++c.progress >= 100) { c.shipId = 'player'; c.room = p.rooms[0].id; c.task = 'idle'; c.path = []; c.progress = 0; event(s, 'boarding', `${c.name} returned aboard.`); }
    }
    const ship = s.ships.find(x => x.id === c.shipId), room = ship?.rooms.find(r => r.id === c.room);
    if (room && c.task === 'search' && !room.searched && c.progress >= 100) {
      const result = missionSearch(s, c.shipId, c.room, c.id);
      if (!result.ok) { c.task = 'idle'; event(s, 'error', result.message); continue; }
      const loc = currentLocation(s);
      if (ship?.rooms.filter(r => r.searched).length === ship?.rooms.length) {
        loc.depleted = true; if (loc.archive) coordinate(s, currentSystem(s).id);
      }
    }
  }
  if (s.encounter === 'won') {
    currentLocation(s).depleted = true;
    if (s.systemId === 's7') s.guardian = true;
    if (['s2', 's4', 's5'].includes(s.systemId) && currentLocation(s).kind === 'pirate') coordinate(s, s.systemId);
  }
  if (s.tick % 200 === 0) {
    for (const m of s.markets) for (const g of GOODS) m.stock[g.id] = Math.min(60, m.stock[g.id] + 1);
    if (sensors && sensors.power > 0 && sensors.health > 0 && sensors.ion === 0) sys.locations.forEach(l => { if (l.known === 0) l.known = 1; });
  }
  if (s.tick % 2400 === 0) {
    const m = s.markets[Math.floor(random(s) * s.markets.length)];
    const events = ['Outbreak', 'War demand', 'Supply shortage', 'Mining boom', 'Stable'];
    m.event = events[Math.floor(random(s) * events.length)]; m.factor = m.event === 'Mining boom' ? 0.8 : m.event === 'Stable' ? 1 : 1.3;
    event(s, 'economy', `${m.id}: ${m.event}. Previously observed prices are now stale.`);
  }
  missionTick(s);
  reconcileLostCrew(s);
}
