import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useListSkiers, useCreateSkier, useListJudges, useCreateJudge, useVerifyAdminPin } from '@workspace/api-client-react';
import { Card, Button, PageHeader, Input, Select, Badge } from '@/components/ui/shared';
import { Settings, Shield, UserPlus, Radio, CheckCircle2, XCircle, Copy, RefreshCw, Trash2, Key, Waves, Plug, PlugZap } from 'lucide-react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { DIVISIONS, JUDGE_ROLES } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function Admin() {
  const { adminPinValid, setAdminPinValid, activeTournamentId } = useAppStore();
  const [pinInput, setPinInput] = useState('');
  const { toast } = useToast();
  const verifyMutation = useVerifyAdminPin();

  if (!adminPinValid) {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      verifyMutation.mutate({ data: { pin: pinInput } }, {
        onSuccess: (res) => {
          if (res.valid) {
            setAdminPinValid(true);
            toast({ title: "Admin Access Granted" });
          } else {
            toast({ title: "Invalid PIN", variant: "destructive" });
          }
        }
      });
    };

    return (
      <div className="max-w-md mx-auto mt-20">
        <Card className="p-8 text-center border-t-4 border-t-primary shadow-2xl">
          <Shield className="w-16 h-16 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-display font-bold mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground mb-8">Enter the master admin PIN to manage tournament settings.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input
              type="password"
              className="text-center tracking-widest text-2xl h-14 font-mono"
              placeholder="••••"
              value={pinInput}
              onChange={e => setPinInput(e.target.value)}
            />
            <Button variant="primary" className="w-full h-12" isLoading={verifyMutation.isPending}>Authenticate</Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader
        title="Admin Control Panel"
        actions={<Button variant="outline" onClick={() => setAdminPinValid(false)}>Lock Admin</Button>}
      />

      <AppSettingsPanel />
      <SurePathPanel />

      {!activeTournamentId ? (
        <Card className="p-8 text-center text-muted-foreground">Select an active tournament from the Home page to manage its roster and judges.</Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          <SkierManagement tournamentId={activeTournamentId} />
          <JudgeManagement tournamentId={activeTournamentId} />
        </div>
      )}
    </div>
  );
}

function AppSettingsPanel() {
  const { toast } = useToast();
  const { data: settings, refetch } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => {
      const res = await fetch('/api/settings');
      return res.json();
    },
  });
  const { data: wscStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['wsc-status'],
    queryFn: async () => {
      const res = await fetch('/api/waterskiconnect/status');
      return res.json();
    },
    refetchInterval: 10000,
  });

  const [adminPin, setAdminPin] = useState('');
  const [wscEnabled, setWscEnabled] = useState(false);
  const [wscToken, setWscToken] = useState('');

  useEffect(() => {
    if (settings) {
      setWscEnabled(settings.waterskiconnect_enabled ?? false);
      setWscToken(settings.waterskiconnect_token ?? '');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Settings saved" });
      refetch();
      refetchStatus();
    },
  });

  const webhookUrl = `${window.location.origin}/api/waterskiconnect/inbound`;

  return (
    <div className="space-y-6">
      {/* Admin PIN */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b bg-muted/30 flex items-center gap-3">
          <Key className="w-5 h-5 text-primary" />
          <h3 className="font-bold text-base">Admin PIN</h3>
        </div>
        <div className="p-5">
          <div className="flex gap-3 items-end max-w-xs">
            <Input
              label="New Admin PIN (4 digits)"
              type="password"
              maxLength={4}
              placeholder="Leave blank to keep existing"
              value={adminPin}
              onChange={e => setAdminPin(e.target.value)}
              className="font-mono tracking-widest h-10"
            />
            <Button
              variant="primary"
              className="h-10 px-5 shrink-0"
              isLoading={saveMutation.isPending}
              onClick={() => saveMutation.mutate({ admin_pin: adminPin || undefined })}
            >
              Save
            </Button>
          </div>
          <p className="text-xs text-muted-foreground mt-2">
            If no PIN is set, the Admin panel is open to anyone. Set a PIN before deploying at a venue.
          </p>
        </div>
      </Card>

      {/* WaterskiConnect */}
      <Card className="overflow-hidden">
        <div className="p-5 border-b bg-muted/30 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Radio className="w-5 h-5 text-primary" />
            <h3 className="font-bold text-base">WaterskiConnect</h3>
          </div>
          <div className="flex items-center gap-2">
            {wscStatus?.webhook?.enabled ? (
              <Badge variant="success" className="flex items-center gap-1">
                <CheckCircle2 className="w-3 h-3" /> Enabled
              </Badge>
            ) : (
              <Badge variant="outline" className="text-muted-foreground flex items-center gap-1">
                <XCircle className="w-3 h-3" /> Disabled
              </Badge>
            )}
          </div>
        </div>
        <div className="p-5 space-y-5">
          <p className="text-sm text-muted-foreground">
            When enabled, boat-side scoring software can POST pass data to the inbound webhook URL below.
            SlalomStream will automatically create the pass in the active tournament.
          </p>

          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <div
                onClick={() => {
                  setWscEnabled(v => !v);
                  saveMutation.mutate({ waterskiconnect_enabled: !wscEnabled, waterskiconnect_token: wscToken });
                }}
                className={`relative w-10 h-6 rounded-full transition-colors ${wscEnabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
              >
                <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${wscEnabled ? 'translate-x-4' : ''}`} />
              </div>
              <span className="font-semibold text-sm">{wscEnabled ? 'Integration enabled' : 'Integration disabled'}</span>
            </label>
          </div>

          {wscEnabled && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Inbound Webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-xs font-mono break-all">{webhookUrl}</code>
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={() => {
                      navigator.clipboard.writeText(webhookUrl);
                      toast({ title: "Copied to clipboard" });
                    }}
                  >
                    <Copy className="w-3.5 h-3.5" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground mt-1">Configure your boat/scoring software to POST to this URL when a pass begins.</p>
              </div>

              <div className="flex gap-3 items-end">
                <Input
                  label="Shared Secret Token (optional)"
                  type="text"
                  placeholder="e.g. my-secure-token-2026"
                  value={wscToken}
                  onChange={e => setWscToken(e.target.value)}
                  className="h-10 font-mono"
                />
                <Button
                  variant="primary"
                  className="h-10 px-5 shrink-0"
                  isLoading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ waterskiconnect_enabled: wscEnabled, waterskiconnect_token: wscToken })}
                >
                  Save
                </Button>
              </div>

              <div className="p-4 bg-muted/50 rounded-xl border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Connection Status</p>
                  <button onClick={() => refetchStatus()} className="text-muted-foreground hover:text-foreground transition-colors">
                    <RefreshCw className="w-3.5 h-3.5" />
                  </button>
                </div>
                <div className="space-y-1 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Passes received</span>
                    <span className="font-mono font-bold">{wscStatus?.webhook?.inbound_count ?? 0}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Last inbound</span>
                    <span className="font-mono text-xs">
                      {wscStatus?.webhook?.last_inbound?.ts
                        ? new Date(wscStatus.webhook.last_inbound.ts).toLocaleTimeString()
                        : 'Never'}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </Card>
    </div>
  );
}

function SurePathPanel() {
  const { toast } = useToast();

  const { data: settings, refetch } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => { const r = await fetch('/api/settings'); return r.json(); },
  });

  const { data: wscStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['wsc-status'],
    queryFn: async () => { const r = await fetch('/api/waterskiconnect/status'); return r.json(); },
    refetchInterval: 5000,
  });

  const [enabled, setEnabled]     = useState(false);
  const [eventName, setEventName] = useState('');
  const [subId, setSubId]         = useState('');
  const [pin, setPin]             = useState('');
  const [wsUrl, setWsUrl]         = useState('wss://waterskiconnect.com/ws');

  useEffect(() => {
    if (settings) {
      setEnabled(settings.surepath_enabled ?? false);
      setEventName(settings.surepath_event_name ?? '');
      setSubId(settings.surepath_event_sub_id ?? '');
      setPin(settings.surepath_observer_pin ?? '');
      setWsUrl(settings.waterskiconnect_url ?? 'wss://waterskiconnect.com/ws');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const r = await fetch('/api/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      return r.json();
    },
    onSuccess: () => { toast({ title: "SurePath settings saved" }); refetch(); refetchStatus(); },
  });

  const reconnectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/waterskiconnect/surepath/connect', { method: 'POST' });
      return r.json();
    },
    onSuccess: () => { toast({ title: "Reconnecting to WaterskiConnect…" }); refetchStatus(); },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/waterskiconnect/surepath/disconnect', { method: 'POST' });
      return r.json();
    },
    onSuccess: () => { toast({ title: "Disconnected from WaterskiConnect" }); refetchStatus(); },
  });

  const sp = wscStatus?.surepath;
  const isConnected = sp?.connected;
  const isConnecting = sp?.connecting;

  const save = () => saveMutation.mutate({
    surepath_enabled: enabled,
    surepath_event_name: eventName || null,
    surepath_event_sub_id: subId || null,
    surepath_observer_pin: pin || null,
    waterskiconnect_url: wsUrl || null,
  });

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b bg-muted/30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Waves className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-bold text-base">SurePath Live Integration</h3>
            <p className="text-xs text-muted-foreground">Auto-create passes when SurePath boat speed exceeds 30 km/h</p>
          </div>
        </div>
        <div>
          {isConnected && (
            <Badge variant="success" className="flex items-center gap-1 text-xs">
              <PlugZap className="w-3 h-3" /> Live
            </Badge>
          )}
          {isConnecting && (
            <Badge variant="outline" className="flex items-center gap-1 text-xs text-amber-600 border-amber-300">
              <Plug className="w-3 h-3 animate-pulse" /> Connecting…
            </Badge>
          )}
          {!isConnected && !isConnecting && (
            <Badge variant="outline" className="flex items-center gap-1 text-xs text-muted-foreground">
              <XCircle className="w-3 h-3" /> Offline
            </Badge>
          )}
        </div>
      </div>

      <div className="p-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          SurePath communicates with scoring apps via the <strong>WaterskiConnect</strong> server.
          SlalomStream connects as an observer using the same Event Name and Sub ID as your SurePath rover.
          The Observer PIN is displayed in your scoring software (WSTIMS / Lion).
        </p>

        {/* Enable toggle */}
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <div
              onClick={() => { const next = !enabled; setEnabled(next); saveMutation.mutate({ surepath_enabled: next, surepath_event_name: eventName||null, surepath_event_sub_id: subId||null, surepath_observer_pin: pin||null, waterskiconnect_url: wsUrl||null }); }}
              className={`relative w-10 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
            >
              <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
            </div>
            <span className="font-semibold text-sm">{enabled ? 'SurePath integration enabled' : 'SurePath integration disabled'}</span>
          </label>
        </div>

        {/* Config fields */}
        <div className="grid sm:grid-cols-2 gap-4">
          <Input
            label="Event Name"
            placeholder="e.g. 26NZL0001 or MyLake2026"
            value={eventName}
            onChange={e => setEventName(e.target.value)}
            className="h-10 font-mono"
          />
          <Input
            label="Event Sub ID (leave blank for single lake)"
            placeholder="e.g. Lake1"
            value={subId}
            onChange={e => setSubId(e.target.value)}
            className="h-10 font-mono"
          />
          <Input
            label="Observer PIN (from scoring software)"
            type="password"
            placeholder="As shown in WSTIMS / Lion"
            value={pin}
            onChange={e => setPin(e.target.value)}
            className="h-10 font-mono tracking-widest"
          />
          <Input
            label="WaterskiConnect Server URL"
            placeholder="wss://waterskiconnect.com/ws"
            value={wsUrl}
            onChange={e => setWsUrl(e.target.value)}
            className="h-10 font-mono text-xs"
          />
        </div>

        <div className="flex flex-wrap gap-3">
          <Button variant="primary" isLoading={saveMutation.isPending} onClick={save}>Save Settings</Button>
          {enabled && (
            <>
              <Button variant="outline" isLoading={reconnectMutation.isPending} onClick={() => reconnectMutation.mutate()}>
                <RefreshCw className="w-4 h-4 mr-2" /> Reconnect
              </Button>
              {isConnected && (
                <Button variant="outline" isLoading={disconnectMutation.isPending} onClick={() => disconnectMutation.mutate()} className="text-destructive hover:bg-destructive/10">
                  Disconnect
                </Button>
              )}
            </>
          )}
        </div>

        {/* Status panel */}
        {enabled && (
          <div className="p-4 bg-muted/50 rounded-xl border space-y-2">
            <div className="flex items-center justify-between mb-1">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Connection Status</p>
              <button onClick={() => refetchStatus()} className="text-muted-foreground hover:text-foreground">
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1 text-sm">
              <span className="text-muted-foreground">Status</span>
              <span className="font-mono font-bold">
                {isConnected ? '🟢 Connected' : isConnecting ? '🟡 Connecting…' : '🔴 Disconnected'}
              </span>
              {sp?.connectedAt && (
                <>
                  <span className="text-muted-foreground">Connected since</span>
                  <span className="font-mono text-xs">{new Date(sp.connectedAt).toLocaleTimeString()}</span>
                </>
              )}
              {sp?.eventName && (
                <>
                  <span className="text-muted-foreground">Event</span>
                  <span className="font-mono text-xs">{sp.eventName}</span>
                </>
              )}
              <span className="text-muted-foreground">Passes auto-created</span>
              <span className="font-mono font-bold">{sp?.passesCreated ?? 0}</span>
              {sp?.lastMessage && (
                <>
                  <span className="text-muted-foreground">Last message</span>
                  <span className="font-mono text-xs">{sp.lastMessage.type} at {new Date(sp.lastMessage.ts).toLocaleTimeString()}</span>
                </>
              )}
              {sp?.error && (
                <>
                  <span className="text-muted-foreground">Error</span>
                  <span className="text-destructive text-xs font-mono">{sp.error}</span>
                </>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
          <strong>Setup in SurePath:</strong> Select Boat Lane Mode → Tournament Settings → set Scoring Server to "WaterskiConnect", then enter the same Event Name and Sub ID here. The Observer PIN is displayed once connected in your scoring software.
        </p>
      </div>
    </Card>
  );
}

function SkierManagement({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { data: skiers } = useListSkiers(tournamentId);
  const createMutation = useCreateSkier({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'skiers'] }) }
  });

  const [form, setForm] = useState({ first_name: '', surname: '', division: DIVISIONS[0] });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      id: tournamentId,
      data: { ...form, is_financial: true }
    }, {
      onSuccess: () => setForm({ first_name: '', surname: '', division: DIVISIONS[0] })
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-6 border-b bg-muted/30 flex items-center gap-2">
        <UserPlus className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-lg">Skier Roster</h3>
        <Badge variant="outline" className="ml-auto">{skiers?.length ?? 0} skiers</Badge>
      </div>
      <div className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 items-end mb-6">
          <Input label="First Name" required value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} className="h-10" />
          <Input label="Last Name" required value={form.surname} onChange={e => setForm({...form, surname: e.target.value})} className="h-10" />
          <Select label="Div" value={form.division} onChange={e => setForm({...form, division: e.target.value})} options={DIVISIONS.map(d => ({ label: d, value: d }))} className="h-10" />
          <Button variant="primary" type="submit" isLoading={createMutation.isPending} className="h-10 px-6 shrink-0">Add</Button>
        </form>

        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">#</th>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Division</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {skiers?.map((s, i) => (
                <tr key={s.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{i + 1}</td>
                  <td className="px-4 py-3 font-semibold">{s.first_name} {s.surname}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{s.division}</Badge></td>
                </tr>
              ))}
              {(!skiers || skiers.length === 0) && (
                <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No skiers added yet.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

const ROLE_LABELS: Record<string, string> = {
  judge_a: 'Judge A',
  judge_b: 'Judge B',
  boat_judge: 'Boat Judge',
  judge_c: 'Judge C',
  judge_d: 'Judge D',
  judge_e: 'Judge E',
  chief_judge: 'Chief Judge',
};

function JudgeManagement({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: judges } = useListJudges(tournamentId);
  const createMutation = useCreateJudge({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'judges'] }) }
  });

  const [form, setForm] = useState({ name: '', judge_role: JUDGE_ROLES[0], judge_level: '', pin: '' });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      id: tournamentId,
      data: { ...form, is_active: true }
    }, {
      onSuccess: () => {
        setForm({ name: '', judge_role: JUDGE_ROLES[0], judge_level: '', pin: '' });
        toast({ title: "Judge created" });
      }
    });
  };

  const deleteJudge = async (judgeId: number) => {
    await fetch(`/api/judges/${judgeId}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'judges'] });
    toast({ title: "Judge removed" });
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-6 border-b bg-muted/30 flex items-center gap-2">
        <Settings className="w-5 h-5 text-primary" />
        <h3 className="font-bold text-lg">Judge Register</h3>
        <Badge variant="outline" className="ml-auto">{judges?.length ?? 0} judges</Badge>
      </div>
      <div className="p-6">
        <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end mb-6">
          <Input
            label="Full Name"
            required
            value={form.name}
            onChange={e => setForm({...form, name: e.target.value})}
            className="h-10 col-span-2 sm:col-span-1"
          />
          <Select
            label="Role"
            value={form.judge_role}
            onChange={e => setForm({...form, judge_role: e.target.value})}
            options={JUDGE_ROLES.map(r => ({ label: ROLE_LABELS[r] ?? r, value: r }))}
            className="h-10"
          />
          <Input
            label="Level (opt.)"
            placeholder="e.g. Grade 1"
            value={form.judge_level}
            onChange={e => setForm({...form, judge_level: e.target.value})}
            className="h-10"
          />
          <div className="flex gap-2 items-end col-span-2 sm:col-span-1">
            <Input
              label="PIN"
              type="password"
              maxLength={4}
              required
              value={form.pin}
              onChange={e => setForm({...form, pin: e.target.value})}
              className="h-10 font-mono tracking-widest w-20"
              placeholder="1234"
            />
            <Button variant="primary" type="submit" isLoading={createMutation.isPending} className="h-10 px-4 shrink-0">Add</Button>
          </div>
        </form>

        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3 text-center">PIN</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {judges?.map(j => (
                <tr key={j.id} className="hover:bg-muted/50 group">
                  <td className="px-4 py-3 font-semibold">{j.name}</td>
                  <td className="px-4 py-3">
                    <Badge variant="outline" className="font-semibold">{ROLE_LABELS[j.judge_role] ?? j.judge_role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-muted-foreground text-xs">{(j as any).judge_level || '—'}</td>
                  <td className="px-4 py-3 text-center">
                    {j.pin
                      ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                      : <XCircle className="w-4 h-4 text-muted-foreground mx-auto" />
                    }
                  </td>
                  <td className="px-4 py-3 text-right">
                    <button
                      onClick={() => deleteJudge(j.id)}
                      className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {(!judges || judges.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No judges in the register. Add judges above.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Each judge needs a unique 4-digit PIN to log in on the Judge tab. Hover a row to reveal the delete button.
        </p>
      </div>
    </Card>
  );
}
