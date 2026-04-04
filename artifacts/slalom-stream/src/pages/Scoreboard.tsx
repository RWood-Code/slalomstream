import React from 'react';
import { useAppStore } from '@/lib/store';
import { useGetTournament, useListPasses } from '@workspace/api-client-react';
import { Card, Badge, Button } from '@/components/ui/shared';
import { Trophy, Activity, Tv, Printer, Download } from 'lucide-react';
import { formatRope, getRopeColour } from '@/lib/utils';

// ── Class labels for print header ──────────────────────────────────────────────
const CLASS_LABELS: Record<string, string> = {
  G: 'Grade G',
  L: 'Grade L',
  R: 'Grade R (Regional)',
  E: 'Grade E (Elite)',
};

interface RoundResult {
  score: number;
  rope: number;
  speed: number | null;
}

interface SkierStat {
  id: number;
  name: string;
  avg: number;
  bestRope: number;
  passesCount: number;
  /** round_number → result */
  rounds: Record<number, RoundResult>;
}

export default function Scoreboard() {
  const { activeTournamentId } = useAppStore();

  const { data: tournament } = useGetTournament(activeTournamentId || 0, {
    query: { enabled: !!activeTournamentId },
  });
  const { data: passes } = useListPasses(activeTournamentId || 0, {
    query: { enabled: !!activeTournamentId, refetchInterval: 5000 },
  });

  if (!activeTournamentId) {
    return <div className="p-8 text-center text-muted-foreground">No active tournament selected.</div>;
  }

  const scoredPasses = passes?.filter(p => p.status !== 'pending' && p.buoys_scored !== null) || [];
  const divisions = [...new Set(scoredPasses.map(p => p.division || 'Open'))].sort();

  // Determine the set of round numbers present across all scored passes
  const allRoundNumbers = [...new Set(scoredPasses.map(p => p.round_number))].sort((a, b) => a - b);

  const leaderboard = divisions.map(div => {
    const divPasses = scoredPasses.filter(p => (p.division || 'Open') === div);
    const skierIds = [...new Set(divPasses.map(p => p.skier_id))];

    const skierStats: SkierStat[] = skierIds.map(skierId => {
      const sp = divPasses.filter(p => p.skier_id === skierId);
      const name = sp[0]?.skier_name || 'Unknown';
      const bestRope = Math.min(...sp.map(p => p.rope_length));

      // Build per-round map (best score per round if somehow duplicated)
      const rounds: Record<number, RoundResult> = {};
      for (const p of sp) {
        const rn = p.round_number;
        const s = p.buoys_scored ?? 0;
        if (!rounds[rn] || s > rounds[rn].score) {
          rounds[rn] = { score: s, rope: p.rope_length, speed: p.speed_kph ?? null };
        }
      }

      const scores = Object.values(rounds).map(r => r.score).sort((a, b) => b - a);
      const top2 = scores.slice(0, 2);
      const avg = top2.length > 0 ? top2.reduce((a, b) => a + b, 0) / top2.length : 0;

      return { id: skierId, name, avg, bestRope, passesCount: sp.length, rounds };
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
    const roundCols = allRoundNumbers.map(r => `R${r}`).join(',');
    const rows: string[] = [`Division,Rank,Skier,${roundCols},Avg Score,Best Rope,Passes`];
    leaderboard.forEach(({ division, skiers }) => {
      skiers.forEach((s, i) => {
        const roundVals = allRoundNumbers.map(r => s.rounds[r]?.score?.toFixed(2) ?? '').join(',');
        rows.push([division, i + 1, `"${s.name}"`, roundVals, s.avg.toFixed(2), `${s.bestRope}m`, s.passesCount].join(','));
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

  const eventDate = tournament?.created_at
    ? new Date(tournament.created_at).toLocaleDateString('en-NZ', { day: 'numeric', month: 'long', year: 'numeric' })
    : '';
  const classLabel = CLASS_LABELS[tournament?.tournament_class ?? ''] ?? tournament?.tournament_class ?? '';
  const printTimestamp = new Date().toLocaleString('en-NZ', {
    day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });

  return (
    <>
      {/* ── PRINT-ONLY RESULTS SHEET ─────────────────────────────────────────── */}
      {/* Hidden on screen; shown in print output */}
      <div id="print-results" className="hidden print:block font-sans text-black bg-white">

        {/* Tournament header */}
        <div className="text-center border-b-2 border-black pb-3 mb-4">
          <div className="text-xs font-bold uppercase tracking-widest text-gray-500 mb-1">
            New Zealand Waterski &amp; Wakeboard Association
          </div>
          <h1 className="text-2xl font-black uppercase tracking-tight">{tournament?.name}</h1>
          <div className="flex justify-center gap-6 mt-1 text-sm text-gray-700">
            {eventDate && <span>{eventDate}</span>}
            {tournament?.region && <span>{tournament.region}</span>}
            {classLabel && <span className="font-semibold">{classLabel}</span>}
            {tournament?.judge_count && (
              <span>{tournament.judge_count}-Judge Panel</span>
            )}
          </div>
        </div>

        {/* Per-division result tables */}
        {leaderboard.length === 0 ? (
          <p className="text-center text-gray-400 py-8">No scored passes recorded.</p>
        ) : (
          leaderboard.map(({ division, skiers }) => (
            <div key={division} className="mb-6 break-inside-avoid">
              <div className="bg-gray-900 text-white px-3 py-1.5 text-sm font-black uppercase tracking-widest mb-0">
                {division}
              </div>
              <table className="w-full text-sm border-collapse border border-gray-300">
                <thead>
                  <tr className="bg-gray-100 text-xs font-bold uppercase tracking-wide">
                    <th className="border border-gray-300 px-2 py-1.5 text-left w-8">Rank</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-left">Skier</th>
                    {allRoundNumbers.map(r => (
                      <th key={r} className="border border-gray-300 px-2 py-1.5 text-center">R{r}</th>
                    ))}
                    <th className="border border-gray-300 px-2 py-1.5 text-center">Avg</th>
                    <th className="border border-gray-300 px-2 py-1.5 text-center">Best Rope</th>
                  </tr>
                </thead>
                <tbody>
                  {skiers.map((skier, idx) => (
                    <tr key={skier.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50'}>
                      <td className="border border-gray-300 px-2 py-1.5 text-center font-bold text-gray-500">
                        {idx + 1}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 font-semibold">{skier.name}</td>
                      {allRoundNumbers.map(r => {
                        const res = skier.rounds[r];
                        return (
                          <td key={r} className="border border-gray-300 px-2 py-1.5 text-center">
                            {res ? (
                              <span>
                                {res.score % 1 === 0 ? res.score : res.score.toFixed(1)}
                                <span className="text-gray-400 text-[10px] ml-1">@{res.rope}m</span>
                              </span>
                            ) : (
                              <span className="text-gray-300">—</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="border border-gray-300 px-2 py-1.5 text-center font-black">
                        {skier.avg % 1 === 0 ? skier.avg : skier.avg.toFixed(1)}
                      </td>
                      <td className="border border-gray-300 px-2 py-1.5 text-center text-gray-600">
                        {skier.bestRope}m
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ))
        )}

        {/* Print footer */}
        <div className="border-t border-gray-300 pt-3 mt-6 flex justify-between items-center text-xs text-gray-500">
          <span>Results generated by SlalomStream · NZTWSA</span>
          <span>Printed {printTimestamp}</span>
        </div>

        {/* Signature block */}
        <div className="mt-8 flex gap-16 text-sm">
          <div>
            <div className="border-b border-black w-48 mb-1">&nbsp;</div>
            <div className="text-xs text-gray-600">Chief Judge signature</div>
          </div>
          <div>
            <div className="border-b border-black w-48 mb-1">&nbsp;</div>
            <div className="text-xs text-gray-600">Tournament Director signature</div>
          </div>
        </div>
      </div>

      {/* ── SCREEN SCOREBOARD ─────────────────────────────────────────────────── */}
      <div className="space-y-6 pb-12 print:hidden">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
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
              <Printer className="w-4 h-4" /> Print Results
            </Button>
            <Button variant="outline" size="sm" onClick={exportCsv} className="gap-2">
              <Download className="w-4 h-4" /> Export CSV
            </Button>
          </div>
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
              <Card key={division} className="overflow-hidden border-2 border-primary/10 shadow-xl">
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
                            {/* Per-round scores inline */}
                            {allRoundNumbers.map(r => {
                              const res = skier.rounds[r];
                              if (!res) return null;
                              return (
                                <span key={r} className="text-[10px] text-muted-foreground font-medium">
                                  R{r}: {res.score % 1 === 0 ? res.score : res.score.toFixed(1)}
                                </span>
                              );
                            })}
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
        @page {
          size: A4 portrait;
          margin: 15mm 12mm;
        }
        @media print {
          /* Reset everything */
          * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }

          /* Hide screen-only elements */
          body > *:not(#app) { display: none !important; }
          nav, header, aside, footer,
          [data-print-hidden],
          .print\\:hidden { display: none !important; }

          /* Show print-only elements */
          .print\\:block { display: block !important; }

          /* Remove shadows and backgrounds from card wrapper */
          #app, .min-h-screen, main, [class*="max-w-"] {
            padding: 0 !important;
            margin: 0 !important;
            background: white !important;
            box-shadow: none !important;
          }

          /* Ensure print results sheet fills page */
          #print-results {
            display: block !important;
            width: 100%;
            color: black;
            background: white;
          }

          /* Page-break helpers */
          .break-inside-avoid { break-inside: avoid; }

          /* Table borders visible in print */
          table, th, td { border-color: #9ca3af !important; }

          /* Heading backgrounds need forced color */
          .bg-gray-900 { background-color: #111827 !important; color: white !important; }
          .bg-gray-100 { background-color: #f3f4f6 !important; }
          .bg-gray-50  { background-color: #f9fafb !important; }
        }
      `}</style>
    </>
  );
}
