import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { authedFetch } from '@/lib/authed-fetch';
import {
  useGetTournament, useListPasses, useListSkiers,
  useSubmitJudgeScore, useVerifyJudgePin, useCreatePass, useUpdatePass
} from '@workspace/api-client-react';
import { Card, Button, Input, Select, Badge } from '@/components/ui/shared';
import {
  ShieldAlert, CheckCircle2, RefreshCw, Play, Square,
  ChevronDown, ChevronUp, Edit2, Clock, AlertCircle, Pencil, X, Lock, Unlock,
} from 'lucide-react';
import {
  VALID_IWWF_SCORES, getRopeColour, formatRope, ROPE_LENGTHS, SPEEDS, formatSpeed,
  getJudgingPanel, getScoringRoles, collateScores, formatScoreDisplay, suggestNextRope,
} from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// Read ?role= from the URL (static role QR codes)
function usePreselectedRole(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('role');
}

// Read ?t= tournament ID from the URL (embedded in judge station QR codes)
function useUrlTournamentId(): number | null {
  if (typeof window === 'undefined') return null;
  const raw = new URLSearchParams(window.location.search).get('t');
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isNaN(n) ? null : n;
}

// ─── Judge A / Chief: Start Pass Panel ────────────────────────────────────────
function StartPassPanel({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: skiers } = useListSkiers(tournamentId, { query: { enabled: true } });
  const createMutation = useCreatePass({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
        toast({ title: 'Pass started' });
        setSkierId('');
      }
    }
  });

  const { data: passes } = useListPasses(tournamentId, { query: { enabled: !!tournamentId } });

  const [skierId, setSkierId] = useState('');
  const [rope, setRope] = useState('18.25');
  const [speed, setSpeed] = useState('55');
  const [round, setRound] = useState('1');

  // Rope pre-fill: suggest next rope based on skier's last completed pass
  useEffect(() => {
    if (!skierId || !passes) return;
    const skierPasses = (passes as any[])
      .filter(p => String(p.skier_id) === skierId && p.status !== 'pending' && p.buoys_scored !== null)
      .sort((a: any, b: any) => (b.id ?? 0) - (a.id ?? 0));
    const last = skierPasses[0] ?? null;
    const suggested = last ? suggestNextRope(last) : null;
    if (suggested !== null) setRope(String(suggested));
  }, [skierId]);

  const handleStart = () => {
    if (!skierId) return toast({ title: 'Select a skier', variant: 'destructive' });
    const skier = skiers?.find(s => s.id.toString() === skierId);
    if (!skier) return;
    createMutation.mutate({
      id: tournamentId,
      data: {
        skier_id: skier.id,
        skier_name: `${skier.first_name} ${skier.surname}`,
        division: skier.division,
        rope_length: Number(rope),
        speed_kph: Number(speed),
        round_number: Number(round),
      }
    });
  };

  return (
    <div className="space-y-3 pt-1">
      <Select
        label="Skier"
        value={skierId}
        onChange={e => setSkierId(e.target.value)}
        options={[
          { label: '— Select Skier —', value: '' },
          ...(skiers?.map(s => ({
            label: `${s.first_name} ${s.surname}${s.division ? ` · ${s.division}` : ''}`,
            value: s.id,
          })) || [])
        ]}
        className="h-11"
      />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Rope" value={rope} onChange={e => setRope(e.target.value)}
          options={ROPE_LENGTHS.map(r => ({ label: formatRope(r), value: r }))} className="h-11" />
        <Select label="Speed" value={speed} onChange={e => setSpeed(e.target.value)}
          options={SPEEDS.map(s => ({ label: formatSpeed(s), value: s }))} className="h-11" />
      </div>
      <Input label="Round" type="number" min="1" value={round}
        onChange={e => setRound(e.target.value)} className="h-11" />
      <Button variant="primary" className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20"
        onClick={handleStart} isLoading={createMutation.isPending}>
        <Play className="w-5 h-5 mr-2 fill-current" /> START PASS
      </Button>
    </div>
  );
}

// ─── Judge A / Chief: Active Pass Controls ─────────────────────────────────────
function ActivePassControls({ pass, tournamentId }: { pass: any; tournamentId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const updateMutation = useUpdatePass({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
        toast({ title: 'Pass ended — scores collated' });
      }
    }
  });

  const [showUpdate, setShowUpdate] = useState(false);
  const [rope, setRope] = useState(String(pass.rope_length));
  const [speed, setSpeed] = useState(String(pass.speed_kph ?? ''));
  const [saving, setSaving] = useState(false);

  const handleEnd = () => updateMutation.mutate({ id: pass.id, data: { status: 'scored' } });

  const handleUpdate = async () => {
    setSaving(true);
    try {
      await authedFetch(`/api/passes/${pass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rope_length: Number(rope), speed_kph: Number(speed) }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
      toast({ title: 'Pass details updated' });
      setShowUpdate(false);
    } finally { setSaving(false); }
  };

  return (
    <div className="space-y-3">
      <Button variant="destructive" className="w-full h-14 text-base font-bold shadow-lg"
        onClick={handleEnd} isLoading={updateMutation.isPending}>
        <Square className="w-4 h-4 mr-2 fill-current" /> END PASS / COLLATE SCORES
      </Button>
      <button className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1"
        onClick={() => setShowUpdate(v => !v)}>
        <Edit2 className="w-3.5 h-3.5" />
        {showUpdate ? 'Hide' : 'Fix pass details (rope / speed)'}
        {showUpdate ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>
      {showUpdate && (
        <div className="grid grid-cols-3 gap-2 items-end">
          <Select label="Rope" value={rope} onChange={e => setRope(e.target.value)}
            options={ROPE_LENGTHS.map(r => ({ label: `${r}m`, value: r }))} className="h-10" />
          <Select label="Speed" value={speed} onChange={e => setSpeed(e.target.value)}
            options={SPEEDS.map(s => ({ label: `${s}kph`, value: s }))} className="h-10" />
          <Button variant="primary" size="sm" onClick={handleUpdate} isLoading={saving} className="h-10">Save</Button>
        </div>
      )}
    </div>
  );
}

// ─── Score Pad ─────────────────────────────────────────────────────────────────
function ScorePad({ onScore, submittedScore, disabled }: {
  onScore: (score: string) => void;
  submittedScore: string | null;
  disabled: boolean;
}) {
  return (
    <div className="grid grid-cols-3 gap-2.5 sm:gap-3">
      {VALID_IWWF_SCORES.map((score) => {
        const isSubmitted = score === submittedScore;
        return (
          <button
            key={score}
            onClick={() => onScore(score)}
            disabled={disabled}
            className={`
              h-[72px] sm:h-24 rounded-2xl text-2xl sm:text-3xl font-black shadow-sm
              transition-all duration-100 active:scale-95 select-none
              focus:outline-none focus:ring-2 focus:ring-primary
              disabled:opacity-40 disabled:cursor-not-allowed
              ${isSubmitted
                ? 'bg-primary text-primary-foreground border-2 border-primary shadow-lg shadow-primary/30 scale-[0.97]'
                : 'bg-card border-2 border-border hover:border-primary/50 hover:bg-primary/5 hover:text-primary active:bg-primary active:text-white active:border-primary'
              }
            `}
          >
            {score === '6_no_gates' ? (
              <span className="flex flex-col items-center leading-tight">
                <span className="text-xl sm:text-2xl">6</span>
                <span className="text-[9px] sm:text-[10px] uppercase font-bold opacity-70">No Gates</span>
              </span>
            ) : score}
          </button>
        );
      })}
    </div>
  );
}

// ─── Chief Judge: Review + Correction View ─────────────────────────────────────
function ChiefJudgeView({
  tournamentId, judgeCount, activeJudgeName,
}: {
  tournamentId: number;
  judgeCount: number;
  activeJudgeName: string | null;
}) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: passes, refetch: refetchPasses } = useListPasses(tournamentId, {
    query: { enabled: true },
    request: { refetchInterval: 3000 } as any,
  });

  const activePass = passes?.find(p => p.status === 'pending');
  const recentPasses = passes
    ?.filter(p => p.status !== 'pending')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 5) || [];

  const panel = getJudgingPanel(judgeCount);
  const scoringRoles = getScoringRoles(judgeCount);

  // Fetch all judge scores for the active pass (poll every 2s)
  const { data: judgeScores = [] } = useQuery<any[]>({
    queryKey: ['pass-judge-scores-cj', activePass?.id],
    queryFn: async () => {
      if (!activePass?.id) return [];
      const r = await fetch(`/api/passes/${activePass.id}/judge-scores`);
      return r.ok ? r.json() : [];
    },
    enabled: !!activePass,
    refetchInterval: 2000,
  });

  // Score correction state
  const [editingScoreId, setEditingScoreId] = useState<number | null>(null);
  const [correcting, setCorrecting] = useState(false);

  const handleCorrect = async (scoreId: number, newScore: string) => {
    if (!activePass) return;
    setCorrecting(true);
    try {
      const r = await fetch(`/api/passes/${activePass.id}/judge-scores/${scoreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass_score: newScore }),
      });
      if (r.ok) {
        toast({ title: 'Score corrected' });
        queryClient.invalidateQueries({ queryKey: ['pass-judge-scores-cj', activePass.id] });
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
        setEditingScoreId(null);
      } else {
        toast({ title: 'Correction failed', variant: 'destructive' });
      }
    } finally { setCorrecting(false); }
  };

  // Projected collation from current scoring-panel scores
  const panelScores = judgeScores.filter(s => scoringRoles.includes(s.judge_role));
  const projectedScore = panelScores.length > 0
    ? collateScores(panelScores.map(s => s.pass_score))
    : null;

  const ropeColour = activePass ? getRopeColour(activePass.rope_length) : null;

  const [controlOpen, setControlOpen] = useState(true);

  return (
    <div className="flex flex-col min-h-[100dvh] pb-20 bg-background">
      {/* ── Pass header ── */}
      {activePass ? (
        <div className="bg-emerald-950 text-white px-4 pt-4 pb-3 sticky top-0 z-10 shadow-lg">
          <div className="flex items-start justify-between gap-3 max-w-2xl mx-auto">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20 animate-pulse">
                  ● LIVE PASS
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-display leading-tight truncate">
                {activePass.skier_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-emerald-200/80 font-semibold">
                <span>{activePass.speed_kph}kph</span>
                <span>·</span>
                {ropeColour && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold border-2 leading-tight"
                    style={{ background: ropeColour.bg, color: ropeColour.text, borderColor: ropeColour.border }}>
                    {formatRope(activePass.rope_length)}
                  </span>
                )}
                <span>·</span>
                <span>Rnd {activePass.round_number}</span>
              </div>
            </div>
            <button onClick={() => refetchPasses()}
              className="p-2 text-emerald-400/70 hover:text-emerald-300 transition-colors rounded-lg flex-shrink-0 mt-1">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card border-b px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <p className="font-bold text-muted-foreground text-sm">Waiting for skier…</p>
            <button onClick={() => refetchPasses()}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 px-3 py-3 max-w-2xl w-full mx-auto space-y-3">
        {activePass ? (
          <>
            {/* ── Score review panel ── */}
            <Card className="overflow-hidden border-amber-200 dark:border-amber-800">
              <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/30 border-b border-amber-200 dark:border-amber-800">
                <div className="flex items-center justify-between">
                  <h3 className="font-bold text-sm flex items-center gap-2 text-amber-900 dark:text-amber-200">
                    <CheckCircle2 className="w-4 h-4" />
                    Scoring Panel ({judgeCount} judge{judgeCount !== 1 ? 's' : ''})
                  </h3>
                  {projectedScore !== null && (
                    <div className="text-right">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-amber-700 dark:text-amber-400">
                        Projected ({panelScores.length}/{judgeCount})
                      </p>
                      <p className="font-display font-black text-xl text-amber-900 dark:text-amber-100 leading-none">
                        {projectedScore}
                      </p>
                    </div>
                  )}
                  {projectedScore === null && (
                    <p className="text-[11px] text-amber-600 dark:text-amber-400 animate-pulse">
                      Waiting for scores…
                    </p>
                  )}
                </div>
              </div>

              <div className="divide-y">
                {panel.map(station => {
                  const score = judgeScores.find(s => s.judge_role === station.role);
                  const isEditing = editingScoreId === score?.id;

                  return (
                    <div key={station.role} className="px-4 py-3">
                      <div className="flex items-center justify-between gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-black flex-shrink-0 ${score ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-700 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                            {station.shortLabel}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-sm leading-tight">{station.label}</p>
                            {score && (
                              <p className="text-[10px] text-muted-foreground truncate">{score.judge_name}</p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-2 flex-shrink-0">
                          {score ? (
                            <>
                              <span className={`font-display font-black text-xl ${isEditing ? 'text-muted-foreground line-through' : 'text-emerald-700 dark:text-emerald-300'}`}>
                                {formatScoreDisplay(score.pass_score)}
                              </span>
                              <CheckCircle2 className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                              {!isEditing && (
                                <button
                                  onClick={() => setEditingScoreId(score.id)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/30 transition-colors"
                                  title="Correct this score"
                                >
                                  <Pencil className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {isEditing && (
                                <button
                                  onClick={() => setEditingScoreId(null)}
                                  className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                                >
                                  <X className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </>
                          ) : (
                            <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-medium">
                              <Clock className="w-3.5 h-3.5 animate-pulse" /> Waiting
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Inline correction picker */}
                      {isEditing && score && (
                        <div className="mt-3 pt-3 border-t border-dashed">
                          <p className="text-xs font-bold text-amber-700 dark:text-amber-400 mb-2 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5" />
                            Chief Judge correction — select new score:
                          </p>
                          <div className="grid grid-cols-6 gap-1.5">
                            {VALID_IWWF_SCORES.map(s => (
                              <button
                                key={s}
                                disabled={correcting}
                                onClick={() => handleCorrect(score.id, s)}
                                className={`h-10 rounded-xl text-sm font-black transition-all active:scale-95
                                  disabled:opacity-50 border-2
                                  ${s === score.pass_score
                                    ? 'bg-primary text-primary-foreground border-primary'
                                    : 'bg-card border-border hover:border-primary/50 hover:bg-primary/5 hover:text-primary'
                                  }`}
                              >
                                {s === '6_no_gates' ? '6*' : s}
                              </button>
                            ))}
                          </div>
                          <p className="text-[10px] text-muted-foreground mt-1.5">* 6 No Gates</p>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </Card>

            {/* ── Pass controls ── */}
            <Card className="overflow-hidden border-primary/20">
              <button onClick={() => setControlOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <span className="text-sm font-bold flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-primary" /> Chief Judge Controls
                </span>
                {controlOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {controlOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  <ActivePassControls pass={activePass} tournamentId={tournamentId} />
                </div>
              )}
            </Card>
          </>
        ) : (
          /* No active pass: show start form + recent results */
          <>
            <Card className="overflow-hidden border-primary/20">
              <button onClick={() => setControlOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <span className="text-sm font-bold flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-primary" /> Start Next Pass
                </span>
                {controlOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {controlOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  <StartPassPanel tournamentId={tournamentId} />
                </div>
              )}
            </Card>

            {recentPasses.length > 0 && (
              <div>
                <h3 className="text-sm font-bold text-muted-foreground mb-2 px-1">Recent Results</h3>
                <div className="space-y-2">
                  {recentPasses.map(pass => {
                    const rc = pass.rope_length ? getRopeColour(pass.rope_length) : null;
                    return (
                      <Card key={pass.id} className="px-4 py-3 flex items-center justify-between">
                        <div className="min-w-0">
                          <p className="font-bold text-sm truncate">{pass.skier_name}</p>
                          <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 font-semibold flex-wrap">
                            R{pass.round_number} · {pass.speed_kph}kph
                            {rc && pass.rope_length && (
                              <span className="px-1.5 py-0.5 rounded border text-[10px] font-bold"
                                style={{ background: rc.bg, color: rc.text, borderColor: rc.border }}>
                                {pass.rope_length}m
                              </span>
                            )}
                          </p>
                        </div>
                        <div className="bg-emerald-100 dark:bg-emerald-900 text-emerald-800 dark:text-emerald-200 px-3 py-1 rounded-lg text-center min-w-[3rem] ml-3">
                          <p className="text-[9px] uppercase font-bold opacity-70">Score</p>
                          <p className="font-display font-black text-lg leading-none">{pass.buoys_scored ?? '—'}</p>
                        </div>
                      </Card>
                    );
                  })}
                </div>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Fixed identity bar ── */}
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t px-4 py-3 z-20 shadow-2xl">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-amber-100 dark:bg-amber-900/50 rounded-full flex items-center justify-center text-amber-700 dark:text-amber-300 font-black text-base flex-shrink-0">
              {activeJudgeName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">{activeJudgeName}</p>
              <p className="text-[10px] font-semibold text-amber-600 dark:text-amber-400 uppercase tracking-widest">Chief Judge</p>
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={() => useAppStore.getState().setJudgeSession(null, null, null)}>
            Logout
          </Button>
        </div>
      </div>
    </div>
  );
}

// ─── Main Judging Page ─────────────────────────────────────────────────────────
export default function Judging() {
  const { activeTournamentId, activeJudgeId, activeJudgeName, activeJudgeRole, setJudgeSession } = useAppStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const preselectedRole = usePreselectedRole();
  const urlTournamentId = useUrlTournamentId();

  // URL ?t= param takes priority over store — lets QR codes work on fresh devices
  const tournamentId = urlTournamentId ?? activeTournamentId;

  const { data: tournament } = useGetTournament(tournamentId || 0, {
    query: { enabled: !!tournamentId },
  });

  const judgeCount = tournament?.judge_count ?? 1;
  const panel = getJudgingPanel(judgeCount);

  // Build login dropdown options: panel stations + chief judge (omit chief if judgeCount=1 since A is chief)
  const loginOptions = [
    ...panel.map(s => ({ value: s.role, label: s.label })),
    ...(judgeCount > 1 ? [{ value: 'chief_judge', label: 'Chief Judge' }] : []),
  ];

  const { data: passes, refetch: refetchPasses } = useListPasses(tournamentId || 0, {
    query: { enabled: !!tournamentId },
    request: { refetchInterval: 3000 } as any,
  });

  const verifyMutation = useVerifyJudgePin();
  const submitMutation = useSubmitJudgeScore({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Score submitted!' });
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
      }
    }
  });

  const [selectedRole, setSelectedRole] = useState(preselectedRole ?? '');
  const [pin, setPin] = useState('');
  const [submittedScore, setSubmittedScore] = useState<string | null>(null);
  const [scoreLocked, setScoreLocked] = useState(false);
  const [judgeAOpen, setJudgeAOpen] = useState(true);

  const activePass = passes?.find(p => p.status === 'pending');
  const activePassId = activePass?.id;
  useEffect(() => { setSubmittedScore(null); setScoreLocked(false); }, [activePassId]);

  if (!tournamentId) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 px-4">
        <p className="text-xl text-muted-foreground">No active tournament.</p>
        <p className="text-sm text-muted-foreground">Select a tournament from the Home page first.</p>
      </div>
    );
  }

  // ── Not logged in ────────────────────────────────────────────────────────────
  if (!activeJudgeId) {
    const loginRole = preselectedRole || selectedRole;
    const loginOption = loginOptions.find(o => o.value === loginRole);
    const loginRoleLabel = loginOption?.label ?? loginRole ?? 'Judge';
    const showPinEntry = !!loginRole;

    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      if (!loginRole || !pin) return;
      verifyMutation.mutate(
        { data: { tournament_id: tournamentId, pin } },
        {
          onSuccess: (data) => {
            setJudgeSession(data.id, loginRole, data.name);
            setPin('');
          },
          onError: () => toast({ title: 'Invalid PIN', variant: 'destructive' }),
        }
      );
    };

    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-sm p-8 border-primary/20 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-8 h-8 text-primary" />
            </div>
            {showPinEntry ? (
              <>
                <h2 className="text-2xl font-bold font-display">{loginRoleLabel} Station</h2>
                <p className="text-muted-foreground mt-2 text-sm">Enter your judge PIN to begin.</p>
              </>
            ) : (
              <>
                <h2 className="text-2xl font-bold font-display">Judge Login</h2>
                <p className="text-muted-foreground mt-2 text-sm">
                  Select your position, then enter your PIN. Or scan the QR code at your station.
                </p>
              </>
            )}
          </div>

          {!showPinEntry ? (
            <div className="space-y-6">
              <Select
                label="I am judging as…"
                value={selectedRole}
                onChange={e => setSelectedRole(e.target.value)}
                options={[
                  { label: '— Select position —', value: '' },
                  ...loginOptions
                ]}
              />
              <Button variant="primary" className="w-full h-12 text-lg" disabled={!selectedRole}
                onClick={() => {}}>
                Continue →
              </Button>
            </div>
          ) : (
            <form onSubmit={handleLogin} className="space-y-5" autoComplete="off">
              {!preselectedRole && (
                <div className="text-center">
                  <Badge variant="outline" className="font-semibold text-sm px-3 py-1">{loginRoleLabel}</Badge>
                </div>
              )}
              <Input
                type="password"
                inputMode="numeric"
                maxLength={6}
                autoFocus
                autoComplete="new-password"
                name="judge-pin-field"
                className="text-center text-4xl tracking-widest h-16 font-mono"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
              <Button variant="primary" type="submit" className="w-full h-12 text-lg"
                isLoading={verifyMutation.isPending}>
                Login
              </Button>
              {!preselectedRole && (
                <button type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                  onClick={() => setSelectedRole('')}>
                  ← Change position
                </button>
              )}
            </form>
          )}
        </Card>
      </div>
    );
  }

  // ── Chief Judge: review / correction page ────────────────────────────────────
  if (activeJudgeRole === 'chief_judge') {
    return (
      <ChiefJudgeView
        tournamentId={tournamentId}
        judgeCount={judgeCount}
        activeJudgeName={activeJudgeName}
      />
    );
  }

  // ── Scoring judge (A–E): score pad ───────────────────────────────────────────
  const isController = activeJudgeRole === 'judge_a' || (judgeCount === 1 && activeJudgeRole === 'judge_a');
  const stationInfo = panel.find(s => s.role === activeJudgeRole);

  const handleScore = (scoreStr: string) => {
    if (!activePass || !activeJudgeName || !activeJudgeRole) return;
    setSubmittedScore(scoreStr);
    submitMutation.mutate(
      {
        id: activePass.id,
        data: {
          tournament_id: tournamentId,
          judge_id: activeJudgeId,
          judge_name: activeJudgeName,
          judge_role: activeJudgeRole,
          pass_score: scoreStr,
        }
      },
      { onSuccess: () => setScoreLocked(true) }
    );
  };

  const ropeColour = activePass ? getRopeColour(activePass.rope_length) : null;

  return (
    <div className="flex flex-col min-h-[100dvh] pb-16 bg-background">
      {/* ── Pass header ── */}
      {activePass ? (
        <div className="bg-emerald-950 text-white px-4 pt-4 pb-3 sticky top-0 z-10 shadow-lg">
          <div className="flex items-start justify-between gap-3 max-w-2xl mx-auto">
            <div className="min-w-0">
              <div className="flex items-center gap-2 mb-1">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-widest text-emerald-400 bg-emerald-400/10 px-2 py-0.5 rounded-full border border-emerald-400/20 animate-pulse">
                  ● LIVE PASS
                </span>
              </div>
              <h1 className="text-2xl sm:text-3xl font-black font-display leading-tight truncate">
                {activePass.skier_name}
              </h1>
              <div className="flex flex-wrap items-center gap-2 mt-1 text-sm text-emerald-200/80 font-semibold">
                <span>{activePass.speed_kph}kph</span>
                <span>·</span>
                {ropeColour && (
                  <span className="px-2 py-0.5 rounded-full text-xs font-bold border-2 leading-tight"
                    style={{ background: ropeColour.bg, color: ropeColour.text, borderColor: ropeColour.border }}>
                    {formatRope(activePass.rope_length)}
                  </span>
                )}
                <span>·</span>
                <span>Rnd {activePass.round_number}</span>
              </div>
            </div>
            <button onClick={() => refetchPasses()}
              className="p-2 text-emerald-400/70 hover:text-emerald-300 transition-colors rounded-lg flex-shrink-0 mt-1">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card border-b px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <p className="font-bold text-muted-foreground text-sm">Waiting for skier…</p>
            <button onClick={() => refetchPasses()}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg">
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      <div className="flex-1 px-3 py-3 max-w-2xl w-full mx-auto space-y-3">
        {activePass ? (
          <>
            {scoreLocked && submittedScore ? (
              <div className="space-y-3">
                <div className="flex flex-col items-center justify-center p-6 bg-emerald-50 dark:bg-emerald-950/40 border-2 border-emerald-200 dark:border-emerald-700 rounded-2xl text-center gap-2">
                  <div className="flex items-center gap-2 text-emerald-700 dark:text-emerald-300">
                    <Lock className="w-4 h-4" />
                    <span className="text-xs font-bold uppercase tracking-widest">Score Locked</span>
                  </div>
                  <span className="font-display font-black text-6xl text-emerald-700 dark:text-emerald-300 leading-none">
                    {submittedScore === '6_no_gates' ? '6*' : submittedScore}
                  </span>
                  {submittedScore === '6_no_gates' && (
                    <span className="text-xs text-emerald-600 dark:text-emerald-400 font-semibold">No Gates</span>
                  )}
                  <p className="text-xs text-muted-foreground mt-1">
                    Your score has been submitted. Ask the Chief Judge to authorise any correction.
                  </p>
                </div>
                <button
                  onClick={() => setScoreLocked(false)}
                  className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-border text-muted-foreground text-sm font-semibold hover:border-primary/40 hover:text-primary transition-colors"
                >
                  <Unlock className="w-3.5 h-3.5" /> Change my score
                </button>
              </div>
            ) : (
              <>
                {submittedScore && !scoreLocked && (
                  <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl text-amber-700 dark:text-amber-300 text-xs font-semibold">
                    <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />
                    Changing from {submittedScore === '6_no_gates' ? '6 (No Gates)' : submittedScore} — select new score
                  </div>
                )}
                <ScorePad onScore={handleScore} submittedScore={submittedScore} disabled={submitMutation.isPending} />
              </>
            )}
            {isController && (
              <Card className="overflow-hidden border-primary/20">
                <button onClick={() => setJudgeAOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                  <span className="text-sm font-bold flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-primary" /> Judge A Controls
                  </span>
                  {judgeAOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {judgeAOpen && (
                  <div className="border-t px-4 pb-4 pt-3">
                    <ActivePassControls pass={activePass} tournamentId={tournamentId} />
                  </div>
                )}
              </Card>
            )}
          </>
        ) : (
          isController ? (
            <Card className="overflow-hidden border-primary/20">
              <button onClick={() => setJudgeAOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors">
                <span className="text-sm font-bold flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-primary" /> Start Next Pass
                </span>
                {judgeAOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {judgeAOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  <StartPassPanel tournamentId={tournamentId} />
                </div>
              )}
            </Card>
          ) : (
            <div className="flex flex-col items-center justify-center py-20 text-center space-y-4">
              <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
                <div className="w-5 h-5 bg-primary rounded-full animate-ping" />
              </div>
              <h2 className="text-2xl font-bold text-muted-foreground">Waiting for skier…</h2>
              <p className="text-sm text-muted-foreground/70">
                The score pad will appear when the operator starts a pass.
              </p>
            </div>
          )
        )}
      </div>

      {/* ── Fixed bottom identity bar ── */}
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t px-4 py-3 z-20 shadow-2xl">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-black text-base flex-shrink-0">
              {activeJudgeName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">{activeJudgeName}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {stationInfo?.label ?? activeJudgeRole ?? 'Judge'}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {submitMutation.isPending && (
              <span className="text-xs text-muted-foreground animate-pulse">Submitting…</span>
            )}
            <Button variant="outline" size="sm" onClick={() => setJudgeSession(null, null, null)}>
              Logout
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
