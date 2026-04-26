import React from 'react';
import { Link, useLocation } from 'wouter';
import { cn } from '@/lib/utils';
import { Trophy, Video, FileCheck, Activity, Settings, LogOut, Waves, HelpCircle, Users } from 'lucide-react';
import { useAppStore } from '@/lib/store';
import { useGetTournament } from '@workspace/api-client-react';
import { TunnelStatusIndicator } from '@/components/TunnelStatusIndicator';

export function AppLayout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();
  const { activeTournamentId, logout } = useAppStore();
  const liteMode = localStorage.getItem('slalom_lite_mode') === 'true';
  
  const { data: tournament } = useGetTournament(activeTournamentId || 0, {
    query: { enabled: !!activeTournamentId }
  });

  const navItems = [
    { href: '/', label: 'Home', icon: Trophy },
    { href: '/recording', label: 'Record', icon: Video, requiresTourney: true },
    // Judge nav hidden in lite mode — scores are entered on the Recording screen
    ...(!liteMode ? [{ href: '/judging', label: 'Judge', icon: FileCheck, requiresTourney: true }] : []),
    { href: '/scoreboard', label: 'Live', icon: Activity, requiresTourney: true },
    { href: '/officials', label: 'Officials', icon: Users },
    { href: '/admin', label: 'Admin', icon: Settings },
    { href: '/help', label: 'Help', icon: HelpCircle },
  ];

  return (
    <div className="min-h-screen bg-background pb-20 md:pb-0 md:pl-64 flex flex-col font-sans">
      {/* Desktop Sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden md:flex w-64 flex-col bg-card border-r shadow-xl shadow-black/5 z-40">
        <div className="p-6 flex items-center gap-3 border-b">
          <div className="w-10 h-10 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
            <Waves className="w-6 h-6 text-primary" />
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-xl tracking-tight text-primary">SlalomStream</h1>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground font-semibold">Pro Scoring</p>
          </div>
          <TunnelStatusIndicator />
        </div>
        
        {tournament && (
          <div className="px-6 py-4 bg-primary/5 border-b border-primary/10">
            <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Active Event</p>
            <p className="font-bold text-sm truncate">{tournament.name}</p>
          </div>
        )}

        <nav className="flex-1 px-4 py-6 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            if (item.requiresTourney && !activeTournamentId) return null;
            const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
            
            return (
              <Link 
                key={item.href} 
                href={item.href}
                className={cn(
                  "flex items-center gap-3 px-4 py-3 rounded-xl font-semibold transition-all duration-200 group",
                  isActive 
                    ? "bg-primary text-primary-foreground shadow-md shadow-primary/20" 
                    : "text-muted-foreground hover:bg-secondary hover:text-foreground"
                )}
              >
                <item.icon className={cn("w-5 h-5", isActive ? "text-primary-foreground" : "group-hover:text-primary transition-colors")} />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="p-4 border-t">
          <button 
            onClick={() => {
              logout();
              window.location.href = '/';
            }}
            className="flex items-center gap-3 px-4 py-3 w-full rounded-xl font-semibold text-muted-foreground hover:bg-destructive/10 hover:text-destructive transition-colors"
          >
            <LogOut className="w-5 h-5" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 w-full max-w-7xl mx-auto p-4 sm:p-6 md:p-8 animate-in fade-in duration-500">
        {/* Mobile Header */}
        <header className="md:hidden flex items-center justify-between mb-6 pb-4 border-b">
          <div className="flex items-center gap-2">
            <Waves className="w-6 h-6 text-primary" />
            <h1 className="font-display font-bold text-xl tracking-tight text-foreground">SlalomStream</h1>
          </div>
          <div className="flex items-center gap-2">
            <TunnelStatusIndicator />
            {tournament && (
              <div className="bg-primary/10 text-primary px-3 py-1 rounded-full text-xs font-bold max-w-[120px] truncate">
                {tournament.name}
              </div>
            )}
          </div>
        </header>
        
        {children}
      </main>

      {/* Mobile Bottom Nav */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 bg-card/80 backdrop-blur-xl border-t flex justify-around p-2 pb-safe z-50 shadow-[0_-10px_40px_-10px_rgba(0,0,0,0.1)]">
        {navItems.map((item) => {
          if (item.requiresTourney && !activeTournamentId) return null;
          const isActive = location === item.href || (item.href !== '/' && location.startsWith(item.href));
          
          return (
            <Link 
              key={item.href} 
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center w-16 h-14 rounded-xl transition-all",
                isActive ? "text-primary" : "text-muted-foreground hover:bg-secondary/50"
              )}
            >
              <item.icon className={cn("w-5 h-5 mb-1 transition-transform", isActive && "scale-110")} />
              <span className="text-[10px] font-semibold">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
