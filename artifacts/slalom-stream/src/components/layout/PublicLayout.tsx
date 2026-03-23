import React from 'react';
import { Link } from 'wouter';
import { Waves, Tv } from 'lucide-react';
import { useAppStore } from '@/lib/store';

/**
 * Minimal layout for public-facing pages (Scoreboard, Live TV).
 * Shows the SlalomStream brand bar but NO navigation links to operator pages.
 * Safe to share the URL with spectators.
 */
export function PublicLayout({ children }: { children: React.ReactNode }) {
  const { activeTournamentId } = useAppStore();

  const openTv = () => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    const q = activeTournamentId ? `?t=${activeTournamentId}` : '';
    window.open(
      `${window.location.origin}${base}/live${q}`,
      'slalom-tv',
      'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no'
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col font-sans">
      {/* Slim public header — no links to operator pages */}
      <header className="sticky top-0 z-40 bg-card/90 backdrop-blur-md border-b shadow-sm print:hidden">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-12 flex items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Waves className="w-5 h-5 text-primary" />
            <span className="font-display font-bold text-base tracking-tight text-primary">SlalomStream</span>
            <span className="hidden sm:inline text-xs text-muted-foreground font-semibold">· Live Results</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={openTv}
              className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-primary transition-colors px-2 py-1 rounded-lg hover:bg-primary/5"
            >
              <Tv className="w-3.5 h-3.5" /> TV Mode
            </button>
            {/* Staff link — low-contrast; staff know it's there, spectators won't notice */}
            <Link
              href="/"
              className="text-[10px] font-semibold text-muted-foreground/40 hover:text-muted-foreground transition-colors"
            >
              Staff
            </Link>
          </div>
        </div>
      </header>

      <main className="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 py-6 animate-in fade-in duration-500">
        {children}
      </main>

      <footer className="text-center text-xs text-muted-foreground/50 py-4 print:hidden">
        SlalomStream · NZTWSA Professional Slalom Scoring
      </footer>
    </div>
  );
}
