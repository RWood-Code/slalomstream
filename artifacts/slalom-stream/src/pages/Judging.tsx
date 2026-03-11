import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useGetTournament, useListJudges, useListPasses, useSubmitJudgeScore, useVerifyJudgePin } from '@workspace/api-client-react';
import { Card, Button, PageHeader, Dialog, Input, Select, Badge } from '@/components/ui/shared';
import { ShieldAlert, CheckCircle2, RefreshCw } from 'lucide-react';
import { VALID_IWWF_SCORES } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

// Read ?j=<judgeId> from the current URL
function usePreselectedJudgeId(): string | null {
  if (typeof window === 'undefined') return null;
  return new URLSearchParams(window.location.search).get('j');
}

export default function Judging() {
  const { activeTournamentId, activeJudgeId, activeJudgeName, activeJudgeRole, setJudgeSession } = useAppStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const preJudgeId = usePreselectedJudgeId();

  const { data: judges } = useListJudges(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: passes } = useListPasses(activeTournamentId || 0, {
    query: { enabled: !!activeTournamentId },
    request: { refetchInterval: 3000 } as any,
  });

  const verifyMutation = useVerifyJudgePin();
  const submitMutation = useSubmitJudgeScore({
    mutation: {
      onSuccess: () => {
        toast({ title: "Score submitted!" });
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'passes'] });
        queryClient.invalidateQueries({ queryKey: ['/api/passes'] });
      }
    }
  });

  // If a ?j= param is present, pre-select that judge
  const [selectedJudge, setSelectedJudge] = useState(preJudgeId ?? '');
  const [pin, setPin] = useState('');
  const [showPinEntry, setShowPinEntry] = useState(!!preJudgeId); // skip dropdown if pre-selected

  // If judges load and we have a pre-selected ID, jump straight to PIN entry
  useEffect(() => {
    if (preJudgeId && judges?.find(j => j.id.toString() === preJudgeId)) {
      setSelectedJudge(preJudgeId);
      setShowPinEntry(true);
    }
  }, [judges, preJudgeId]);

  if (!activeTournamentId) {
    return (
      <div className="max-w-md mx-auto mt-20 text-center space-y-4">
        <p className="text-xl text-muted-foreground">No active tournament.</p>
        <p className="text-sm text-muted-foreground">Please select a tournament from the Home page first.</p>
      </div>
    );
  }

  const selectedJudgeObj = judges?.find(j => j.id.toString() === selectedJudge);

  const ROLE_LABELS: Record<string, string> = {
    judge_a: 'Judge A', judge_b: 'Judge B', judge_c: 'Judge C',
    judge_d: 'Judge D', judge_e: 'Judge E',
    boat_judge: 'Boat Judge', chief_judge: 'Chief Judge',
  };

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJudge || !pin) return;

    verifyMutation.mutate(
      { data: { tournament_id: activeTournamentId, pin } },
      {
        onSuccess: (data) => {
          if (data.id.toString() === selectedJudge) {
            setJudgeSession(data.id, data.judge_role, data.name);
            setPin('');
            setShowPinEntry(false);
          } else {
            toast({ title: "Wrong PIN for this judge", variant: "destructive" });
          }
        },
        onError: () => toast({ title: "Invalid PIN", variant: "destructive" }),
      }
    );
  };

  // ── Not logged in ──────────────────────────────────────────────────────────
  if (!activeJudgeId) {
    // PIN entry (judge pre-selected via QR or after name selection)
    if (showPinEntry && selectedJudgeObj) {
      return (
        <div className="max-w-sm mx-auto mt-12">
          <Card className="p-8 border-primary/20 shadow-2xl">
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
            <form onSubmit={handleLogin} className="space-y-5">
              <Input
                type="password"
                inputMode="numeric"
                maxLength={4}
                autoFocus
                className="text-center text-4xl tracking-widest h-16 font-mono"
                placeholder="••••"
                value={pin}
                onChange={e => setPin(e.target.value)}
              />
              <Button variant="primary" type="submit" className="w-full h-12 text-lg" isLoading={verifyMutation.isPending}>
                Login
              </Button>
              {/* Allow going back to name selection (unless locked via QR) */}
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

    // Name selection (when no QR pre-select)
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card className="p-8 border-primary/20 shadow-2xl">
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
                { label: '-- Select Judge --', value: '' },
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

  // ── Logged in — scoring ────────────────────────────────────────────────────
  const pendingPasses = passes
    ?.filter(p => p.status === 'pending')
    .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || [];
  const activePass = pendingPasses[0];

  const handleScore = (scoreStr: string) => {
    if (!activePass || !activeJudgeName || !activeJudgeRole) return;
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

  return (
    <div className="space-y-6 pb-24 max-w-2xl mx-auto">
      {/* Judge identity bar */}
      <div className="flex items-center justify-between bg-card p-4 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-black text-lg">
            {activeJudgeName?.[0]}
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">{activeJudgeName}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">
              {ROLE_LABELS[activeJudgeRole ?? ''] ?? activeJudgeRole?.replace('_', ' ')}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'passes'] })}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-muted"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
          <Button variant="outline" size="sm" onClick={() => setJudgeSession(null, null, null)}>Logout</Button>
        </div>
      </div>

      {/* Waiting state */}
      {!activePass ? (
        <div className="py-24 text-center space-y-4">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
            <div className="w-5 h-5 bg-primary rounded-full animate-ping" />
          </div>
          <h2 className="text-2xl font-bold text-muted-foreground">Waiting for skier…</h2>
          <p className="text-sm text-muted-foreground/70">
            Scores can be entered when the operator starts a pass.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* Active pass hero */}
          <Card className="p-6 bg-emerald-950 text-white border-none shadow-2xl">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 mb-4 animate-pulse">
              LIVE PASS
            </Badge>
            <h1 className="text-3xl md:text-5xl font-black font-display mb-2">
              {activePass.skier_name}
            </h1>
            <div className="flex flex-wrap gap-4 text-emerald-200/80 font-semibold text-lg">
              <span>{activePass.speed_kph} kph</span>
              <span>·</span>
              <span>{activePass.rope_length}m rope</span>
              <span>·</span>
              <span>Round {activePass.round_number}</span>
            </div>
          </Card>

          {/* Score buttons */}
          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 md:gap-4">
            {VALID_IWWF_SCORES.map((score) => (
              <button
                key={score}
                onClick={() => handleScore(score)}
                disabled={submitMutation.isPending}
                className="h-20 sm:h-24 rounded-2xl bg-card border-2 border-border text-2xl font-black shadow-sm transition-all duration-150 hover:bg-primary/10 hover:border-primary/50 hover:text-primary active:scale-95 active:bg-primary active:text-white disabled:opacity-40 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {score === '6_no_gates' ? (
                  <span className="flex flex-col items-center leading-tight">
                    <span className="text-2xl">6</span>
                    <span className="text-[10px] uppercase opacity-60">No Gates</span>
                  </span>
                ) : score}
              </button>
            ))}
          </div>

          {submitMutation.isSuccess && (
            <div className="flex items-center justify-center gap-2 py-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 font-bold">
              <CheckCircle2 className="w-5 h-5" />
              Score submitted — waiting for next pass
            </div>
          )}
        </div>
      )}
    </div>
  );
}
