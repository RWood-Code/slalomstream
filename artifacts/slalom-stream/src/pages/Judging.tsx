import React, { useState, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  useGetTournament, useListJudges, useListPasses, useListSkiers,
  useSubmitJudgeScore, useVerifyJudgePin, useCreatePass, useUpdatePass
} from '@workspace/api-client-react';
import { Card, Button, Input, Select, Badge } from '@/components/ui/shared';
import { ShieldAlert, CheckCircle2, RefreshCw, Play, Square, ChevronDown, ChevronUp, Edit2 } from 'lucide-react';
import { VALID_IWWF_SCORES, getRopeColour, formatRope, formatSpeed, ROPE_LENGTHS, SPEEDS } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

function usePreselectedJudgeId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('j');
}

const ROLE_LABELS: Record<string, string> = {
  judge_a: 'Judge A', judge_b: 'Judge B', judge_c: 'Judge C',
  judge_d: 'Judge D', judge_e: 'Judge E',
  boat_judge: 'Boat Judge', chief_judge: 'Chief Judge',
};

// ─── Judge A: Start Pass Panel ─────────────────────────────────────────────────
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

  const [skierId, setSkierId] = useState('');
  const [rope, setRope] = useState('18.25');
  const [speed, setSpeed] = useState('55');
  const [round, setRound] = useState('1');

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
            label: `${s.first_name} ${s.surname} · ${s.division || '—'}`,
            value: s.id,
          })) || [])
        ]}
        className="h-11"
      />
      <div className="grid grid-cols-2 gap-3">
        <Select
          label="Rope"
          value={rope}
          onChange={e => setRope(e.target.value)}
          options={ROPE_LENGTHS.map(r => ({ label: formatRope(r), value: r }))}
          className="h-11"
        />
        <Select
          label="Speed"
          value={speed}
          onChange={e => setSpeed(e.target.value)}
          options={SPEEDS.map(s => ({ label: formatSpeed(s), value: s }))}
          className="h-11"
        />
      </div>
      <Input
        label="Round"
        type="number"
        min="1"
        value={round}
        onChange={e => setRound(e.target.value)}
        className="h-11"
      />
      <Button
        variant="primary"
        className="w-full h-14 text-lg font-bold shadow-lg shadow-primary/20"
        onClick={handleStart}
        isLoading={createMutation.isPending}
      >
        <Play className="w-5 h-5 mr-2 fill-current" /> START PASS
      </Button>
    </div>
  );
}

// ─── Judge A: Active Pass Controls ────────────────────────────────────────────
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
  const [savingUpdate, setSavingUpdate] = useState(false);

  const handleEnd = () => {
    updateMutation.mutate({ id: pass.id, data: { status: 'scored' } });
  };

  const handleUpdate = async () => {
    setSavingUpdate(true);
    try {
      await fetch(`/api/passes/${pass.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rope_length: Number(rope), speed_kph: Number(speed) }),
      });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
      toast({ title: 'Pass details updated' });
      setShowUpdate(false);
    } finally {
      setSavingUpdate(false);
    }
  };

  return (
    <div className="space-y-3">
      <Button
        variant="destructive"
        className="w-full h-14 text-base font-bold shadow-lg"
        onClick={handleEnd}
        isLoading={updateMutation.isPending}
      >
        <Square className="w-4 h-4 mr-2 fill-current" /> END PASS / COLLATE SCORES
      </Button>

      <button
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors w-full justify-center py-1"
        onClick={() => setShowUpdate(v => !v)}
      >
        <Edit2 className="w-3.5 h-3.5" />
        {showUpdate ? 'Hide' : 'Fix pass details (rope / speed)'}
        {showUpdate ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
      </button>

      {showUpdate && (
        <div className="grid grid-cols-3 gap-2 items-end">
          <Select
            label="Rope"
            value={rope}
            onChange={e => setRope(e.target.value)}
            options={ROPE_LENGTHS.map(r => ({ label: `${r}m`, value: r }))}
            className="h-10"
          />
          <Select
            label="Speed"
            value={speed}
            onChange={e => setSpeed(e.target.value)}
            options={SPEEDS.map(s => ({ label: `${s}kph`, value: s }))}
            className="h-10"
          />
          <Button variant="primary" size="sm" onClick={handleUpdate} isLoading={savingUpdate} className="h-10">
            Save
          </Button>
        </div>
      )}
    </div>
  );
}

// ─── Score Pad ─────────────────────────────────────────────────────────────────
function ScorePad({
  onScore,
  submittedScore,
  disabled,
}: {
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

// ─── Main Judging Page ─────────────────────────────────────────────────────────
export default function Judging() {
  const { activeTournamentId, activeJudgeId, activeJudgeName, activeJudgeRole, setJudgeSession } = useAppStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const preJudgeId = usePreselectedJudgeId();

  const isJudgeA = activeJudgeRole === 'judge_a';

  const { data: judges } = useListJudges(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: passes, refetch: refetchPasses } = useListPasses(activeTournamentId || 0, {
    query: { enabled: !!activeTournamentId },
    request: { refetchInterval: 3000 } as any,
  });

  const verifyMutation = useVerifyJudgePin();
  const submitMutation = useSubmitJudgeScore({
    mutation: {
      onSuccess: () => {
        toast({ title: 'Score submitted!' });
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'passes'] });
      }
    }
  });

  const [selectedJudge, setSelectedJudge] = useState(preJudgeId ?? '');
  const [pin, setPin] = useState('');
  const [showPinEntry, setShowPinEntry] = useState(!!preJudgeId);
  const [submittedScore, setSubmittedScore] = useState<string | null>(null);
  const [judgeAOpen, setJudgeAOpen] = useState(true);

  useEffect(() => {
    if (preJudgeId && judges?.find(j => j.id.toString() === preJudgeId)) {
      setSelectedJudge(preJudgeId);
      setShowPinEntry(true);
    }
  }, [judges, preJudgeId]);

  // Track submitted score per pass
  const activePass = passes?.find(p => p.status === 'pending');
  const activePassId = activePass?.id;

  useEffect(() => {
    // Reset submitted score when the active pass changes
    setSubmittedScore(null);
  }, [activePassId]);

  if (!activeTournamentId) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4 px-4">
        <p className="text-xl text-muted-foreground">No active tournament.</p>
        <p className="text-sm text-muted-foreground">Select a tournament from the Home page first.</p>
      </div>
    );
  }

  const selectedJudgeObj = judges?.find(j => j.id.toString() === selectedJudge);

  // ── Not logged in ─────────────────────────────────────────────────────────
  if (!activeJudgeId) {
    if (showPinEntry && selectedJudgeObj) {
      return (
        <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background">
          <Card className="w-full max-w-sm p-8 border-primary/20 shadow-2xl">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <ShieldAlert className="w-8 h-8 text-primary" />
              </div>
              <h2 className="text-2xl font-bold font-display">Enter PIN</h2>
              <div className="mt-3 space-y-1">
                <p className="font-bold text-lg">{selectedJudgeObj.name}</p>
                <Badge variant="outline" className="font-semibold">
                  {ROLE_LABELS[selectedJudgeObj.judge_role] ?? selectedJudgeObj.judge_role}
                </Badge>
              </div>
            </div>
            <form onSubmit={e => {
              e.preventDefault();
              if (!selectedJudge || !pin) return;
              verifyMutation.mutate(
                { data: { tournament_id: activeTournamentId, pin } },
                {
                  onSuccess: (data) => {
                    if (data.id.toString() === selectedJudge) {
                      setJudgeSession(data.id, data.judge_role, data.name);
                      setPin(''); setShowPinEntry(false);
                    } else {
                      toast({ title: 'Wrong PIN for this judge', variant: 'destructive' });
                    }
                  },
                  onError: () => toast({ title: 'Invalid PIN', variant: 'destructive' }),
                }
              );
            }} className="space-y-5" autoComplete="off">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                autoComplete="new-password"
                name="judge-pin-field"
                className="text-center text-4xl tracking-widest h-16 font-mono"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
              <Button variant="primary" type="submit" className="w-full h-12 text-lg" isLoading={verifyMutation.isPending}>
                Login
              </Button>
              {!preJudgeId && (
                <button
                  type="button"
                  className="w-full text-center text-sm text-muted-foreground hover:text-foreground transition-colors mt-2"
                  onClick={() => setShowPinEntry(false)}
                >
                  ← Choose a different judge
                </button>
              )}
            </form>
          </Card>
        </div>
      );
    }

    return (
      <div className="min-h-[100dvh] flex items-center justify-center p-4 bg-background">
        <Card className="w-full max-w-md p-8 border-primary/20 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold font-display">Judge Login</h2>
            <p className="text-muted-foreground mt-2 text-sm">
              Select your name, or scan your personal QR code from the operator's screen.
            </p>
          </div>
          <form
            onSubmit={e => { e.preventDefault(); if (selectedJudge) setShowPinEntry(true); }}
            className="space-y-6"
          >
            <Select
              label="Select Your Name"
              value={selectedJudge}
              onChange={e => setSelectedJudge(e.target.value)}
              options={[
                { label: '— Select Judge —', value: '' },
                ...(judges?.map(j => ({
                  label: `${j.name} · ${ROLE_LABELS[j.judge_role] ?? j.judge_role}`,
                  value: j.id,
                })) || [])
              ]}
            />
            <Button variant="primary" className="w-full h-12 text-lg" disabled={!selectedJudge}>
              Continue →
            </Button>
          </form>
        </Card>
      </div>
    );
  }

  // ── Logged in ──────────────────────────────────────────────────────────────
  const handleScore = (scoreStr: string) => {
    if (!activePass || !activeJudgeName || !activeJudgeRole) return;
    setSubmittedScore(scoreStr);
    submitMutation.mutate({
      id: activePass.id,
      data: {
        tournament_id: activeTournamentId,
        judge_id: activeJudgeId,
        judge_name: activeJudgeName,
        judge_role: activeJudgeRole,
        pass_score: scoreStr,
      }
    });
  };

  const ropeColour = activePass ? getRopeColour(activePass.rope_length) : null;

  return (
    <div className="flex flex-col min-h-[100dvh] pb-16 bg-background">
      {/* ── Active pass header ─────────────────────────────────────── */}
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
                  <span
                    className="px-2 py-0.5 rounded-full text-xs font-bold border-2 leading-tight"
                    style={{ background: ropeColour.bg, color: ropeColour.text, borderColor: ropeColour.border }}
                  >
                    {formatRope(activePass.rope_length)}
                  </span>
                )}
                <span>·</span>
                <span>Rnd {activePass.round_number}</span>
              </div>
            </div>
            <button
              onClick={() => refetchPasses()}
              className="p-2 text-emerald-400/70 hover:text-emerald-300 transition-colors rounded-lg flex-shrink-0 mt-1"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-card border-b px-4 py-3 sticky top-0 z-10">
          <div className="flex items-center justify-between max-w-2xl mx-auto">
            <p className="font-bold text-muted-foreground text-sm">Waiting for skier…</p>
            <button
              onClick={() => refetchPasses()}
              className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg"
            >
              <RefreshCw className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ── Main content area ───────────────────────────────────────── */}
      <div className="flex-1 px-3 py-3 max-w-2xl w-full mx-auto space-y-3">
        {activePass ? (
          <>
            {/* Submitted score feedback */}
            {submittedScore && (
              <div className="flex items-center gap-2.5 px-4 py-2.5 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 rounded-xl text-emerald-700 dark:text-emerald-300 font-semibold text-sm">
                <CheckCircle2 className="w-4 h-4 flex-shrink-0 text-emerald-500" />
                Score submitted: <span className="font-black text-base">
                  {submittedScore === '6_no_gates' ? '6 (No Gates)' : submittedScore}
                </span>
                <span className="text-xs opacity-70 ml-auto">Tap to change</span>
              </div>
            )}

            {/* Score pad */}
            <ScorePad
              onScore={handleScore}
              submittedScore={submittedScore}
              disabled={submitMutation.isPending}
            />

            {/* Judge A operator controls */}
            {isJudgeA && (
              <Card className="overflow-hidden border-primary/20">
                <button
                  onClick={() => setJudgeAOpen(v => !v)}
                  className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-sm font-bold flex items-center gap-2">
                    <Play className="w-3.5 h-3.5 text-primary" />
                    Judge A Controls
                  </span>
                  {judgeAOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
                </button>
                {judgeAOpen && (
                  <div className="border-t px-4 pb-4 pt-3">
                    <ActivePassControls pass={activePass} tournamentId={activeTournamentId} />
                  </div>
                )}
              </Card>
            )}
          </>
        ) : (
          /* No active pass */
          isJudgeA ? (
            <Card className="overflow-hidden border-primary/20">
              <button
                onClick={() => setJudgeAOpen(v => !v)}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/40 transition-colors"
              >
                <span className="text-sm font-bold flex items-center gap-2">
                  <Play className="w-3.5 h-3.5 text-primary" />
                  Start Next Pass
                </span>
                {judgeAOpen ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
              {judgeAOpen && (
                <div className="border-t px-4 pb-4 pt-3">
                  <StartPassPanel tournamentId={activeTournamentId} />
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

      {/* ── Fixed bottom identity bar ───────────────────────────────── */}
      <div className="fixed bottom-0 inset-x-0 bg-card/95 backdrop-blur border-t px-4 py-3 z-20 shadow-2xl">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 bg-primary/10 rounded-full flex items-center justify-center text-primary font-black text-base flex-shrink-0">
              {activeJudgeName?.[0]}
            </div>
            <div className="min-w-0">
              <p className="font-bold text-sm leading-tight truncate">{activeJudgeName}</p>
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
                {ROLE_LABELS[activeJudgeRole ?? ''] ?? activeJudgeRole}
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
