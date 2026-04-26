import { useEffect, useState } from 'react';
import { isTauri, tauriListen } from '@/lib/tauri';
import { cn } from '@/lib/utils';
import { Wifi, WifiOff } from 'lucide-react';

type TunnelState = 'active' | 'dropped' | 'hidden';

interface AppSettings {
  connection_mode: string;
  public_url: string | null;
  [key: string]: unknown;
}

export function TunnelStatusIndicator() {
  const [state, setState] = useState<TunnelState>('hidden');
  const [tunnelUrl, setTunnelUrl] = useState<string | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    if (!isTauri) return;

    let active = true;
    const unsubs: Array<() => void> = [];

    // Hydrate from persisted settings so the indicator is correct on mount
    // (Tauri events fire only when state changes, not on subscribe)
    fetch('/api/settings')
      .then(r => r.ok ? r.json() as Promise<AppSettings> : null)
      .then(settings => {
        if (!active || !settings) return;
        if (settings.connection_mode === 'tunnel' && settings.public_url) {
          setTunnelUrl(settings.public_url);
          setState('active');
        }
      })
      .catch(() => {});

    tauriListen<{ url: string }>('tunnel-url', (payload) => {
      if (!active) return;
      setTunnelUrl(payload.url);
      setState('active');
    }).then(fn => unsubs.push(fn));

    tauriListen<{ reconnecting?: boolean }>('tunnel-stopped', (payload) => {
      if (!active) return;
      setTunnelUrl(null);
      if (payload?.reconnecting) {
        setState('dropped');
      } else {
        setState('hidden');
      }
    }).then(fn => unsubs.push(fn));

    return () => {
      active = false;
      unsubs.forEach(fn => fn());
    };
  }, []);

  if (!isTauri || state === 'hidden') return null;

  return (
    <div
      className="relative flex items-center"
      onMouseEnter={() => setShowTooltip(true)}
      onMouseLeave={() => setShowTooltip(false)}
    >
      <div
        className={cn(
          'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold cursor-default select-none transition-colors',
          state === 'active'
            ? 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400'
            : 'bg-red-500/15 text-red-600 dark:text-red-400',
        )}
      >
        <span className="relative flex h-2 w-2">
          {state === 'active' && (
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-500 opacity-60" />
          )}
          <span
            className={cn(
              'relative inline-flex rounded-full h-2 w-2',
              state === 'active' ? 'bg-emerald-500' : 'bg-red-500',
            )}
          />
        </span>
        {state === 'active' ? (
          <Wifi className="w-3 h-3" />
        ) : (
          <WifiOff className="w-3 h-3" />
        )}
        <span className="hidden sm:inline">
          {state === 'active' ? 'Online' : 'Tunnel dropped'}
        </span>
      </div>

      {showTooltip && (
        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 z-50 pointer-events-none">
          <div className="bg-popover text-popover-foreground text-xs rounded-lg shadow-lg border px-3 py-2 whitespace-nowrap max-w-xs">
            {state === 'active' && tunnelUrl ? (
              <>
                <p className="font-semibold text-emerald-600 dark:text-emerald-400 mb-0.5">Tunnel active</p>
                <p className="font-mono text-[11px] opacity-80 truncate">{tunnelUrl}</p>
              </>
            ) : (
              <>
                <p className="font-semibold text-red-600 dark:text-red-400 mb-0.5">Tunnel dropped</p>
                <p className="opacity-70">Re-toggle in Admin &rsaquo; Network to reconnect.</p>
              </>
            )}
          </div>
          <div className="w-2 h-2 bg-popover border-b border-r rotate-45 mx-auto -mt-1 shadow-sm" />
        </div>
      )}
    </div>
  );
}
