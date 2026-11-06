import type { GameState } from '../sim/types';

export default function NavigationMap({ state, regional, selected, onSelect }: {
  state: GameState;
  regional: boolean;
  selected: string | null;
  onSelect: (id: string) => void;
}) {
  const current = state.region.find(system => system.id === state.systemId)!;
  const systems = state.region.filter(system => system.known);
  const locations = current.locations.filter(location => location.known > 0);
  const positions = new Map(state.region.map((system, index) => [system.id, {
    x: 90 + index * 110, y: 170 + Math.sin(index * 1.7) * 92,
  }]));
  const points = regional ? systems.map(system => ({ id: system.id, name: system.name, kind: 'star', current: system.id === current.id, ...positions.get(system.id)! }))
    : locations.map((location, index) => {
      const angle = index * 2.4 - 1.1, radius = 90 + index * 14;
      return { id: location.id, name: location.known < 2 ? 'Unknown signature' : location.name, kind: location.known < 2 ? 'unknown' : location.kind,
        current: location.id === state.locationId, x: 480 + Math.cos(angle) * radius * 1.8, y: 175 + Math.sin(angle) * radius * .65 };
    });
  return <section className="navigation-visual" aria-label={regional ? 'Interstellar route map' : 'Orbital system map'}>
    <svg viewBox="0 0 960 350" role="group" aria-label={regional ? 'Known systems and jump routes' : `${current.name} local orbits and contacts`}>
      <defs><radialGradient id="map-sun"><stop stopColor="#fff7cf" /><stop offset=".45" stopColor="#efb967" /><stop offset="1" stopColor="#b6591e" /></radialGradient></defs>
      {regional ? systems.flatMap(system => system.routes.filter(id => id > system.id && systems.some(other => other.id === id)).map(id => {
        const from = positions.get(system.id)!, to = positions.get(id)!;
        return <line key={`${system.id}-${id}`} x1={from.x} y1={from.y} x2={to.x} y2={to.y} className={system.id === current.id || id === current.id ? 'route available' : 'route'} />;
      })) : <g aria-hidden="true">
        {locations.map((location, index) => <ellipse key={location.id} cx="480" cy="175" rx={(90 + index * 14) * 1.8} ry={(90 + index * 14) * .65} className="orbit" />)}
        <circle cx="480" cy="175" r="24" fill="url(#map-sun)" /><text x="480" y="180" textAnchor="middle">{current.name}</text>
      </g>}
      {points.map(point => <g key={point.id} role="button" tabIndex={0} aria-label={`Inspect ${point.name}`}
        aria-pressed={selected === point.id} className={`map-point ${point.kind} ${point.current ? 'here' : ''} ${selected === point.id ? 'inspected' : ''}`}
        onClick={() => onSelect(point.id)} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); event.stopPropagation(); onSelect(point.id); } }}>
        <circle cx={point.x} cy={point.y} r="23" fill="transparent" />
        <circle cx={point.x} cy={point.y} r={regional ? 12 : point.kind === 'planet' ? 9 : 6} className="map-body" />
        {point.current && <circle cx={point.x} cy={point.y} r="18" className="position-ring" />}
        <text x={point.x} y={point.y + (!regional && point.y > 175 ? 28 : -27)} textAnchor="middle">{point.name}</text>
        {point.current && <text x={point.x} y={point.y + (!regional && point.y > 175 ? 44 : 34)} textAnchor="middle" className="map-here">YOU ARE HERE</text>}
      </g>)}
    </svg>
    <p className="muted">Select a contact to inspect its course below. {regional ? 'Lines show actual known jump routes; only direct routes can be plotted.' : 'Unresolved contacts remain unidentified until scanned.'}</p>
  </section>;
}
