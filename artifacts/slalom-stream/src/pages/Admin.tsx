import React, { useState, useEffect } from 'react';
import { useAppStore } from '@/lib/store';
import { useListSkiers, useCreateSkier, useListJudges, useCreateJudge, useVerifyAdminPin } from '@workspace/api-client-react';
import { Card, Button, PageHeader, Input, Select, Badge } from '@/components/ui/shared';
import { Settings, Shield, UserPlus, Radio, CheckCircle2, XCircle, Copy, RefreshCw, Trash2, Key, Waves, Plug, PlugZap, Download, Globe, AlertCircle, ChevronDown, ChevronUp, Eye, EyeOff, Wand2, ShieldCheck } from 'lucide-react';
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
          <form onSubmit={handleLogin} className="space-y-4" autoComplete="off">
            <Input
              type="password"
              autoComplete="new-password"
              name="admin-pin-field"
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
      <OfficialsPinsPanel />

      {!activeTournamentId ? (
        <Card className="p-8 text-center text-muted-foreground">Select an active tournament from the Home page to manage its roster and judges.</Card>
      ) : (
        <>
          <EmsImportPanel tournamentId={activeTournamentId} />
          <div className="grid lg:grid-cols-2 gap-8">
            <SkierManagement tournamentId={activeTournamentId} />
            <JudgeManagement tournamentId={activeTournamentId} />
          </div>
        </>
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
              autoComplete="new-password"
              name="new-admin-pin-field"
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

// ─── IWWF EMS Import Panel ─────────────────────────────────────────────────────
interface EmsParticipant {
  first_name: string;
  surname: string;
  country: string;
  category: string;
  division: string;
  yob: number | null;
  events: string[];
}
interface EmsResult {
  code: string;
  name: string;
  site: string;
  date: string;
  details_url: string;
  participant_count: number;
  participants: EmsParticipant[];
}

function EmsImportPanel({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createSkier = useCreateSkier({ mutation: {} });

  const [open, setOpen] = useState(false);
  const [code, setCode] = useState('');
  const [result, setResult] = useState<EmsResult | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchHint, setFetchHint] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [importing, setImporting] = useState(false);
  const [imported, setImported] = useState<number>(0);

  const fetchEms = async () => {
    if (!code.trim()) return;
    setFetching(true);
    setFetchError(null);
    setFetchHint(null);
    setResult(null);
    setSelected(new Set());
    setImported(0);
    try {
      const res = await fetch(`/api/ems/search?code=${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        if (data.hint) setFetchHint(data.hint);
        throw new Error(data.error || 'EMS lookup failed');
      }
      setResult(data);
      // Select all slalom participants by default
      const slalomIdxs = data.participants
        .map((_p: EmsParticipant, i: number) => i)
        .filter((i: number) => data.participants[i].events.includes('Slalom'));
      setSelected(new Set(slalomIdxs.length > 0 ? slalomIdxs : data.participants.map((_p: EmsParticipant, i: number) => i)));
    } catch (err: any) {
      setFetchError(err.message);
    } finally {
      setFetching(false);
    }
  };

  const toggleAll = () => {
    if (result) {
      if (selected.size === result.participants.length) setSelected(new Set());
      else setSelected(new Set(result.participants.map((_, i) => i)));
    }
  };

  const importSelected = async () => {
    if (!result) return;
    setImporting(true);
    let count = 0;
    const toImport = result.participants.filter((_, i) => selected.has(i));
    for (const p of toImport) {
      try {
        await new Promise<void>((resolve, reject) => {
          createSkier.mutate({
            id: tournamentId,
            data: {
              first_name: p.first_name || 'Unknown',
              surname: p.surname || p.first_name,
              division: p.division,
              country: p.country || 'NZL',
            }
          }, { onSuccess: () => { count++; resolve(); }, onError: reject });
        });
      } catch {
        // skip duplicates
      }
    }
    setImported(count);
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'skiers'] });
    toast({ title: `Imported ${count} of ${toImport.length} participants`, description: `From EMS: ${result.name}` });
  };

  return (
    <Card className="overflow-hidden border-blue-200 dark:border-blue-900">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-4 hover:bg-muted/40 transition-colors"
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center">
            <Globe className="w-4 h-4 text-blue-600 dark:text-blue-400" />
          </div>
          <div className="text-left">
            <p className="font-bold text-sm">Import from IWWF EMS</p>
            <p className="text-[11px] text-muted-foreground">Bulk-import participants from ems.iwwf.sport using a tournament sanction code</p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t p-5 space-y-4">
          {/* Code search */}
          <div className="flex gap-2">
            <div className="flex-1">
              <Input
                label="EMS Code or Competition URL"
                placeholder="26NZL018  or  paste full ems.iwwf.sport URL"
                value={code}
                onChange={e => setCode(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') fetchEms(); }}
              />
            </div>
            <div className="flex items-end">
              <Button
                variant="primary"
                onClick={fetchEms}
                isLoading={fetching}
                disabled={!code.trim()}
                className="mb-0.5"
              >
                Search
              </Button>
            </div>
          </div>

          <p className="text-xs text-muted-foreground">
            Enter a sanction code (e.g. <strong>26NZL018</strong>) or paste the full competition URL from ems.iwwf.sport. Slalom participants are pre-selected automatically.
          </p>

          {/* Error */}
          {fetchError && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <span>{fetchError}</span>
              </div>
              {fetchHint && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-800 text-xs">
                  <p className="font-bold mb-1">Tip:</p>
                  <p>{fetchHint}</p>
                </div>
              )}
            </div>
          )}

          {/* Results */}
          {result && (
            <div className="space-y-4">
              {/* Competition info */}
              <div className="p-3 bg-blue-50 dark:bg-blue-950/30 rounded-xl border border-blue-100 dark:border-blue-900">
                <p className="font-bold text-sm text-blue-900 dark:text-blue-100">{result.name}</p>
                <div className="flex flex-wrap gap-3 mt-1 text-xs text-blue-700 dark:text-blue-300">
                  {result.site && <span>📍 {result.site}</span>}
                  {result.date && <span>📅 {result.date}</span>}
                  <span className="font-mono bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded">{result.code}</span>
                </div>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">{result.participant_count} participants found</p>
              </div>

              {/* Participant list */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <p className="text-sm font-bold">{selected.size} of {result.participants.length} selected</p>
                  <button onClick={toggleAll} className="text-xs text-primary hover:underline font-medium">
                    {selected.size === result.participants.length ? 'Deselect all' : 'Select all'}
                  </button>
                </div>
                <div className="max-h-72 overflow-y-auto rounded-xl border divide-y">
                  {result.participants.map((p, i) => (
                    <label key={i} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${!selected.has(i) ? 'opacity-50' : ''}`}>
                      <input
                        type="checkbox"
                        checked={selected.has(i)}
                        onChange={() => setSelected(prev => {
                          const next = new Set(prev);
                          next.has(i) ? next.delete(i) : next.add(i);
                          return next;
                        })}
                        className="rounded accent-primary"
                      />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold truncate">
                          {p.first_name} {p.surname}
                          <span className="text-[10px] text-muted-foreground ml-1">{p.country}</span>
                        </p>
                        <p className="text-[11px] text-muted-foreground">{p.division}</p>
                      </div>
                      <div className="flex gap-1 flex-shrink-0">
                        {p.events.map(ev => (
                          <span key={ev} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ev === 'Slalom' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                            {ev[0]}
                          </span>
                        ))}
                      </div>
                    </label>
                  ))}
                </div>
              </div>

              {imported > 0 && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 rounded-xl border border-emerald-200 text-emerald-700 font-medium text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {imported} participants added to tournament roster
                </div>
              )}

              <Button
                variant="primary"
                onClick={importSelected}
                isLoading={importing}
                disabled={selected.size === 0 || importing}
                className="w-full flex items-center justify-center gap-2"
              >
                <Download className="w-4 h-4" />
                Import {selected.size} Participant{selected.size !== 1 ? 's' : ''} into Tournament
              </Button>
            </div>
          )}
        </div>
      )}
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

type Official = {
  id: number;
  first_name: string;
  surname: string;
  region: string;
  slalom_grade: string | null;
  pin: string | null;
  judge_role: string | null;
  is_admin: boolean;
  is_active: boolean;
};

function OfficialsPinsPanel() {
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: officials = [], isLoading, refetch } = useQuery<Official[]>({
    queryKey: ['officials'],
    queryFn: async () => { const r = await fetch('/api/officials'); return r.json(); },
  });

  const active = officials.filter(o => o.is_active).sort((a, b) => a.surname.localeCompare(b.surname));
  const withPin = active.filter(o => o.pin).length;
  const withoutPin = active.length - withPin;

  const [revealAll, setRevealAll] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editPin, setEditPin] = useState('');
  const [saving, setSaving] = useState(false);
  const [autoAssigning, setAutoAssigning] = useState(false);
  const [lastAutoCount, setLastAutoCount] = useState<number | null>(null);

  const handleAutoAssign = async () => {
    setAutoAssigning(true);
    setLastAutoCount(null);
    try {
      const r = await fetch('/api/officials/auto-assign-pins', { method: 'POST' });
      const data = await r.json();
      setLastAutoCount(data.assigned);
      toast({ title: `PINs auto-assigned to ${data.assigned} official${data.assigned !== 1 ? 's' : ''}` });
      refetch();
    } catch {
      toast({ title: 'Auto-assign failed', variant: 'destructive' });
    } finally {
      setAutoAssigning(false);
    }
  };

  const openEdit = (o: Official) => {
    setEditingId(o.id);
    setEditPin(o.pin ?? '');
  };

  const savePin = async (official: Official) => {
    setSaving(true);
    try {
      const r = await fetch(`/api/officials/${official.id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: editPin }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated = await r.json();
      queryClient.setQueryData<Official[]>(['officials'], prev =>
        prev ? prev.map(o => o.id === updated.id ? updated : o) : prev
      );
      toast({ title: 'PIN updated' });
      setEditingId(null);
    } catch (e: any) {
      toast({ title: e.message || 'Save failed', variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  const toggleAdmin = async (official: Official) => {
    const newVal = !official.is_admin;
    try {
      const r = await fetch(`/api/officials/${official.id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_admin: newVal }),
      });
      if (!r.ok) throw new Error(await r.text());
      const updated = await r.json();
      queryClient.setQueryData<Official[]>(['officials'], prev =>
        prev ? prev.map(o => o.id === updated.id ? updated : o) : prev
      );
      toast({ title: newVal ? `${official.first_name} ${official.surname} is now an admin` : 'Admin access removed' });
    } catch (e: any) {
      toast({ title: e.message || 'Save failed', variant: 'destructive' });
    }
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-5 border-b bg-muted/30 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Key className="w-5 h-5 text-primary" />
          <div>
            <h3 className="font-bold text-base">Officials PINs</h3>
            <p className="text-xs text-muted-foreground mt-0.5">
              {withPin} of {active.length} officials have a PIN
              {withoutPin > 0 && <span className="text-amber-600 font-semibold"> · {withoutPin} without</span>}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setRevealAll(v => !v)}
            className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
          >
            {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
            {revealAll ? 'Hide PINs' : 'Reveal PINs'}
          </button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleAutoAssign}
            isLoading={autoAssigning}
            className="flex items-center gap-1.5"
          >
            <Wand2 className="w-3.5 h-3.5" />
            Auto-assign PINs
          </Button>
        </div>
      </div>

      {lastAutoCount !== null && lastAutoCount > 0 && (
        <div className="px-5 py-3 bg-emerald-50 dark:bg-emerald-900/20 border-b border-emerald-200 dark:border-emerald-800 flex items-center gap-2 text-emerald-700 dark:text-emerald-300 text-sm font-medium">
          <CheckCircle2 className="w-4 h-4" />
          {lastAutoCount} new PINs generated — reveal and distribute to officials
        </div>
      )}

      {isLoading ? (
        <div className="p-8 text-center text-muted-foreground">Loading…</div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Grade</th>
                <th className="px-4 py-3">Region</th>
                <th className="px-4 py-3">PIN</th>
                <th className="px-4 py-3 text-center">Admin</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {active.map(o => (
                <tr key={o.id} className={`hover:bg-muted/30 transition-colors ${o.is_admin ? 'bg-primary/5' : ''}`}>
                  <td className="px-4 py-2.5 font-semibold whitespace-nowrap">
                    {o.first_name} {o.surname}
                    {o.is_admin && (
                      <span className="ml-2 inline-flex items-center gap-1 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                        <ShieldCheck className="w-2.5 h-2.5" /> Admin
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{o.slalom_grade ?? '—'}</td>
                  <td className="px-4 py-2.5 text-muted-foreground text-xs">{o.region}</td>
                  <td className="px-4 py-2.5">
                    {editingId === o.id ? (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          inputMode="numeric"
                          maxLength={6}
                          autoFocus
                          autoComplete="new-password"
                          name={`pin-edit-${o.id}`}
                          className="h-8 w-20 border border-input rounded-lg px-2 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
                          placeholder="1234"
                          value={editPin}
                          onChange={e => setEditPin(e.target.value)}
                        />
                        <button
                          onClick={() => savePin(o)}
                          disabled={saving}
                          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded-lg font-bold disabled:opacity-50"
                        >
                          {saving ? '…' : 'Save'}
                        </button>
                        <button
                          onClick={() => setEditingId(null)}
                          className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        {o.pin ? (
                          <span className="font-mono text-sm bg-muted px-2 py-0.5 rounded tracking-widest">
                            {revealAll ? o.pin : '••••'}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground italic">no PIN</span>
                        )}
                        <button
                          onClick={() => openEdit(o)}
                          className="text-[11px] text-primary hover:underline font-semibold"
                        >
                          {o.pin ? 'Change' : 'Set PIN'}
                        </button>
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-center">
                    <button
                      onClick={() => toggleAdmin(o)}
                      title={o.is_admin ? 'Remove admin access' : 'Grant admin access (uses their judge PIN)'}
                      className={`w-5 h-5 rounded border-2 flex items-center justify-center mx-auto transition-colors ${
                        o.is_admin
                          ? 'bg-primary border-primary text-primary-foreground'
                          : 'border-border bg-background hover:border-primary/50'
                      }`}
                    >
                      {o.is_admin && <CheckCircle2 className="w-3 h-3" />}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="px-5 py-3 border-t bg-muted/20">
        <p className="text-xs text-muted-foreground">
          <strong>Auto-assign PINs</strong> generates a unique 4-digit PIN for every official who doesn't have one.
          Toggle <strong>Admin</strong> to let an official log into this Admin panel using their judge PIN.
          PINs are used to log into the Judging page — hand them to each official before the tournament.
        </p>
      </div>
    </Card>
  );
}

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
        <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end mb-6" autoComplete="off">
          <Input
            label="Full Name"
            required
            autoComplete="off"
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
              autoComplete="new-password"
              name="judge-new-pin-field"
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
              {judges?.map(j => {
                const isOfficial = (j as any).is_official;
                return (
                  <tr key={j.id} className={`hover:bg-muted/50 group ${isOfficial ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3 font-semibold">
                      {j.name}
                      {isOfficial && (
                        <span className="ml-2 text-[10px] font-bold text-primary bg-primary/10 px-1.5 py-0.5 rounded uppercase tracking-wide">
                          Officials Register
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <Badge variant="outline" className="font-semibold">{ROLE_LABELS[j.judge_role] ?? j.judge_role}</Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs">
                      {isOfficial ? ((j as any).slalom_grade || '—') : ((j as any).judge_level || '—')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      {isOfficial
                        ? <CheckCircle2 className="w-4 h-4 text-primary mx-auto" />
                        : j.pin
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          : <XCircle className="w-4 h-4 text-muted-foreground mx-auto" />
                      }
                    </td>
                    <td className="px-4 py-3 text-right">
                      {!isOfficial && (
                        <button
                          onClick={() => deleteJudge(j.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!judges || judges.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No judges in the register. Add judges above.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Manually added judges above are specific to this tournament. Officials from the NZTWSA Register with a PIN set (configured on the Officials page) appear automatically in all tournaments — shown above with the "Officials Register" badge.
        </p>
      </div>
    </Card>
  );
}
