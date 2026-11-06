import type { SavedExpedition, SaveLibrary } from '../game/saves';

export default function SavedGames({ library, error, disabled, load, newGame, importGame, importBackup, downloadBackup }: {
  library: SaveLibrary; error: string; disabled: boolean;
  load: (key: string) => void; newGame: () => void; importGame: (file: File) => Promise<void>;
  importBackup: (file: File) => Promise<void>; downloadBackup: () => void;
}) {
  const card = (entry: SavedExpedition) => {
    const state = entry.state, system = state.region.find(system => system.id === state.systemId);
    const location = system?.locations.find(location => location.id === state.locationId);
    const missions = state.contracts.filter(contract => contract.status === 'active').map(contract => contract.name);
    const exportGame = () => {
      const url = URL.createObjectURL(new Blob([entry.snapshot], { type: 'application/json' }));
      const link = document.createElement('a'); link.href = url; link.download = `starship-${entry.id}-${state.tick}.json`; link.click(); URL.revokeObjectURL(url);
    };
    return <article className="saved-expedition" key={entry.key} aria-label={`${entry.name}, seed ${state.seed}, tick ${state.tick}`} data-save-key={entry.key}>
      <div><h2>{entry.name}</h2><p>{missions.join(' / ') || 'Cartographer expedition'} · {({ expedition: 'In progress', victory: 'Archive returned', defeat: 'Expedition lost', abandoned: 'Journey ended' })[state.phase]}</p>
        <p>{system?.name} / {location?.name} · {state.difficulty}</p>
        <p>Seed {state.seed} · {(state.tick / 1200).toFixed(1)} min played · Archives {state.coordinates.length}/3 · {state.discoveries.length} discoveries · {state.contracts.filter(contract => contract.status === 'complete').length} contracts completed</p>
        <small>{entry.savedAt ? <>Saved <time dateTime={entry.savedAt}>{new Date(entry.savedAt).toLocaleString()}</time></> : entry.importedAt ? <>Imported <time dateTime={entry.importedAt}>{new Date(entry.importedAt).toLocaleString()}</time>; original saved time unknown.</> : 'Saved time not recorded in the original save.'}</small>
      </div>
      <div className="saved-actions"><button className="primary" disabled={disabled} onClick={() => load(entry.key)}>{entry.recovery ? 'Load recovery copy' : 'Load'}</button><button onClick={exportGame}>Download save file</button></div>
    </article>;
  };
  return <section className="saved-games">
    <p>Each expedition has its own save. New games and imports keep your other expeditions. Games load paused, with their crew and pending orders intact.</p>
    {disabled && <p className="warning">Return from the practice drill before loading or importing an expedition.</p>}
    {error && <p className="error-text" role="alert">{error}</p>}
    {library.issues.length > 0 && <p className="warning">Some saved data could not be read. Other saves are available below; open Backups and damaged-save recovery for earlier checkpoints and a backup download. No damaged files have been removed.</p>}
    {!library.saves.length && !error && <><p className="empty-saves">{library.issues.length ? 'No readable saved expeditions. Check recovery below or import a save file.' : 'No saved expeditions yet. Start a New Game or import a save file below.'}</p><button disabled={disabled} onClick={newGame}>New Game</button></>}
    <div className="saved-list">{library.saves.map(card)}</div>
    <label className="file-input">Import expedition<input type="file" disabled={disabled} accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await importGame(file); }} /></label>
    <small>Accepts an expedition save or recovery backup file. Imports keep your existing expeditions.</small>
    {(library.backups.length > 0 || library.issues.length > 0) && <details className="save-recovery"><summary>Backups and damaged-save recovery{library.backups.length ? ` (${library.backups.length})` : ''}</summary>
      <p>Earlier checkpoints are kept separately from your latest saves. They may belong to the same expedition or an earlier run. Loading one creates a separate expedition; it never replaces the latest save. Earlier versions kept only one game and one rolling backup, so older overwritten expeditions cannot be reconstructed here.</p>
      {library.issues.length > 0 && <p className="warning">Some saved data could not be read. Its original bytes are kept. Download a recovery backup before trying another browser or repairing a file. Readable expeditions can still be loaded.</p>}
      {!library.backups.length && <p>No readable backup checkpoints are available.</p>}
      <div className="saved-list">{library.backups.map(card)}</div>
      <button onClick={downloadBackup}>Download recovery backup</button>
      <label className="file-input">Import recovery backup<input type="file" disabled={disabled} accept=".json,application/json" onChange={async event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) await importBackup(file); }} /></label>
      <p>Recovery backup imports add readable copies without replacing expeditions. Keep the original file if any copies are unreadable.</p>
    </details>}
  </section>;
}
