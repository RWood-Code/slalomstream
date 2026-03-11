import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useGetTournament, useListSkiers, useListPasses, useCreatePass, useUpdatePass } from '@workspace/api-client-react';
import { Card, Button, Badge, PageHeader, Select, Input } from '@/components/ui/shared';
import { Play, SquareSquare, Timer, ArrowRight, User } from 'lucide-react';
import { ROPE_LENGTHS, SPEEDS, formatRope, formatSpeed } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';

export default function Recording() {
  const { activeTournamentId } = useAppStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  
  const { data: tournament } = useGetTournament(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: skiers } = useListSkiers(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: passes } = useListPasses(activeTournamentId || 0, { query: { enabled: !!activeTournamentId }, request: { refetchInterval: 5000 } as any });

  const activePass = passes?.find(p => p.status === 'pending');
  const recentPasses = passes?.filter(p => p.status !== 'pending').sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5) || [];

  const [skierId, setSkierId] = useState<string>('');
  const [rope, setRope] = useState<string>('18.25');
  const [speed, setSpeed] = useState<string>('55');
  const [round, setRound] = useState<string>('1');

  const createMutation = useCreatePass({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'passes'] });
        toast({ title: "Pass started", description: "Waiting for judge scores." });
      }
    }
  });

  const updateMutation = useUpdatePass({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'passes'] });
        toast({ title: "Pass marked as complete" });
      }
    }
  });

  if (!activeTournamentId) {
    return <div className="p-8 text-center"><p className="text-xl text-muted-foreground">Please select a tournament from the Home page first.</p></div>;
  }

  const handleStartPass = () => {
    if (!skierId) return toast({ title: "Select a skier", variant: "destructive" });
    const skier = skiers?.find(s => s.id.toString() === skierId);
    if (!skier) return;

    createMutation.mutate({
      id: activeTournamentId,
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

  const handleEndPass = () => {
    if (!activePass) return;
    updateMutation.mutate({
      id: activePass.id,
      data: { status: 'scored' } // Assuming 'scored' means operator closed it. The actual score comes from judges.
    });
  };

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Pass Recording" 
        subtitle="Operator Control Panel" 
        actions={
          <Badge variant={activePass ? "success" : "outline"} className={activePass ? "animate-pulse" : ""}>
            {activePass ? "● SKIER ON WATER" : "STANDBY"}
          </Badge>
        }
      />

      <div className="grid lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <Card className="p-6 md:p-8 bg-gradient-to-br from-card to-emerald-50 dark:to-emerald-950/20 shadow-xl border-primary/20">
            <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
              <Timer className="text-primary" /> 
              {activePass ? "Active Pass Control" : "Setup Next Pass"}
            </h2>
            
            {activePass ? (
              <div className="space-y-6">
                <div className="p-6 bg-primary/10 rounded-2xl border border-primary/20">
                  <div className="text-center space-y-2">
                    <p className="text-sm font-bold text-primary uppercase tracking-widest">Currently on water</p>
                    <p className="text-4xl font-display font-bold">{activePass.skier_name}</p>
                    <div className="flex items-center justify-center gap-4 text-muted-foreground font-semibold mt-2">
                      <span>Rnd {activePass.round_number}</span>
                      <span>•</span>
                      <span>{formatSpeed(activePass.speed_kph)}</span>
                      <span>•</span>
                      <span>{formatRope(activePass.rope_length)}</span>
                    </div>
                  </div>
                </div>
                
                <Button 
                  variant="destructive" 
                  size="lg" 
                  className="w-full h-20 text-xl shadow-red-500/25 shadow-xl hover:shadow-red-500/40"
                  onClick={handleEndPass}
                  isLoading={updateMutation.isPending}
                >
                  <SquareSquare className="mr-2 h-6 w-6" /> END PASS / COLLATE SCORES
                </Button>
                <p className="text-center text-sm text-muted-foreground font-medium">
                  Wait for all judges to submit before ending pass if automatic collation is needed.
                </p>
              </div>
            ) : (
              <div className="space-y-6">
                <Select 
                  label="Select Skier"
                  value={skierId}
                  onChange={(e) => setSkierId(e.target.value)}
                  options={[
                    { label: '-- Select Skier --', value: '' },
                    ...(skiers?.map(s => ({ 
                      label: `${s.first_name} ${s.surname} - ${s.division || 'No Div'}`, 
                      value: s.id 
                    })) || [])
                  ]}
                />
                
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  <Select 
                    label="Rope Length"
                    value={rope}
                    onChange={(e) => setRope(e.target.value)}
                    options={ROPE_LENGTHS.map(r => ({ label: formatRope(r), value: r }))}
                  />
                  <Select 
                    label="Speed"
                    value={speed}
                    onChange={(e) => setSpeed(e.target.value)}
                    options={SPEEDS.map(s => ({ label: formatSpeed(s), value: s }))}
                  />
                  <Input 
                    label="Round"
                    type="number"
                    min="1"
                    value={round}
                    onChange={(e) => setRound(e.target.value)}
                  />
                </div>
                
                <Button 
                  variant="primary" 
                  size="lg" 
                  className="w-full h-16 text-lg"
                  onClick={handleStartPass}
                  isLoading={createMutation.isPending}
                >
                  <Play className="mr-2 h-6 w-6 fill-current" /> START PASS
                </Button>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-4">
          <h3 className="font-bold text-lg px-1 flex items-center gap-2">
            <User className="w-5 h-5 text-muted-foreground" /> Recent Passes
          </h3>
          {recentPasses.length === 0 ? (
            <Card className="p-8 text-center text-muted-foreground border-dashed">
              No recent passes in this tournament.
            </Card>
          ) : (
            recentPasses.map(pass => (
              <Card key={pass.id} className="p-4 hover:border-primary/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-bold text-sm leading-tight">{pass.skier_name}</p>
                    <p className="text-[11px] text-muted-foreground uppercase font-semibold mt-0.5">
                      R{pass.round_number} • {pass.speed_kph}kph • {pass.rope_length}m
                    </p>
                  </div>
                  <div className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 px-3 py-1 rounded-lg text-center min-w-[3rem]">
                    <p className="text-[10px] uppercase font-bold opacity-80">Score</p>
                    <p className="font-display font-black text-lg leading-none">{pass.buoys_scored ?? '-'}</p>
                  </div>
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
