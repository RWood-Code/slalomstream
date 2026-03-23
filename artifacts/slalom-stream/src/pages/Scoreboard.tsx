import React from 'react';
import { useAppStore } from '@/lib/store';
import { useGetTournament, useListPasses } from '@workspace/api-client-react';
import { Card, Badge, Button } from '@/components/ui/shared';
import { Trophy, Activity, Tv, Printer, Download } from 'lucide-react';
import { formatRope, getRopeColour } from '@/lib/utils';

export default function Scoreboard() {
  const { activeTournamentId } = useAppStore();

  const { data: tournament } = useGetTournament(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: passes } = useListPasses(activeTournamentId || 0, {
    query: { enabled: !!activeTournamentId, refetchInterval: 5000 },
  });

  if (!activeTournamentId) {
    return <div className="p-8 text-center text-muted-foreground">No active tournament selected.</div>;
  }

  const scoredPasses = passes?.filter(p => p.status !== 'pending' && p.buoys_scored !== null) || [];
  const divisions = [...new Set(scoredPasses.map(p => p.division || 'Open'))];

  const leaderboard = divisions.map(div => {
    const divPasses = scoredPasses.filter(p => (p.division || 'Open') === div);
    const skiers = [...new Set(divPasses.map(p => p.skier_id))];

    const skierStats = skiers.map(skierId => {
      const sp = divPasses.filter(p => p.skier_id === skierId);
      const name = sp[0]?.skier_name || 'Unknown';
      const bestRope = Math.min(...sp.map(p => p.rope_length));
      const scores = sp.map(p => p.buoys_scored || 0).sort((a, b) => b - a);
      const top2 = scores.slice(0, 2);
      const avg = top2.length > 0 ? top2.reduce((a, b) => a + b, 0) / top2.length : 0;
      return { id: skierId, name, avg, bestRope, passesCount: sp.length, scores };
    });

    skierStats.sort((a, b) => {
      if (b.avg !== a.avg) return b.avg - a.avg;
      return a.bestRope - b.bestRope;
    });

    return { division: div, skiers: skierStats };
  });

  const openTvMode = () => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    window.open(
      `${window.location.origin}${base}/live?t=${activeTournamentId}`,
      'slalom-tv',
      'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no'
    );
  };

  const exportCsv = () => {
    const rows: string[] = ['Division,Rank,Skier,Avg Score,Best Rope,Passes'];
    leaderboard.forEach(({ division, skiers }) => {
      skiers.forEach((s, i) => {
        rows.push([division, i + 1, `"${s.name}"`, s.avg.toFixed(2), `${s.bestRope}m`, s.passesCount].join(','));
      });
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${tournament?.name ?? 'results'}-standings.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  return (
    <>
      <div className="space-y-6 pb-12">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
            <Badge variant="success" className="px-3 py-1 text-sm animate-pulse shadow-lg shadow-emerald-500/20 shrink-0">
              <Activity className="w-4 h-4 mr-1.5 inline" /> LIVE
            </Badge>
            <div>
              <h1 className="text-2xl sm:text-3xl font-display font-black tracking-tight leading-none">{tournament?.name}</h1>
              <p className="text-sm text-muted-foreground mt-0.5">Live Standings · updates every 5s</p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap shrink-0">
            <Button variant="outline" size="sm" onClick={openTvMode} className="gap-2">
              <Tv className="w-4 h-4" /> TV Mode
            </Button>
            <Button variant="outline" size="sm" onClick={() => window.print()} className="gap-2">
              <Printer className="w-4 h-4" /> Print
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
        </div>

        {/* Print-only header */}
        <div className="hidden print:block text-center mb-4">
          <h1 className="text-3xl font-black">{tournament?.name}</h1>
          <p className="text-sm text-gray-500 mt-1">Results printed {new Date().toLocaleString()}</p>
        </div>

        {leaderboard.length === 0 ? (
          <Card className="p-12 text-center border-dashed">
            <Trophy className="w-16 h-16 mx-auto text-muted-foreground opacity-30 mb-4" />
            <h3 className="text-xl font-bold">No Scores Yet</h3>
            <p className="text-muted-foreground mt-2">Scores will appear here as passes are judged.</p>
          </Card>
        ) : (
          <div className="grid lg:grid-cols-2 gap-6">
            {leaderboard.map(({ division, skiers }) => (
              <Card key={division} className="overflow-hidden border-2 border-primary/10 shadow-xl print:shadow-none print:border print:break-inside-avoid">
                <div className="bg-primary px-6 py-3">
                  <h2 className="text-lg font-black text-primary-foreground tracking-wide uppercase">{division}</h2>
                </div>
                <div className="divide-y divide-border">
                  {skiers.map((skier, index) => {
                    const rc = getRopeColour(skier.bestRope);
                    const medal = index === 0 ? '🥇' : index === 1 ? '🥈' : index === 2 ? '🥉' : null;
                    return (
                      <div key={skier.id} className="flex items-center px-4 py-3 hover:bg-muted/50 transition-colors">
                        <div className="w-8 text-center font-black text-xl text-muted-foreground/50 shrink-0">
                          {medal ?? index + 1}
                        </div>
                        <div className="flex-1 px-3 min-w-0">
                          <p className="font-bold text-base leading-tight truncate">{skier.name}</p>
                          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                            <span
                              className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold"
                              style={{ background: rc.bg, color: rc.text, borderColor: rc.border }}
                            >
                              {formatRope(skier.bestRope)}
                            </span>
                            <span className="text-[11px] text-muted-foreground font-semibold">
                              {skier.passesCount} pass{skier.passesCount !== 1 ? 'es' : ''}
                            </span>
                            {skier.scores.length > 1 && (
                              <span className="text-[10px] text-muted-foreground">
                                ({skier.scores.slice(0, 3).join(', ')})
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <div className="text-2xl font-display font-black text-primary leading-none">
                            {skier.avg % 1 === 0 ? skier.avg : skier.avg.toFixed(1)}
                          </div>
                          <div className="text-[9px] uppercase font-bold tracking-wider text-muted-foreground mt-0.5">avg</div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      <style>{`
        @media print {
          nav, header, [data-print-hidden] { display: none !important; }
          .print\\:hidden { display: none !important; }
          .print\\:block { display: block !important; }
          .print\\:break-inside-avoid { break-inside: avoid; }
          .print\\:shadow-none { box-shadow: none !important; }
          .print\\:border { border: 1px solid #e5e7eb !important; }
        }
      `}</style>
    </>
  );
}
