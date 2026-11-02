import { useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { GameController } from '../game/controller';
import { AudioCues } from '../game/audio';
import { createDrill } from '../game/training';
import { WEAPONS } from '../content/weapons';
import { decode, encode, SAVE_KEY } from '../game/persistence';
import { createGame, jumpCost } from '../sim/game';
import { cargoMass, cargoUsed, fittingReason, GOODS, tradeQuote, UPGRADES } from '../content/region';
import { discoveryKind, MISSION_BRIEFINGS, SURVEY_VALUES } from '../content/expedition';
import type { Command, GameState, SystemKind, Task } from '../sim/types';
import Scene from '../render/Scene';

type Panel = 'map' | 'station' | 'crew' | 'systems' | 'journal' | 'settings' | 'help' | 'new' | null;
const labels: Record<SystemKind, string> = { reactor: 'Reactor', cockpit: 'Cockpit', engines: 'Engines', shields: 'Shields', weapons: 'Weapons', oxygen: 'Oxygen', medbay: 'Medbay', sensors: 'Sensors', doors: 'Doors', ew: 'EW' };
const glyphs: Record<SystemKind, string> = { reactor: 'ϟ', cockpit: '◇', engines: '≋', shields: '⬡', weapons: '⌁', oxygen: 'O₂', medbay: '+', sensors: '◎', doors: '▥', ew: '⌘' };
const lessons = [
  { title: 'The ship is yours', body: 'You command; you do not steer. SPACE pauses instantly. Orders queued while paused execute on resume. Select Ivo on the roster, then a room and a task. Try moving him to Shields.', check: 'Move a crew member', done: (s: GameState) => s.crew.some(c => c.home === 'player' && (c.task === 'move' || c.path.length > 0)) || s.queue.some(c => c.type === 'crew') },
  { title: 'Power is a decision', body: 'The bottom instruments separate HEALTH from allocated POWER. Use + or - to move reactor units. Unpowered weapons cannot charge; unpowered oxygen slowly becomes dangerous.', check: 'Issue a power allocation order', done: (s: GameState) => s.queue.some(c => c.type === 'power') || s.events.some(e => e.kind === 'power') },
  { title: 'An expedition, not an arena', body: 'M opens navigation. Begin at Haven: buy supplies, accept freight, survey a planet. Verdant, Vesper and Nacre hold independent archive coordinates. Charts and physical discoveries offer different paths. Return the final archive here to win.', check: 'Plot a local course from Navigation', done: (s: GameState) => s.travel !== null || s.locationId !== 's0-station' },
  { title: 'Disable a capability', body: 'At a hostile contact, select a weapon, then an enemy room. Laser strips shields; ion disables systems. AUTO-FIRE is explicit. Q and E select the first two weapons. Escape cancels targeting. Field Manual offers reversible emergency and boarding drills.', check: 'Aim a weapon during an encounter, or skip if exploring peacefully', done: (s: GameState) => s.queue.some(c => c.type === 'target') || s.ships[0].weapons.some(w => w.target !== null) },
];
function Segments({ value, max, color = 'green' }: { value: number; max: number; color?: string }) {
  return <span className={`segments ${color}`} aria-hidden="true">{Array.from({ length: Math.min(30, Math.ceil(max)) }, (_, i) => <i key={i} className={i < Math.ceil(value / max * Math.min(30, Math.ceil(max))) ? 'filled' : ''} />)}</span>;
}
export default function App() {
  const [api] = useState(() => new GameController());
  useSyncExternalStore(api.subscribe, api.snapshot);
  const s = api.state, p = s.ships[0], enemy = s.ships.find(x => x.doctrine === 'pirate' || x.doctrine === 'military') ?? s.ships.find(x => x.doctrine === 'derelict');
  const system = s.region.find(x => x.id === s.systemId)!, loc = system.locations.find(x => x.id === s.locationId)!;
  const sensor = p.systems.find(x => x.kind === 'sensors');
  const enemyIntel = Boolean(sensor && sensor.health > 0 && sensor.power > 0 && sensor.ion === 0 && loc.known >= 2);
  const [panel, setPanel] = useState<Panel>(null);
  const [selectedCrew, setSelectedCrew] = useState<string | null>(null);
  const [selectedWeapon, setSelectedWeapon] = useState<string | null>(null);
  const [selectedRoom, setSelectedRoom] = useState<{ ship: string; room: string } | null>(null);
  const [auto, setAuto] = useState(true);
  const [seed, setSeed] = useState('12345');
  const [difficulty, setDifficulty] = useState<GameState['difficulty']>('standard');
  const [reducedMotion, setReducedMotion] = useState(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const [muted, setMuted] = useState(false);
  const [started, setStarted] = useState(false);
  const [canContinue, setCanContinue] = useState(false);
  const [tutorial, setTutorial] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [mapRegion, setMapRegion] = useState(false);
  const [stationTab, setStationTab] = useState('market');
  const [inspectedShip, setInspectedShip] = useState('player');
  const [confirm, setConfirm] = useState<{ text: string; command: Command } | null>(null);
  const audio = useRef<AudioCues>(new AudioCues());
  const trainingBackup = useRef<GameState | null>(null);
  const [drill, setDrill] = useState<'emergency' | 'boarding' | null>(null);
  const lastEvent = useRef(0);
  const send = (c: Command) => { audio.current.start(); return api.dispatch(c); };
  const open = (next: Panel) => { setPanel(next); api.modal = next !== null; api.accumulator = 0; };
  const roomClick = (ship: string, room: string) => {
    setSelectedRoom({ ship, room });
    if(selectedWeapon && ship === enemy?.id && s.encounter === 'hostile') send({ type: 'target', weapon: selectedWeapon, room, auto });
  };
  useEffect(() => {
    let frame = 0, prior = performance.now(), saveTicks = 0, lastState = api.state;
    const loop = (now: number) => {
      api.advance(now - prior); prior = now;
      if (lastState !== api.state) { lastState = api.state; saveTicks = api.state.tick; }
      if(!api.training && api.state.phase === 'expedition' && api.state.tick - saveTicks >= 600) { saveTicks = api.state.tick; api.persist(); }
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    const hidden = () => { if(document.hidden) api.hidden(); };
    const blur = () => api.hidden();
    document.addEventListener('visibilitychange', hidden); window.addEventListener('blur', blur);
    return () => { cancelAnimationFrame(frame); document.removeEventListener('visibilitychange', hidden); window.removeEventListener('blur', blur); };
  }, [api]);
  useEffect(() => {
    api.modal = panel !== null || confirm !== null || !started;
    return () => { api.modal = false; };
  }, [panel, confirm, started, api]);
  useEffect(() => {
    const latest = s.events.at(-1);
    if(latest && latest.id !== lastEvent.current) { audio.current.play(latest.kind, s.tick); lastEvent.current = latest.id; }
  }, [s.tick, s.events.length, s.events.at(-1)?.id]);
  useEffect(() => { audio.current.muted = muted; }, [muted]);
  useEffect(() => {
    try {
      const bytes = localStorage.getItem(SAVE_KEY);
      setCanContinue(Boolean(bytes && decode(bytes)));
    } catch (error) {
      setCanContinue(false);
      api.message = `Saved expedition unavailable: ${error instanceof Error ? error.message : String(error)}. Use Import / recovery.`;
      api.notify();
    }
  }, [api, started, panel]);
  useEffect(() => () => audio.current.dispose(), []);
  useEffect(() => {
    if (import.meta.env.PROD && 'serviceWorker' in navigator) {
      void navigator.serviceWorker.register('./sw.js').catch(error => {
        api.message = `Offline cache unavailable: ${error instanceof Error ? error.message : String(error)}. Online play and JSON exports remain available.`;
        api.notify();
      });
    }
  }, [api]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if(e.ctrlKey || e.metaKey || e.altKey || (e.target instanceof HTMLElement && ['INPUT', 'SELECT', 'TEXTAREA'].includes(e.target.tagName))) return;
      if(e.key === 'Escape') { if(selectedWeapon) setSelectedWeapon(null); else { open(null); setConfirm(null); } }
      else if(e.code === 'Space') { e.preventDefault(); api.togglePause(); }
      else if(e.key.toLowerCase() === 'm' || e.key.toLowerCase() === 'j') open(panel === 'map' ? null : 'map');
      else if(e.key.toLowerCase() === 'f') api.persist();
      else if(['1', '2', '3'].includes(e.key)) { const crew = s.crew.filter(c => c.home === 'player')[Number(e.key) - 1]; if(crew) setSelectedCrew(crew.id); }
      else if(e.key.toLowerCase() === 'q' || e.key.toLowerCase() === 'e') { const w = p.weapons[e.key.toLowerCase() === 'q' ? 0 : 1]; if(w) setSelectedWeapon(w.id); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  });
  const selected = s.crew.find(c => c.id === selectedCrew && c.home === 'player');
  const roomShip = s.ships.find(x => x.id === selectedRoom?.ship);
  const room = roomShip && (roomShip.id === 'player' || roomShip.doctrine === 'derelict' || enemyIntel) ? roomShip.rooms.find(r => r.id === selectedRoom?.room) : undefined;
  const used = p.systems.reduce((n, x) => n + x.power, 0);
  const reactor = p.systems.find(x => x.kind === 'reactor')!;
  const reactorBudget = Math.floor(p.reactor * reactor.health / reactor.max);
  let weaponBudget = p.systems.find(x => x.kind === 'weapons')!.power;
  const poweredWeapons = new Set(p.weapons.filter(w => {
    const power = WEAPONS[w.family].power;
    if (weaponBudget < power) return false;
    weaponBudget -= power; return true;
  }).map(w => w.id));
  const inspectedCandidate = s.ships.find(sh => sh.id === inspectedShip) ?? p;
  const inspected = inspectedCandidate.doctrine === 'pirate' || inspectedCandidate.doctrine === 'military' ? enemyIntel ? inspectedCandidate : p : inspectedCandidate;
  const unsoldRecords = s.discoveries.filter(id => !s.soldData.includes(id));
  const surveyValue = unsoldRecords.reduce((sum, id) => sum + SURVEY_VALUES[discoveryKind(s, id)], 0);
  const repairCost = Math.ceil(((p.maxHull - p.hull) * 2 + p.systems.reduce((sum, x) => sum + (x.max - x.health) * 3, 0)) * (s.difficulty === 'relaxed' ? 0.8 : 1));
  const boardingEntry = enemy && (enemy.doctrine === 'derelict' || enemyIntel) ? enemy.rooms[0] : undefined;
  const newRun = () => {
    if(!/^\d+$/.test(seed) || Number(seed) > 4294967295) { api.message = 'Seed must be a decimal uint32 (0–4294967295).'; api.notify(); return; }
    trainingBackup.current = null; api.training = false; setDrill(null);
    api.replace(createGame(Number(seed), difficulty)); setStarted(true); setSelectedCrew(null); setSelectedWeapon(null); setSelectedRoom(null); setTutorial(true); open(null); audio.current.start();
  };
  const task = (task: Task) => {
    if(!selected || !room) { api.message = 'Select a living crew member and a room first.'; api.notify(); return; }
    send({ type: 'crew', crew: selected.id, room: room.id, task });
  };
  const download = () => {
    try { const url = URL.createObjectURL(new Blob([encode(s)], { type: 'application/json' })); const a = document.createElement('a'); a.href = url; a.download = `starship-${s.seed}-${s.tick}.json`; a.click(); URL.revokeObjectURL(url); }
    catch(e) { api.message = `Export failed: ${e instanceof Error ? e.message : String(e)}`; api.notify(); }
  };
  const startDrill = (kind: 'emergency' | 'boarding') => {
    if(api.training) return;
    trainingBackup.current = structuredClone(s); api.training = true; setDrill(kind); setTutorial(false);
    api.replace(createDrill(kind)); setSelectedCrew(api.state.crew[1].id); setSelectedRoom(null); open(null);
  };
  const endDrill = () => {
    if(trainingBackup.current) api.replace(trainingBackup.current);
    trainingBackup.current = null; api.training = false; setDrill(null); setSelectedCrew(null); setSelectedRoom(null);
  };
  const canFast = s.encounter !== 'hostile' && !s.customs;
  const summary = <><p>Seed <b>{s.seed}</b> · Active simulation {(s.tick / 1200).toFixed(1)} min · Archives {s.coordinates.length}/3</p><p>{s.crew.filter(c => c.home === 'player' && c.health > 0).length} crew survived · {s.discoveries.length} discoveries · {s.contracts.filter(c => c.status === 'complete').length} contracts completed</p><p>Credits {p.credits} · Debt {p.debt} · Net wealth {p.credits - p.debt}</p><p>{Object.entries(s.reputation).map(([name, value]) => `${name} ${value > 0 ? '+' : ''}${value}`).join(' / ')}</p></>;
  const contractCards = <div className="service-grid">{s.contracts.filter(c => c.origin === loc.id || c.status === 'active').map(c => <article key={c.id}>
    <span className="eyebrow">{c.kind} / {c.status}</span><h3>{c.name}</h3>
    <p>Destination: {s.region.flatMap(r => r.locations).find(l => l.id === c.destination)?.name}</p>
    <p>{MISSION_BRIEFINGS[c.kind]}</p><p>Reward {c.reward} CR · Required quantity/reserved space {c.quantity}</p>
    {c.passenger && <p>Passenger {c.passenger.name}: {Math.ceil(c.passenger.health)} HP · {c.passenger.status}</p>}
    {c.convoyId && <p>Convoy hull {Math.ceil(s.ships.find(sh => sh.id === c.convoyId)?.hull ?? 0)} · Target {c.targetDefeated ? 'resolved' : 'not defeated'}</p>}
    {c.kind === 'investigation' && <p>Intercepted clue {c.investigationIntercepted ? 'YES' : 'NO'} · Relay evidence corroborated {c.investigationIntercepted && c.progress >= 1 ? 'YES' : 'NO'}</p>}
    {c.recorderId && <p>Flight recorder {(p.cargo[c.recorderId] ?? 0) > 0 ? 'RECOVERED' : 'MISSING'} · Return to origin</p>}
    {c.kind === 'salvage' && <p>Components recovered {c.salvageRecovered ?? 0}/{c.quantity} · Return to origin</p>}
    {c.kind === 'smuggling' && <p>Cleared inspections {c.inspections ?? 0} · {c.inspectionPending ? 'INSPECTION PENDING' : 'No pending inspection'}</p>}
    {c.failureReason && <p className="warning">{c.failureReason}</p>}
    <small>{c.status === 'active' ? `${Math.max(0, Math.ceil((c.deadline - s.tick) / 20))} simulation seconds remaining.` : `${c.kind === 'emergency' ? '5' : '15'} simulation-minute deadline on acceptance.`} Abandon costs 5 CR/debt and releases reserved capacity. Reward once.</small>
    <div>{c.status === 'offered' ? <button onClick={() => send({ type: 'contract', id: c.id, action: 'accept' })}>Accept</button> : c.status === 'active' && <><button onClick={() => send({ type: 'contract', id: c.id, action: 'complete' })}>Claim completion</button><button onClick={() => send({ type: 'contract', id: c.id, action: 'abandon' })}>Abandon</button></>}</div>
  </article>)}</div>;
  return <main className={`command-deck ${reducedMotion ? 'reduced-motion' : ''}`}>
    <header className="telemetry">
      <section className="player-readout frame">
        <div className="hull-label"><span>HULL <small>WAYFARER</small></span><strong>{Math.ceil(p.hull)} / {p.maxHull}</strong></div>
        <Segments value={p.hull} max={p.maxHull} />
        <div className="resource-row"><span className="shield-readout">SHIELDS <b>{'●'.repeat(Math.ceil(p.shields)) || 'OFFLINE'}</b></span><span title="Jump fuel">FUEL <b>{p.fuel}</b></span><span title="Missile ammunition">AMMO <b>{p.missiles}</b></span><span title="Credits and scrap">CR <b>{p.credits}</b></span></div>
      </section>
      <section className="ftl-readout"><span className="eyebrow">FTL DRIVE</span><progress aria-label="FTL charge" value={p.ftl} max={600} /><div><strong>{p.ftl >= 600 ? 'JUMP READY' : `CHARGING ${Math.floor(p.ftl / 6)}%`}</strong><button onClick={() => { setMapRegion(true); open('map'); }}>JUMP <kbd>J</kbd></button></div></section>
      <button className="settings-button frame" aria-label="Settings" onClick={() => open('settings')}>⚙</button>
      <section className={`enemy-readout frame ${!enemy ? 'quiet' : ''}`}>
        <div className="hull-label"><span>{enemy ? 'CONTACT HULL' : 'EXPEDITION'}</span><strong>{enemy ? enemyIntel || enemy.doctrine === 'derelict' ? `${Math.ceil(enemy.hull)} / ${enemy.maxHull}` : '? / ?' : `${s.coordinates.length} / 3`}</strong></div>
        {enemy ? enemyIntel || enemy.doctrine === 'derelict' ? <><Segments value={enemy.hull} max={enemy.maxHull} color="red" /><div className="enemy-name"><span>SHIELDS {'●'.repeat(Math.ceil(enemy.shields)) || 'DOWN'}</span><b>{enemy.name}</b></div></> : <p className="objective-line">TACTICAL INTELLIGENCE UNAVAILABLE · Restore sensors</p> : <><p className="objective-line">{s.archive ? 'Return the archive to Haven Anchorage' : s.coordinates.length === 3 ? 'Open the Terminus route' : 'Recover the Cartographer coordinates'}</p><small>{system.name} / {loc.name}</small></>}
      </section>
    </header>
    <section className="tactical-area" aria-label="Tactical ship view">
      <Scene state={s} selectedCrew={selectedCrew} selectedWeapon={selectedWeapon} onRoom={roomClick} onCrew={id => { if (s.crew.some(c => c.id === id && c.home === 'player')) setSelectedCrew(id); }} reducedMotion={reducedMotion} enemyIntel={enemyIntel} />
      <aside className="crew-roster">
        <div className="eyebrow">CREW MANIFEST</div>
        {s.crew.filter(c => c.home === 'player').map((c, i) => <button key={c.id} onClick={() => setSelectedCrew(c.id)} className={`crew-card frame ${selectedCrew === c.id ? 'selected' : ''} ${c.health <= 0 ? 'dead' : ''}`} aria-pressed={selectedCrew === c.id}><span className={`portrait portrait-${i % 3}`} aria-hidden="true"><i /></span><span><b>{c.name}</b><progress aria-label={`${c.name} health`} max="100" value={c.health} /><small>{c.health <= 0 ? 'DECEASED' : c.shipId !== 'player' ? `AWAY · ${c.task}` : c.task.toUpperCase()}</small></span><kbd>{i < 3 ? i + 1 : ''}</kbd></button>)}
        <div className="roster-actions"><button title="Crew and orders" onClick={() => open('crew')}>CREW</button><button title="Ship systems and doors" onClick={() => open('systems')}>SHIP</button></div>
      </aside>
      <div className="location-strip"><span className="status-dot" />{system.name.toUpperCase()} <span>/</span> {loc.name} <span className="risk-label">RISK {system.risk}/3</span></div>
      {selectedWeapon && <div className="targeting-banner">TARGETING {p.weapons.find(w => w.id === selectedWeapon)?.family.toUpperCase()} — click an enemy room <button onClick={() => setSelectedWeapon(null)}>CANCEL</button></div>}
      {s.travel && <div className="operation-banner frame"><b>{s.travel.system ? 'JUMP TRANSIT' : 'IN-SYSTEM TRANSIT'}</b><progress value={s.travel.total - s.travel.remaining} max={s.travel.total} /><span>Travel is interruptible; SPACE pauses.</span></div>}
      {s.action && <div className="operation-banner frame"><b>{s.action.kind.toUpperCase()} IN PROGRESS</b><span>{Math.ceil(s.action.remaining / 20)} seconds remaining</span></div>}
      {s.threat && <div className="encounter-choice frame"><b>INCOMING CONTACT · {Math.ceil(s.threat.remaining / 20)} SECONDS</b><p>Recall away teams before interception. Evade spends one fuel; safe passage costs 20 credits. Preparing continues the countdown at normal speed.</p><button onClick={() => send({ type: 'threat', choice: 'evade' })}>Evade · 1 fuel</button><button onClick={() => send({ type: 'threat', choice: 'pay' })}>Pay · 20 CR</button><button onClick={() => { send({ type: 'threat', choice: 'prepare' }); api.paused = false; api.notify(); }}>Prepare for contact</button></div>}
      {s.encounter === 'surrender' && <div className="encounter-choice frame"><b>HOSTILE OFFERS SURRENDER</b><p>Accept a single salvage payment and cease fire.</p><button onClick={() => send({ type: 'surrender', accept: true })}>Accept terms</button><button onClick={() => send({ type: 'surrender', accept: false })}>Reject</button></div>}
      {s.customs && <div className="encounter-choice frame"><b>CUSTOMS INTERCEPT</b><p>Submit: confiscation/fine if illegal. Bribe: 20 CR. Conceal: 45% success. EW spoof: 85%. Flee: reputation -5. Fight: tactical encounter.</p>{(['submit', 'bribe', 'conceal', 'spoof', 'flee', 'fight'] as const).map(choice => <button key={choice} onClick={() => send({ type: 'customs', choice })}>{choice.toUpperCase()}</button>)}</div>}
      {room && <div className="room-inspector frame"><button className="close-mini" aria-label="Close room inspector" onClick={() => setSelectedRoom(null)}>×</button><b>{roomShip?.name} / {room.name}</b><p>O₂ {Math.round(room.oxygen * 100)}% · FIRE {Math.round(room.fire * 100)}% · BREACH {room.breach.toFixed(1)}</p><p>{labels[room.system]} · {roomShip?.systems.find(x => x.kind === room.system)?.health.toFixed(1)} HP</p>{selected && <><small>{selected.name} orders</small><div className="task-buttons">{(['move', 'repair', 'extinguish', 'operate', 'heal', 'search', 'fight', 'sabotage'] as const).map(t => <button key={t} onClick={() => task(t)}>{t}</button>)}</div></>}</div>}
      <aside className="event-feed" aria-label="Ship log" aria-live="polite">{s.events.slice(-3).reverse().map(e => <div key={e.id} className={e.kind}><time>{Math.floor(e.tick / 1200).toString().padStart(2, '0')}:{Math.floor(e.tick / 20 % 60).toString().padStart(2, '0')}</time>{e.message}</div>)}</aside>
      {tutorial && <aside className="tutorial frame"><span className="eyebrow">COMMAND ACADEMY · {Math.min(s.tutorial + 1, 4)}/4</span><h2>{lessons[Math.min(s.tutorial, 3)].title}</h2><p>{lessons[Math.min(s.tutorial, 3)].body}</p><small>{lessons[Math.min(s.tutorial, 3)].check}</small><div><button onClick={() => { if(s.tutorial >= 3) setTutorial(false); else if(lessons[s.tutorial].done(s)) { s.tutorial++; api.notify(); } else { api.message = 'Try the indicated action, or skip the optional lesson.'; api.notify(); } }}> {s.tutorial >= 3 ? 'Take command' : 'Check action / Next'}</button><button onClick={() => setTutorial(false)}>Skip introduction</button></div></aside>}
    </section>
    <nav className="navigation-bar" aria-label="Command screens"><button onClick={() => { setMapRegion(false); open('map'); }}>NAVIGATION <kbd>M</kbd></button><button onClick={() => open('station')}>{loc.kind === 'station' ? 'DOCK / STATION' : 'OPERATIONS'}</button><button onClick={() => open('journal')}>JOURNAL <b>{s.coordinates.length}/3</b></button><button onClick={() => open('help')}>FIELD MANUAL</button><span className={`feedback ${api.message.toLowerCase().includes('fail') ? 'warning' : ''}`} role="status">{api.message || 'Command link stable. All systems nominal.'}</span></nav>
    <footer className="instruments">
      <section className="reactor-gauge"><span className="eyebrow">REACTOR</span><Segments value={reactorBudget - used} max={p.reactor} /><b>{reactorBudget - used} SPARE</b><small>{used}/{reactorBudget} used</small><small>{reactorBudget}/{p.reactor} online</small></section>
      <section className="systems-panel frame"><h2>SYSTEMS <button onClick={() => open('systems')}>DETAILS</button></h2><div className="system-tiles">{(['shields', 'engines', 'oxygen', 'weapons', 'medbay'] as const).map(kind => { const x = p.systems.find(x => x.kind === kind)!; return <div key={kind} className={`system-tile ${x.health <= 0 ? 'offline' : ''}`}><span className="system-icon">{glyphs[kind]}</span><b>{labels[kind]}</b><span className="power-controls"><button aria-label={`Decrease ${kind} power`} onClick={() => send({ type: 'power', ship: 'player', system: kind, delta: -1 })}>−</button><Segments value={x.power} max={x.cap} /><button aria-label={`Increase ${kind} power`} onClick={() => send({ type: 'power', ship: 'player', system: kind, delta: 1 })}>+</button></span><small>{x.ion > 0 ? 'ION LOCK' : `HP ${x.health.toFixed(1)}/${x.max}`}</small></div>; })}</div></section>
      <section className="weapons-panel frame">
        <h2>WEAPONS <label><input type="checkbox" checked={auto} onChange={e => setAuto(e.target.checked)} /> AUTO-FIRE</label></h2>
        <div className="weapon-tiles">{p.weapons.map((w, i) => {
          const stats = WEAPONS[w.family], charge = Math.min(100, Math.floor(w.charge / stats.chargeTicks * 100));
          return <div key={w.id} className={`weapon-tile ${selectedWeapon === w.id ? 'selected' : ''}`}>
            <button onClick={() => setSelectedWeapon(selectedWeapon === w.id ? null : w.id)}>
              <b>{i + 1} {w.family === 'laser' ? 'Pulse Laser' : w.family === 'ion' ? 'Ion Lance' : w.family.toUpperCase()}</b>
              <progress aria-label={`${w.family} charge`} value={charge} max={100} />
              <small>{poweredWeapons.has(w.id) ? `${charge === 100 ? 'READY' : `${charge}%`} · ${stats.power} POWER` : `UNPOWERED · NEEDS ${stats.power}`}</small>
              <span className="weapon-state">{w.target ? `${w.auto ? 'AUTO' : 'SINGLE'} · ${w.target.replace(/^.*-/, '')}` : 'SELECT → ENEMY ROOM'}</span>
            </button>
            <div className="weapon-actions">
              <button aria-label={`Move ${w.family} earlier`} disabled={i === 0} onClick={() => send({ type: 'weapon-priority', weapon: w.id, direction: -1 })}>↑</button>
              <button aria-label={`Move ${w.family} later`} disabled={i === p.weapons.length - 1} onClick={() => send({ type: 'weapon-priority', weapon: w.id, direction: 1 })}>↓</button>
              <button disabled={!w.target} onClick={() => send({ type: 'cease-fire', weapon: w.id })}>CEASE</button>
            </div>
          </div>;
        })}</div>
      </section>
      <section className="drones-panel frame"><h2>DRONES</h2><div>{p.modules.includes('drones') ? 'DEFENSE DRONE ACTIVE' : 'NO DRONE MODULE'}</div><small>BOARDING {p.modules.includes('teleporter') ? 'ONLINE' : 'UNFITTED'}</small></section>
      <section className="pause-stack"><button className={`pause-button frame ${api.paused ? 'paused' : ''}`} onClick={() => api.togglePause()}>{api.paused ? '▶ RESUME' : 'Ⅱ PAUSE'}<kbd>SPACE</kbd></button><span>{api.paused ? api.reason : api.modal ? 'Interaction paused' : `LIVE · ${api.speed}× SAFE`}</span><button disabled={!canFast} title="Fast-forward only in safe space; combat and emergencies always use 1×" onClick={() => { api.speed = api.speed === 1 ? 4 : api.speed === 4 ? 8 : 1; api.notify(); }}>SAFE SPEED {api.speed}×</button></section>
    </footer>
    {drill && <aside className="drill-banner frame"><b>REVERSIBLE {drill === 'emergency' ? 'DAMAGE-CONTROL' : 'AWAY-TEAM'} DRILL</b><p>{drill === 'emergency' ? 'Select Ivo, choose Weapons, extinguish fire and repair the breach/system; vent only if safe, close, refill and heal in a powered medbay.' : 'Ivo is aboard the wreck. Inspect atmosphere and route, recall via Crew, then resume until he physically returns.'}</p><strong>{drill === 'emergency' ? p.rooms.every(r => r.fire === 0 && r.breach === 0) && p.systems.every(x => x.health === x.max) ? 'DRILL OBJECTIVE VERIFIED' : 'Recovery is not complete yet' : s.crew.every(c => c.home !== 'player' || c.shipId === 'player') ? 'DRILL OBJECTIVE VERIFIED' : 'Away team has not returned yet'}</strong><button onClick={endDrill}>Return to expedition unchanged</button></aside>}
    {(!started || panel === 'new') && <div className="modal-backdrop"><section className="start-screen frame" role="dialog" aria-modal="true" aria-label="Expedition briefing"><span className="eyebrow">A SHIP. A CREW. AN UNKNOWN HORIZON.</span><h1>STAR<span>SHIP</span></h1><h2>Expedition Command</h2><p>Command the Wayfarer through a living stellar frontier. Trade to prepare, investigate the unknown, and keep your crew alive when the hull gives way.</p><div className="briefing-grid"><div><b>01 / DISCOVER</b><p>Recover three lost coordinates in Verdant, Vesper and Nacre.</p></div><div><b>02 / DECIDE</b><p>Survey, bargain or salvage. Fit a ship that supports your choices.</p></div><div><b>03 / RETURN</b><p>Reach Terminus. Recover the archive. Bring it home to Haven.</p></div></div><div className="start-options"><label>EXPEDITION SEED<input value={seed} inputMode="numeric" onChange={e => setSeed(e.target.value)} /></label><label>DIFFICULTY<select value={difficulty} onChange={e => setDifficulty(e.target.value as GameState['difficulty'])}><option value="standard">Standard</option><option value="relaxed">Relaxed</option><option value="hard">Hard</option></select></label></div><p className="muted">Tactical pause is unlimited. Expedition pacing targets 90–180 minutes; human pacing validation is pending. Local saves only; export backups.</p><div className="dialog-actions"><button className="primary" onClick={() => { if(canContinue) { setConfirm({ text: 'Start a new expedition? Your existing save is retained until you explicitly save the new run.', command: { type: 'abandon', confirm: false } }); } else newRun(); }}>New Expedition</button><button disabled={!canContinue} onClick={() => { api.load(); if(!api.message.startsWith('Load failed')) { setStarted(true); open(null); } }}>Continue</button><button onClick={() => open('settings')}>Import / recovery</button></div><p className="error-text" role="status">{api.message}</p></section></div>}
    {panel && panel !== 'new' && <div className="modal-backdrop"><section className={`dialog frame dialog-${panel}`} role="dialog" aria-modal="true" aria-label={panel}><header><div><span className="eyebrow">WAYFARER / COMMAND INTERFACE</span><h1>{({ map: 'Navigation', station: loc.kind === 'station' ? loc.name : 'Field Operations', crew: 'Crew & Away Teams', systems: 'Ship Systems', journal: 'Expedition Journal', settings: 'Settings & Persistence', help: 'Captain’s Field Manual' })[panel]}</h1></div><button aria-label="Close dialog" onClick={() => open(null)}>CLOSE <kbd>ESC</kbd></button></header>
      {panel === 'map' && <>
        <div className="tabs"><button className={!mapRegion ? 'active' : ''} onClick={() => setMapRegion(false)}>SYSTEM CONTACTS</button><button className={mapRegion ? 'active' : ''} onClick={() => setMapRegion(true)}>STELLAR REGION</button></div>
        <div className="map-summary"><span>{system.name} · {system.economy} · {system.faction}</span><b>Fuel {p.fuel}/{p.maxFuel} · Cargo mass {cargoMass(s)} · Jump cost {jumpCost(s)}</b></div>
        {mapRegion ? <>
          <div className="region-map">{s.region.filter(r => r.known).map(r => {
            const serviced = r.locations.some(l => l.kind === 'station');
            return <article key={r.id} className={`star-node ${r.id === s.systemId ? 'current' : ''}`}>
              <div className={`star risk-${r.risk}`} /><span className="eyebrow">{['CORE', 'FRONTIER', 'DEEP SPACE', 'UNKNOWN'][r.risk]}</span>
              <h2>{r.name}</h2><p>{r.faction} · {r.economy}</p>
              <p>Routes: {r.routes.map(id => s.region.find(x => x.id === id)?.known ? s.region.find(x => x.id === id)?.name : 'Unknown').join(', ')}</p>
              <small>{serviced ? 'Station refueling / paid rescue available' : 'Isolated: one emergency beacon; cargo loss +75 CR/debt'}</small>
              <button disabled={r.id === s.systemId || !system.routes.includes(r.id)} onClick={() => setConfirm({
                text: `Jump to ${r.name}: ${jumpCost(s)} fuel. ${serviced ? 'Station services and paid rescue available.' : 'Deep-space isolation: one cargo-loss emergency beacon, 75 CR/debt.'} ${r.id === 's7' ? 'Two spare fuel required for Terminus.' : ''} FTL must be fully charged.`,
                command: { type: 'travel', destination: r.id, system: true, confirm: true },
              })}>{r.id === s.systemId ? 'CURRENT SYSTEM' : system.routes.includes(r.id) ? 'PLOT JUMP' : 'NO DIRECT ROUTE'}</button>
            </article>;
          })}</div>
          <p className="muted">FTL requires 30 powered seconds, working engines/cockpit and crew aboard. Safe speed accelerates safe charging, not combat. Unknown routes are revealed by scanning or purchased intelligence.</p>
        </> : <>
          <div className="operation-buttons"><button onClick={() => send({ type: 'action', action: 'scan' })}>Active scan</button><button onClick={() => send({ type: 'action', action: 'probe' })}>Launch probe · 5 CR</button><button onClick={() => { open(null); api.paused = false; api.notify(); }}>Return to live simulation</button></div>
          <div className="contact-grid">{system.locations.filter(l => l.known > 0).map(l => <article key={l.id} className={`contact-card ${l.id === loc.id ? 'current' : ''}`}>
            <span className={`contact-symbol ${l.kind}`}>{l.kind === 'planet' ? '◉' : l.kind === 'station' ? '⬡' : l.kind === 'pirate' ? '△' : l.kind === 'derelict' ? '▱' : '◇'}</span>
            <div><span className="eyebrow">{l.known < 2 ? 'UNRESOLVED CONTACT' : l.kind.toUpperCase()}</span><h3>{l.known < 2 ? 'Unknown signature' : l.name}</h3><small>{l.surveyed ? 'SURVEY COMPLETE' : l.depleted ? 'EXHAUSTED' : `Identification ${l.known}/3`}</small></div>
            <button disabled={l.id === loc.id} onClick={() => { const result = api.dispatch({ type: 'travel', destination: l.id, system: false }); if(result.ok) { open(null); api.paused = false; api.notify(); } }}>{l.id === loc.id ? 'HERE' : 'SET COURSE'}</button>
          </article>)}</div>
        </>}
      </>}
      {panel === 'station' && <><div className="station-overview"><div><span className="eyebrow">{loc.kind.toUpperCase()} / {system.faction}</span><h2>{loc.name}</h2><p>{loc.kind === 'station' ? `${system.economy} economy · Reputation ${s.reputation[system.faction]} · Live prices at current station` : `Ongoing operations require resuming simulation. Sensors must be powered.`}</p></div><div><b>{p.credits} CR</b><p>Cargo {cargoUsed(s)}/{p.capacity} · Debt {p.debt}</p></div></div>
        {loc.kind === 'station' ? <><div className="tabs">{['market', 'services', 'shipyard', 'contracts'].map(t => <button key={t} className={stationTab === t ? 'active' : ''} onClick={() => setStationTab(t)}>{t.toUpperCase()}</button>)}</div>
          {stationTab === 'market' && <><label className="quantity">TRANSACTION QUANTITY <input type="number" value={quantity} min={1} max={1000} onChange={e => setQuantity(Number(e.target.value))} /></label><p className="muted">Buy/sell totals below include marginal stock prices for the selected quantity. Restricted goods trigger customs. Contract freight is reserved separately.</p><div className="table-scroll"><table><thead><tr><th>COMMODITY</th><th>STOCK</th><th>HOLD</th><th>MASS</th><th>BUY TOTAL</th><th>SELL TOTAL</th><th>ORDER</th></tr></thead><tbody>{GOODS.map(g => <tr key={g.id}><td>{g.name}{g.illegal && <small className="illegal">RESTRICTED</small>}</td><td>{s.markets.find(m => m.id === loc.id)?.stock[g.id]}</td><td>{p.cargo[g.id] ?? 0}</td><td>{g.mass}</td><td>{Number.isInteger(quantity) && quantity > 0 && quantity <= 1000 ? tradeQuote(s, loc.id, g.id, quantity, true) : '—'}</td><td>{Number.isInteger(quantity) && quantity > 0 && quantity <= 1000 ? tradeQuote(s, loc.id, g.id, quantity, false) : '—'}</td><td><button onClick={() => send({ type: 'trade', commodity: g.id, quantity, buy: true })}>Buy</button><button onClick={() => send({ type: 'trade', commodity: g.id, quantity, buy: false })}>Sell</button></td></tr>)}</tbody></table></div></>}
          {stationTab === 'services' && <div className="service-grid">
            <article><h2>Refueling</h2><p>Fuel {p.fuel}/{p.maxFuel}. Cost 4 credits/unit.</p><button onClick={() => send({ type: 'service', service: 'fuel' })}>Buy 1 fuel</button></article>
            <article><h2>Damage control</h2><p>Hull {Math.ceil(p.hull)}/{p.maxHull}; full repair quote {repairCost} CR, including difficulty discount.</p><button onClick={() => send({ type: 'service', service: 'repair' })}>Repair hull & systems</button></article>
            <article><h2>Survey exchange</h2><p>{unsoldRecords.length} unsold records · Total {surveyValue} CR. Record types have different values; archive knowledge remains yours.</p><button onClick={() => send({ type: 'service', service: 'data' })}>Sell unique surveys</button></article>
            <article><h2>Intelligence broker</h2><p>15 CR: current markets, contact resolution, neighboring routes and guardian identification code.</p><button onClick={() => send({ type: 'service', service: 'intel' })}>Buy intelligence</button></article>
            <article><h2>Archive charts</h2><p>30 CR per coordinate in Verdant, Vesper and Nacre. Survey/physical salvage alternatives cost no credits.</p><button onClick={() => send({ type: 'objective', choice: 'chart' })}>Buy local archive chart</button></article>
            <article><h2>Crew contact</h2><p>Hire an engineer for 45 CR. Capacity {p.modules.includes('crew') ? 8 : 6}. Skills affect actual crew work.</p><button onClick={() => send({ type: 'service', service: 'recruit' })}>Recruit crew</button></article>
            {s.archive && <article><h2>Archive extraction</h2><p>Deliver to Haven Anchorage to finish the Expedition.</p><button className="primary" onClick={() => send({ type: 'objective', choice: 'handin' })}>Hand in final archive</button></article>}
          </div>}
          {stationTab === 'shipyard' && <>
            <p>Six fitting slots. Installed {p.modules.length}/6. Weapon priority is adjustable in the bottom instrument panel.</p>
            <div className="service-grid">{Object.entries(UPGRADES).map(([key, u]) => {
              const reason = fittingReason(s, key), stats = Object.entries(WEAPONS).find(([family]) => family === key)?.[1];
              return <article key={key}><h3>{u.name}</h3><p>{u.description}</p>
                {stats && <small>{stats.power} power · {(stats.chargeTicks / 20).toFixed(1)} second charge · {stats.ammo} ammo/shot. Move earlier in weapon priority to allocate power.</small>}
                {reason && <small className="warning">{reason}</small>}
                <button disabled={p.modules.includes(key) || reason !== null} onClick={() => send({ type: 'upgrade', module: key })}>{p.modules.includes(key) ? 'INSTALLED' : `INSTALL · ${u.cost} CR`}</button>
              </article>;
            })}</div>
          </>}
          {stationTab === 'contracts' && contractCards}</>
          : <div className="service-grid"><article><h2>Investigation</h2><p>{loc.surveyed ? 'This survey is complete; no repeat payout.' : 'Analyze the contact physically for a unique survey record and possible archive knowledge.'}</p><button onClick={() => { send({ type: 'action', action: 'investigate' }); open(null); api.paused = false; api.notify(); }}>Investigate location</button></article><article><h2>Prospecting</h2><p>Detected deposit {loc.deposit}. Requires drill; consumes time and cargo space.</p><button onClick={() => { send({ type: 'action', action: 'mine' }); open(null); api.paused = false; api.notify(); }}>Extract minerals</button></article><article><h2>Boarding / salvage</h2><p>Choose crew and board the actual rooms. Watch atmosphere. Search each compartment once; recall before departure.</p><button onClick={() => open('crew')}>Manage away team</button></article>{s.systemId === 's7' && <article><h2>Cartographer Guardian</h2><p>Pass by combat, EW+code, or negotiation: 80 CR or two copies of archive knowledge. Copies never consume coordinates.</p><button onClick={() => send({ type: 'objective', choice: 'negotiate' })}>Negotiate passage</button><button onClick={() => send({ type: 'objective', choice: 'spoof' })}>Spoof guardian code</button><button onClick={() => send({ type: 'objective', choice: 'recover' })}>Recover final archive</button><button onClick={() => send({ type: 'objective', choice: 'withdraw' })}>Withdraw to The Veil</button></article>}</div>}
      </>}
      {panel === 'station' && loc.kind !== 'station' && <><h2>Active field contracts</h2>{contractCards}</>}
      {panel === 'crew' && <>
        <p>{boardingEntry ? `${enemy?.name} entry ${boardingEntry.name}: O₂ ${Math.round(boardingEntry.oxygen * 100)}%, fire ${Math.round(boardingEntry.fire * 100)}%, breach ${boardingEntry.breach.toFixed(1)}.` : 'Contact boarding conditions unknown: restore sensors and identify the vessel.'}</p>
        <div className="service-grid">{s.crew.filter(c => c.home === 'player').map(c => <article key={c.id}>
          <h2>{c.name} <small>{c.health.toFixed(0)} HP</small></h2>
          <p>{c.species} · {c.trait} · {c.shipId === 'player' ? 'ABOARD' : 'AWAY'}</p>
          <p>{c.task} / {s.ships.find(sh => sh.id === c.shipId)?.rooms.find(r => r.id === c.room)?.name}</p>
          <small>{Object.entries(c.skills).map(([k, v]) => `${k} ${v}`).join(' · ')}</small>
          <div><button onClick={() => { setSelectedCrew(c.id); open(null); }}>Select / issue room orders</button>
            <button disabled={!enemy || c.health <= 0 || c.shipId !== 'player'} onClick={() => setConfirm({
              text: `Board ${enemy?.name ?? 'the contact'} with ${c.name}? ${boardingEntry ? `Entry O₂ ${Math.round(boardingEntry.oxygen * 100)}%, fire ${Math.round(boardingEntry.fire * 100)}%, breach ${boardingEntry.breach.toFixed(1)}.` : 'Pressure and hazards UNKNOWN.'} Below 20% oxygen causes suffocation. If this is the last crew member, your mothership cannot jump. Emergency tether costs 20 CR/debt, 10 HP and loose cargo.`,
              command: { type: 'board', crew: c.id, confirm: true },
            })}>Board contact</button></div>
        </article>)}</div>
        <div className="dialog-actions"><button onClick={() => send({ type: 'recall', emergency: false })}>Recall away team</button><button onClick={() => setConfirm({ text: 'Emergency tether: 20 credits/debt, 10 HP per living crew and all loose cargo forfeited. Dead crew cannot be revived.', command: { type: 'recall', emergency: true } })}>Emergency tether</button></div>
      </>}
      {panel === 'systems' && <>
        <label>INSPECT VESSEL<select value={inspected.id} onChange={e => setInspectedShip(e.target.value)}>{s.ships.filter(sh => sh.doctrine === 'player' || sh.doctrine === 'derelict' || enemyIntel).map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}</select></label>
        <p className="muted">Away-vessel engineering controls require physical player crew authorization. Hostile ships cannot be remotely commanded.</p>
        <div className="ship-stats">
          <span>Reactor {inspected.systems.reduce((n, x) => n + x.power, 0)}/{inspected.reactor} used</span>
          <span>FTL {Math.floor(inspected.ftl / 6)}%</span><span>Approach {inspected.bearing}</span>
          {Object.entries(inspected.armor).map(([k, v]) => <span key={k}>{k} armor {v.toFixed(1)}</span>)}
        </div>
        <div className="systems-table">{inspected.systems.map(x => <article key={x.kind}>
          <span className="system-icon">{glyphs[x.kind]}</span>
          <div><b>{labels[x.kind]}</b><small>Health {x.health.toFixed(1)}/{x.max} · Power {x.power}/{x.cap} · Ion {x.ion} ticks</small></div>
          <button aria-label={`Decrease ${inspected.name} ${x.kind} power`} onClick={() => send({ type: 'power', ship: inspected.id, system: x.kind, delta: -1 })}>−</button>
          <button aria-label={`Increase ${inspected.name} ${x.kind} power`} onClick={() => send({ type: 'power', ship: inspected.id, system: x.kind, delta: 1 })}>+</button>
        </article>)}</div>
        <h2>Directional maneuver</h2>
        <p>Takes 100 powered-engine ticks. Approach affects attack bearing as well as defensive armor. Current commitment {p.maneuver} ticks.</p>
        <div className="operation-buttons">{(['bow', 'stern', 'port', 'starboard'] as const).map(bearing => <button key={bearing} onClick={() => send({ type: 'maneuver', bearing })}>Approach {bearing}</button>)}</div>
        <h2>Electronic warfare</h2>
        <div className="operation-buttons">{(['jam', 'disrupt', 'interfere', 'hack', 'hijack', 'intercept'] as const).map(mode => <button key={mode} onClick={() => send({ type: 'ew', mode })}>{mode}</button>)}</div>
        <h2>Doors and atmosphere</h2>
        <p>Exterior venting can endanger crew. Close doors, repair breaches, then restore oxygen. Locked doors block crew routing.</p>
        <div className="door-list">{inspected.doors.map(d => <div key={d.id}>
          <span>{inspected.rooms.find(r => r.id === d.a)?.name} ↔ {d.b ? inspected.rooms.find(r => r.id === d.b)?.name : <b className="warning">VACUUM</b>}</span>
          <button onClick={() => {
            if (!d.b && !d.open) setConfirm({ text: 'Open exterior vent? Crew and connected rooms may depressurize and suffocate. Close the door after extinguishing fire.', command: { type: 'door', ship: inspected.id, door: d.id } });
            else send({ type: 'door', ship: inspected.id, door: d.id });
          }}>{d.open ? 'Close' : 'Open'}</button>
          <button onClick={() => send({ type: 'door', ship: inspected.id, door: d.id, lock: !d.locked })}>{d.locked ? 'Unlock' : 'Lock'}</button>
        </div>)}</div>
        <h2>Accessible room selection</h2>
        <div className="operation-buttons">{s.ships.map(sh => sh.rooms.map((r, i) => <button key={`${sh.id}-${r.id}`} onClick={() => { roomClick(sh.id, r.id); open(null); }}>{sh.name}: {sh.id === 'player' || sh.doctrine === 'derelict' || enemyIntel ? `${r.name} · O₂ ${Math.round(r.oxygen * 100)}%` : `Unknown compartment ${i + 1}`}</button>))}</div>
      </>}
      {panel === 'journal' && <><div className="journal-objective"><span className="eyebrow">THE CARTOGRAPHER EXPEDITION</span><h2>{s.archive ? 'Return the final archive to Haven' : s.coordinates.length === 3 ? 'Reach Terminus and resolve the guardian' : 'Recover three independent archive coordinates'}</h2><p>Verdant: survey planet II or buy chart. Vesper: investigate Lost relay or buy chart. Nacre: search derelict compartments or buy chart. Required knowledge is permanent and cannot be sold.</p><div className="coordinate-row">{['s2', 's4', 's5'].map(id => <span key={id} className={s.coordinates.includes(id) ? 'obtained' : ''}>{s.coordinates.includes(id) ? '✓' : '◇'} {s.region.find(r => r.id === id)?.name}</span>)}</div></div>{summary}<h2>Market intelligence</h2><p>Snapshots are last-known, not live remote prices. Buy updated intelligence at a station.</p><div className="service-grid">{s.markets.filter(m => m.observed >= 0).map(m => <article key={m.id}><b>{s.region.flatMap(r => r.locations).find(l => l.id === m.id)?.name}</b><small>Observed at tick {m.observed} · Age {Math.floor((s.tick - m.observed) / 20)} sec · {m.event}</small><p>{Object.entries(m.prices).map(([key, v]) => `${key} ${v}`).join(' / ')}</p></article>)}</div><h2>Ship log</h2><ol className="journal-log">{s.events.slice().reverse().map(e => <li key={e.id}><time>T+{(e.tick / 20).toFixed(1)}s</time><span>{e.message}</span></li>)}</ol></>}
      {panel === 'settings' && <><div className="service-grid"><article><h2>Local persistence</h2><p>Combat timers, pending orders, crew, markets and seeded outcomes are preserved. Loads always open paused.</p><button onClick={() => api.persist()}>Save expedition <kbd>F</kbd></button><button onClick={() => { api.load(); setStarted(true); }}>Load current slot</button><button onClick={() => { api.load(true); setStarted(true); }}>Recover previous slot</button><button onClick={download}>Export JSON</button><label className="file-input">Import expedition<input type="file" accept=".json,application/json" onChange={async e => { const f = e.target.files?.[0]; if(!f) return; try { if(f.size > 1048576) throw new Error('Import exceeds 1 MiB.'); const next = decode(await f.text()); api.replace(next); setStarted(true); api.message = 'Imported validated run, paused.'; api.notify(); } catch(error) { api.message = `Import failed: ${error instanceof Error ? error.message : String(error)}. Live run retained.`; api.notify(); } }} /></label></article><article><h2>Presentation</h2><label><input type="checkbox" checked={muted} onChange={e => setMuted(e.target.checked)} /> Mute synthesized effects</label><label><input type="checkbox" checked={reducedMotion} onChange={e => setReducedMotion(e.target.checked)} /> Reduced motion</label><label>Effects volume<input type="range" min="0" max="0.4" step="0.01" defaultValue="0.15" onChange={e => audio.current.volume = Number(e.target.value)} /></label></article><article><h2>Run control</h2><p>Restart never carries credits, crew or archive progress into the new run.</p><button onClick={() => open('new')}>New expedition</button><button className="danger" onClick={() => setConfirm({ text: 'Abandon this expedition? This is a distinct, final ending and will be persisted. No funds carry over.', command: { type: 'abandon', confirm: true } })}>Abandon expedition</button></article><article><h2>Distress recovery</h2><p>Tow to Haven: 40 CR/debt. Deep-space beacon: 75 CR/debt and loose cargo lost; one use. Repairs are minimum only. Recall away crew first.</p><button onClick={() => setConfirm({ text: 'Confirm distress tow: serviced space 40 CR/debt; isolated space 75 and cargo forfeited, one beacon. Minimum fuel/navigation restoration, no free full repair.', command: { type: 'service', service: 'rescue' } })}>Request rescue</button></article></div></>}
      {panel === 'help' && <div className="manual"><h2>Command, don’t pilot</h2><p><kbd>SPACE</kbd> pause/resume · <kbd>1–3</kbd> crew · <kbd>Q / E</kbd> weapons · <kbd>M / J</kbd> navigation · <kbd>F</kbd> save · <kbd>ESC</kbd> cancel/close. Browser shortcuts are not intercepted.</p><h2>Combat</h2><p>Select a weapon, then an enemy room. Auto-fire must be checked before targeting. Laser strips shields. Ion suppresses power. Missile bypasses shields but uses ammo. Beam crosses rooms but needs shields down. Kinetic fires multiple shield-stripping rounds. Experimental disrupts atmosphere after a long charge. Power allocated to Weapons supplies guns in listed order.</p><h2>Damage control</h2><p>Select crew then a room; choose a task. They physically cross unlocked doors. Repair restores systems and seals breaches. Extinguish fights fires. Medbay heals only when powered. Open a vent to suppress fire, then close it and restore oxygen. Below 20% oxygen crew suffocate. Damaged systems lose usable power; allocations are not restored for free.</p><h2>Commerce and exploration</h2><p>Locations start as unknown signatures. Powered sensors, active scans, probes, investigation and bought charts resolve them. Survey grants and one-time data sales fund preparation. Buy where produced, sell where needed; cargo mass adds up to one jump fuel and reduces evasion. Contract freight is reserved and unsellable.</p><h2>Away teams</h2><p>Board a derelict from Crew, select a room and search. Logs/components can be collected once per room. Breaches and fire are real. Repair and restore power to survive. Recall traverses back over time. Emergency tether is costly and forfeits cargo. Hostile boarding needs a tether module and enemy shields down. Eliminate defenders and control the cockpit for five seconds to capture.</p><h2>Expedition route</h2><p>Recover three coordinates through surveys, charts or physical salvage. Buy fuel reserves before Terminus. Guardian passage can be fought, spoofed with EW and code, or negotiated using credits/knowledge copies. Recover the beacon archive; return to Haven and hand it in.</p><button onClick={() => { setTutorial(true); s.tutorial = 0; open(null); api.notify(); }}>Replay introduction</button></div>}
      {panel === 'help' && <div className="operation-buttons"><button onClick={() => startDrill('emergency')}>Damage-control practice drill</button><button onClick={() => startDrill('boarding')}>Away-team recall practice drill</button><small>Drills use real simulation, check outcomes and restore your expedition unchanged. They never overwrite its save.</small></div>}
      {panel === 'journal' && <><h2>Discovery records</h2><div className="service-grid">{s.discoveries.map(id => <article key={id}><b>{discoveryKind(s, id).toUpperCase()} SURVEY</b><p>{s.region.flatMap(r => r.locations).find(l => l.id === id)?.name ?? id}</p><small>{s.soldData.includes(id) ? 'SOLD · Knowledge retained' : `${SURVEY_VALUES[discoveryKind(s, id)]} CR exchange value`}</small></article>)}</div></>}
      <div className="dialog-footer" role="status">{api.message || 'Interaction pause active. Close this panel to return to the prior pause state.'}</div>
    </section></div>}
    {confirm && <div className="modal-backdrop confirm-backdrop"><section className="confirm-dialog frame" role="alertdialog" aria-modal="true" aria-label="Confirm command"><h2>Confirm captain’s order</h2><p>{confirm.text}</p><button className="primary" onClick={() => { if(confirm.command.type === 'abandon' && !confirm.command.confirm) newRun(); else { const result = send(confirm.command); if(result.ok && confirm.command.type === 'travel') { open(null); api.paused = false; api.notify(); } } setConfirm(null); }}>Confirm</button><button onClick={() => setConfirm(null)}>Cancel</button></section></div>}
    {s.phase !== 'expedition' && started && <div className="modal-backdrop"><section className="debrief frame" role="dialog" aria-modal="true" aria-label="Expedition debrief"><span className="eyebrow">EXPEDITION DEBRIEF</span><h1>{s.phase === 'victory' ? 'THE ARCHIVE IS HOME' : s.phase === 'defeat' ? 'SIGNAL LOST' : 'JOURNEY ENDED'}</h1><p>{s.phase === 'victory' ? 'Your choices carried the Wayfarer through the frontier. The Cartographer’s knowledge belongs to the living again.' : s.phase === 'defeat' ? 'The ship or crew could not be recovered. Every expedition leaves a story.' : 'The captain ordered an end to the expedition. Your discoveries remain in this run’s journal.'}</p>{summary}<button onClick={download}>Export expedition record</button><button className="primary" onClick={() => { open('new'); setStarted(false); }}>Plan another expedition</button></section></div>}
  </main>;
}
