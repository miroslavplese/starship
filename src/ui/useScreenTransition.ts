import { useEffect, useRef, useState } from 'react';

export function useScreenTransition(reducedMotion: boolean) {
  const [phase, setPhase] = useState<'idle' | 'out' | 'in'>('idle');
  const locked = useRef(false);
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);
  const pendingFocus = useRef<{ opener: HTMLElement | null } | null>(null);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  useEffect(() => {
    if (phase !== 'idle' || locked.current || !pendingFocus.current) return;
    const { opener } = pendingFocus.current;
    pendingFocus.current = null;
    const dialogs = document.querySelectorAll<HTMLElement>('[role="dialog"], [role="alertdialog"]');
    const dialog = dialogs.item(dialogs.length - 1);
    const target = dialog?.querySelector<HTMLElement>('button:not(:disabled), input, select')
      ?? document.querySelector<HTMLElement>('.room-inspector .task-buttons button')
      ?? (opener?.isConnected ? opener : document.querySelector<HTMLElement>('.pause-button'));
    target?.focus();
  });
  const transition = (change: () => void, { fade = true }: { fade?: boolean } = {}) => {
    if (locked.current) return;
    pendingFocus.current = { opener: document.activeElement instanceof HTMLElement ? document.activeElement : null };
    if (!fade) { change(); return; }
    locked.current = true;
    setPhase('out');
    const duration = reducedMotion ? 0 : 160;
    timers.current = [setTimeout(() => {
      change();
      setPhase('in');
      timers.current.push(setTimeout(() => {
        locked.current = false;
        setPhase('idle');
      }, duration));
    }, duration)];
  };
  return { phase, transition, locked };
}
