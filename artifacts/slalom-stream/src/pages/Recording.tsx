import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useGetTournament, useListSkiers, useListPasses, useCreatePass, useUpdatePass } from '@workspace/api-client-react';
import { Card, Button, Badge, PageHeader, Select, Input } from '@/components/ui/shared';
import { Play, SquareSquare, Timer, User, Wifi, ChevronDown, ChevronUp } from 'lucide-react';
import { ROPE_LENGTHS, SPEEDS, formatRope, formatSpeed } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG } from 'qrcode.react';

interface NetworkInfo {
  addresses: { name: string; address: string; family: string }[];
  port: string;
  urls: string[];
}

function useNetworkInfo() {
  return useQuery<NetworkInfo>({
    queryKey: ['network-info'],
    queryFn: async () => {
      const res = await fetch('/api/network-info');
      if (!res.ok) throw new Error('Failed to fetch network info');
      return res.json();
    },
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

function JudgeConnectPanel() {
  const [open, setOpen] = useState(false);
  const { data: network } = useNetworkInfo();
  const currentUrl = window.location.origin;
  const judgeUrl = `${currentUrl}/judging`;

  const localUrls = network?.urls?.map(u => u.replace(/:\d+$/, '') + window.location.port ? `:${window.location.port}` : '') || [];
  const displayUrl = network?.urls?.[0]
    ? `http://${network.urls[0].split('//')[1].split(':')[0]}:${window.location.port || network.port}/judging`
    : judgeUrl;

  return (
    <Card className="overflow-hidden border-primary/20">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
            <Wifi className="w-4 h-4 text-primary" />
          </div>
          <div className="text-left">
            <p className="font-bold text-sm">Judge Connect</p>
            <p className="text-[11px] text-muted-foreground">Scan QR code to connect judge devices</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t p-5 space-y-4">
          <div className="flex flex-col sm:flex-row gap-6 items-start">
            <div className="flex-shrink-0 p-3 bg-white rounded-2xl shadow-sm border">
              <QRCodeSVG
                value={displayUrl}
                size={160}
                level="M"
                fgColor="#064e3b"
                bgColor="#ffffff"
              />
            </div>
            <div className="space-y-3 flex-1">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Judge URL</p>
                <p className="font-mono text-sm bg-muted px-3 py-2 rounded-lg break-all">{displayUrl}</p>
              </div>
              {network?.urls && network.urls.length > 0 && (
                <div>
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Local Network Addresses</p>
                  <div className="space-y-1">
                    {network.urls.map((url, i) => {
                      const judgeLocal = url.replace(/:\d+$/, `:${window.location.port || network.port}`) + '/judging';
                      return (
                        <p key={i} className="font-mono text-xs bg-emerald-50 text-emerald-800 px-3 py-1.5 rounded-lg">
                          {judgeLocal}
                        </p>
                      );
                    })}
                  </div>
                </div>
              )}
              <div className="pt-1 space-y-1 text-xs text-muted-foreground">
                <p>1. Connect judge devices to the same WiFi network as this computer.</p>
                <p>2. Scan the QR code or type the URL into any browser.</p>
                <p>3. Judges select their name and enter their PIN to log in.</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

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
      data: { status: 'scored' }
    });
  };

  return (
    <div className="space-y-6">
      <PageHeader 
        title="Pass Recording" 
        subtitle="Operator Control Panel" 
        actions={
          <Badge variant={activePass ? "success" : "outline"} className={activePass ? "animate-pulse" : ""}>
            {activePass ? "● SKIER ON WATER" : "STANDBY"}
          </Badge>
        }
      />

      <JudgeConnectPanel />

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
