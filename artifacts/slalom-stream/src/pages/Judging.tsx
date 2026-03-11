import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useGetTournament, useListJudges, useListPasses, useSubmitJudgeScore, useVerifyJudgePin } from '@workspace/api-client-react';
import { Card, Button, PageHeader, Dialog, Input, Select, Badge } from '@/components/ui/shared';
import { ShieldAlert, CheckCircle2 } from 'lucide-react';
import { VALID_IWWF_SCORES } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function Judging() {
  const { activeTournamentId, activeJudgeId, activeJudgeName, activeJudgeRole, setJudgeSession } = useAppStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: judges } = useListJudges(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: passes } = useListPasses(activeTournamentId || 0, { query: { enabled: !!activeTournamentId }, request: { refetchInterval: 3000 } as any });
  
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

  const [pinDialog, setPinDialog] = useState(false);
  const [selectedJudge, setSelectedJudge] = useState('');
  const [pin, setPin] = useState('');

  if (!activeTournamentId) {
    return <div className="p-8 text-center text-muted-foreground">Please select a tournament from Home.</div>;
  }

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedJudge || !pin) return;
    
    verifyMutation.mutate({
      data: { tournament_id: activeTournamentId, pin }
    }, {
      onSuccess: (data) => {
        if (data.id.toString() === selectedJudge) {
          setJudgeSession(data.id, data.judge_role, data.name);
          setPinDialog(false);
          setPin('');
        } else {
          toast({ title: "Invalid PIN for this judge", variant: "destructive" });
        }
      },
      onError: () => {
        toast({ title: "Invalid PIN", variant: "destructive" });
      }
    });
  };

  if (!activeJudgeId) {
    return (
      <div className="max-w-md mx-auto mt-12">
        <Card className="p-8 border-primary/20 shadow-2xl">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
              <ShieldAlert className="w-8 h-8 text-primary" />
            </div>
            <h2 className="text-2xl font-bold font-display">Judge Login</h2>
            <p className="text-muted-foreground mt-2">Select your name and enter your PIN.</p>
          </div>
          <form onSubmit={(e) => { e.preventDefault(); setPinDialog(true); }} className="space-y-6">
            <Select 
              label="Select Your Name"
              value={selectedJudge}
              onChange={e => setSelectedJudge(e.target.value)}
              options={[
                { label: '-- Select Judge --', value: '' },
                ...(judges?.map(j => ({ label: `${j.name} (${j.judge_role.replace('_', ' ').toUpperCase()})`, value: j.id })) || [])
              ]}
            />
            <Button variant="primary" className="w-full h-12 text-lg" disabled={!selectedJudge}>
              Continue
            </Button>
          </form>
        </Card>

        <Dialog open={pinDialog} onOpenChange={setPinDialog} title="Enter PIN">
          <form onSubmit={handleLogin} className="space-y-6">
            <div className="text-center mb-4">
              <p className="font-semibold text-lg">{judges?.find(j => j.id.toString() === selectedJudge)?.name}</p>
              <p className="text-sm text-muted-foreground">Enter 4-digit PIN</p>
            </div>
            <Input 
              type="password" 
              maxLength={4} 
              autoFocus
              className="text-center text-3xl tracking-widest h-16 font-mono" 
              value={pin} 
              onChange={e => setPin(e.target.value)} 
            />
            <Button variant="primary" type="submit" className="w-full h-12" isLoading={verifyMutation.isPending}>
              Login
            </Button>
          </form>
        </Dialog>
      </div>
    );
  }

  // Find the oldest pending pass
  const pendingPasses = passes?.filter(p => p.status === 'pending').sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime()) || [];
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
        pass_score: scoreStr
      }
    });
  };

  return (
    <div className="space-y-6 pb-24">
      <div className="flex items-center justify-between bg-card p-4 rounded-2xl border shadow-sm">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-primary/10 rounded-full flex items-center justify-center text-primary font-bold">
            {activeJudgeName?.[0]}
          </div>
          <div>
            <p className="font-bold text-sm leading-tight">{activeJudgeName}</p>
            <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest">{activeJudgeRole?.replace('_', ' ')}</p>
          </div>
        </div>
        <Button variant="outline" size="sm" onClick={() => setJudgeSession(null, null, null)}>Logout</Button>
      </div>

      {!activePass ? (
        <div className="py-20 text-center space-y-4">
          <div className="w-20 h-20 bg-muted rounded-full flex items-center justify-center mx-auto">
            <div className="w-4 h-4 bg-primary rounded-full animate-ping"></div>
          </div>
          <h2 className="text-2xl font-bold text-muted-foreground">Waiting for skier...</h2>
          <p className="text-sm text-muted-foreground/70">Scores can be entered when the operator starts a pass.</p>
        </div>
      ) : (
        <div className="space-y-6">
          <Card className="p-6 bg-emerald-950 text-white border-none shadow-2xl">
            <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 mb-4 animate-pulse">
              LIVE PASS
            </Badge>
            <h1 className="text-3xl md:text-5xl font-black font-display mb-2">{activePass.skier_name}</h1>
            <div className="flex gap-4 text-emerald-200/80 font-semibold text-lg">
              <span>{activePass.speed_kph} kph</span>
              <span>•</span>
              <span>{activePass.rope_length}m</span>
            </div>
          </Card>

          <div className="grid grid-cols-3 sm:grid-cols-4 gap-3 md:gap-4">
            {VALID_IWWF_SCORES.map((score) => (
              <button
                key={score}
                onClick={() => handleScore(score)}
                disabled={submitMutation.isPending}
                className="h-20 sm:h-24 rounded-2xl bg-card border-2 border-border text-2xl font-black shadow-sm transition-all duration-200 hover:bg-primary/10 hover:border-primary/50 hover:text-primary active:scale-95 active:bg-primary active:text-white disabled:opacity-50"
              >
                {score === '6_no_gates' ? (
                  <span className="text-base font-bold flex flex-col items-center leading-tight">
                    <span>6</span>
                    <span className="text-[10px] uppercase opacity-70">No Gates</span>
                  </span>
                ) : score}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
