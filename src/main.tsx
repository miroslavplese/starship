import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './ui/App';
import './styles/game.css';

class Recovery extends React.Component<{ children: React.ReactNode }, { error: string | null }> {
  state: { error: string | null } = { error: null };
  static getDerivedStateFromError(error: Error) { return { error: error.message }; }
  render() {
    if (this.state.error) return <main className="recovery"><h1>Command link interrupted</h1><p>{this.state.error}</p><p>Your last saved expedition remains in this browser.</p><button onClick={() => location.reload()}>Reload command deck</button><button onClick={() => { const blob = new Blob([localStorage.getItem('starship.save.v1') ?? 'No saved run'], { type: 'application/json' }); const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'starship-recovery.json'; a.click(); URL.revokeObjectURL(a.href); }}>Export saved run</button></main>;
    return this.props.children;
  }
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><Recovery><App /></Recovery></React.StrictMode>);
