import React from 'react';
import { useAppStore } from '@/lib/store';
import { useGetTournament, useListPasses } from '@workspace/api-client-react';
import { Card, Badge } from '@/components/ui/shared';
import { Trophy, Activity } from 'lucide-react';
import { formatRope, getRopeColour } from '@/lib/utils';

export default function Scoreboard() {
  const { activeTournamentId } = useAppStore();
  
  const { data: tournament } = useGetTournament(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: passes } = useListPasses(activeTournamentId || 0, { query: { enabled: !!activeTournamentId }, request: { refetchInterval: 5000 } as any });

  if (!activeTournamentId) {
    return <div className="p-8 text-center text-muted-foreground">No active tournament selected.</div>;
  }

  // Logic to calculate best 2 scores average
  const scoredPasses = passes?.filter(p => p.status !== 'pending' && p.buoys_scored !== null) || [];
  
  // Group by division, then by skier
  const divisions = [...new Set(scoredPasses.map(p => p.division || 'Open'))];
  
  const leaderboard = divisions.map(div => {
    const divPasses = scoredPasses.filter(p => (p.division || 'Open') === div);
    const skiers = [...new Set(divPasses.map(p => p.skier_id))];
    
    const skierStats = skiers.map(skierId => {
      const sp = divPasses.filter(p => p.skier_id === skierId);
      const name = sp[0]?.skier_name || 'Unknown';
      const bestRope = Math.min(...sp.map(p => p.rope_length)); // lower is better
      
      const scores = sp.map(p => p.buoys_scored || 0).sort((a, b) => b - a);
      const top2 = scores.slice(0, 2);
      const avg = top2.length > 0 ? top2.reduce((a, b) => a + b, 0) / top2.length : 0;
      
      return { id: skierId, name, avg, bestRope, passesCount: sp.length };
    });
    
    // Sort by avg descending, then best rope ascending
    skierStats.sort((a, b) => {
      if (b.avg !== a.avg) return b.avg - a.avg;
      return a.bestRope - b.bestRope;
    });
    
    return { division: div, skiers: skierStats };
  });

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col items-center justify-center text-center py-8 space-y-4">
        <Badge variant="success" className="px-4 py-1 text-sm animate-pulse shadow-lg shadow-emerald-500/20">
          <Activity className="w-4 h-4 mr-2 inline" /> LIVE
        </Badge>
        <h1 className="text-4xl sm:text-6xl font-display font-black tracking-tight">{tournament?.name}</h1>
        <p className="text-lg text-muted-foreground max-w-xl">Live Spectator Scoreboard • Updates every 5s</p>
      </div>

      {leaderboard.length === 0 ? (
        <Card className="p-12 text-center border-dashed">
          <Trophy className="w-16 h-16 mx-auto text-muted-foreground opacity-30 mb-4" />
          <h3 className="text-xl font-bold">No Scores Yet</h3>
          <p className="text-muted-foreground mt-2">Scores will appear here as passes are judged.</p>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          {leaderboard.map(({ division, skiers }) => (
            <Card key={division} className="overflow-hidden border-2 border-primary/10 shadow-xl">
              <div className="bg-primary px-6 py-4">
                <h2 className="text-xl font-black text-primary-foreground tracking-wide uppercase">{division}</h2>
              </div>
              <div className="divide-y divide-border">
                {skiers.map((skier, index) => (
                  <div key={skier.id} className="flex items-center p-4 sm:p-6 hover:bg-muted/50 transition-colors">
                    <div className="w-10 text-2xl font-black text-muted-foreground/50 text-center">
                      {index + 1}
                    </div>
                    <div className="flex-1 px-4">
                      <p className="font-bold text-lg leading-none mb-1">{skier.name}</p>
                      <p className="text-xs text-muted-foreground uppercase font-semibold tracking-wider flex items-center gap-2 flex-wrap">
                        {skier.passesCount} Passes • Best Rope:
                        {(() => {
                          const c = getRopeColour(skier.bestRope);
                          return (
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold normal-case tracking-normal"
                              style={{ background: c.bg, color: c.text, borderColor: c.border }}
                            >
                              {formatRope(skier.bestRope)}
                            </span>
                          );
                        })()}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="inline-flex flex-col items-center justify-center bg-primary/10 text-primary w-16 h-16 rounded-2xl border border-primary/20">
                        <span className="text-2xl font-black leading-none">{skier.avg.toFixed(1)}</span>
                        <span className="text-[9px] uppercase font-bold tracking-wider mt-1 opacity-70">AVG</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
