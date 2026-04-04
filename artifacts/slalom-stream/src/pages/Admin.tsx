import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '@/lib/store';
import { useListSkiers, useCreateSkier, useListJudges, useCreateJudge, useVerifyAdminPin } from '@workspace/api-client-react';
import { Card, Button, PageHeader, Input, Select, Badge } from '@/components/ui/shared';
import {
  Settings, Shield, UserPlus, Radio, CheckCircle2, XCircle, Copy, RefreshCw,
  Trash2, Key, Waves, Plug, PlugZap, Download, Globe, AlertCircle,
  ChevronDown, ChevronUp, Eye, EyeOff, Wand2, ShieldCheck, Wifi,
  Archive, RotateCcw, Pencil, ExternalLink, ClipboardPaste, ArrowRight, ListChecks,
  Monitor, PowerOff, Server,
} from 'lucide-react';
import { useQueryClient, useQuery, useMutation } from '@tanstack/react-query';
import { DIVISIONS, JUDGE_ROLES } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

// ─── Reusable collapsible section ─────────────────────────────────────────────
function AdminSection({
  icon,
  title,
  subtitle,
  badge,
  actions,
  defaultOpen = false,
  borderClass = '',
  children,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  badge?: React.ReactNode;
  actions?: React.ReactNode;
  defaultOpen?: boolean;
  borderClass?: string;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className={`overflow-hidden ${borderClass}`}>
      <div className="flex items-center">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex-1 flex items-center gap-3 px-4 py-3.5 hover:bg-muted/40 transition-colors text-left min-w-0"
        >
          <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center flex-shrink-0 text-primary">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="font-bold text-sm">{title}</p>
              {badge}
            </div>
            {subtitle && (
              <p className="text-[11px] text-muted-foreground leading-tight mt-0.5">{subtitle}</p>
            )}
          </div>
          {open
            ? <ChevronUp className="w-4 h-4 text-muted-foreground flex-shrink-0" />
            : <ChevronDown className="w-4 h-4 text-muted-foreground flex-shrink-0" />
          }
        </button>
        {actions && (
          <div className="flex items-center gap-2 pr-3 flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
      {open && <div className="border-t">{children}</div>}
    </Card>
  );
}

// ─── Admin entry / lock ────────────────────────────────────────────────────────
export default function Admin() {
  const { adminPinValid, setAdminPinValid, setAdminToken, activeTournamentId } = useAppStore();
  const [pinInput, setPinInput] = useState('');
  const { toast } = useToast();
  const verifyMutation = useVerifyAdminPin();

  if (!adminPinValid) {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      verifyMutation.mutate({ data: { pin: pinInput } }, {
        onSuccess: (res: { valid: boolean; token?: string }) => {
          if (res.valid) {
            if (res.token) setAdminToken(res.token);
            setAdminPinValid(true);
            toast({ title: 'Admin Access Granted' });
          } else {
            toast({ title: 'Invalid PIN', variant: 'destructive' });
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
    <div className="space-y-2">
      <PageHeader
        title="Admin Control Panel"
        actions={<Button variant="outline" onClick={() => setAdminPinValid(false)}>Lock Admin</Button>}
      />

      {/* Network status — always visible at the top */}
      <NetworkStatusCard />

      {/* Global settings */}
      <div className="space-y-2">
        <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1 pt-2">System Settings</p>
        <ConnectionModePanel />
        <AppSettingsPanel />
        <SurePathPanel />
        <OfficialsPinsPanel />
        <UpdatePanel />
        <SystemOperationsPanel />
        <TournamentArchive />
      </div>

      {/* Tournament-specific */}
      {!activeTournamentId ? (
        <Card className="p-6 text-center text-muted-foreground border-dashed text-sm mt-4">
          Select an active tournament from the Home page to manage its roster and judges.
        </Card>
      ) : (
        <div className="space-y-2">
          <p className="text-xs font-bold uppercase tracking-widest text-muted-foreground px-1 pt-2">Tournament</p>
          <ScoreCorrections tournamentId={activeTournamentId} />
          <EmsImportPanel tournamentId={activeTournamentId} />
          <SkierManagement tournamentId={activeTournamentId} />
          <JudgeManagement tournamentId={activeTournamentId} />
        </div>
      )}
    </div>
  );
}

// ─── Connection Mode ───────────────────────────────────────────────────────────
function ConnectionModePanel() {
  const { toast } = useToast();

  const { data: settings, refetch } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => { const res = await fetch('/api/settings'); return res.json(); },
  });
  const { data: network } = useQuery({
    queryKey: ['network-info'],
    queryFn: async () => { const r = await fetch('/api/network-info'); return r.json(); },
    refetchInterval: 30000,
    staleTime: 15000,
  });

  const [mode, setMode] = useState<'local' | 'cloud'>('local');
  const [publicUrl, setPublicUrl] = useState('');

  useEffect(() => {
    if (settings) {
      setMode(settings.connection_mode ?? 'local');
      setPublicUrl(settings.public_url ?? '');
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (body: Record<string, unknown>) => {
      const res = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return res.json();
    },
    onSuccess: () => { toast({ title: 'Connection mode saved' }); refetch(); },
  });

  const save = (newMode: 'local' | 'cloud', url?: string) =>
    saveMutation.mutate({ connection_mode: newMode, public_url: url ?? publicUrl ?? null });

  const badge = mode === 'cloud'
    ? <Badge variant="success" className="text-xs flex items-center gap-1"><Globe className="w-2.5 h-2.5" /> Cloud</Badge>
    : <Badge variant="outline" className="text-xs flex items-center gap-1"><Wifi className="w-2.5 h-2.5" /> Local WiFi</Badge>;

  return (
    <AdminSection
      icon={<Wifi className="w-4 h-4" />}
      title="Connection Mode"
      subtitle="How judge devices connect to this server"
      badge={badge}
    >
      <div className="p-5 space-y-4">
        {/* Mode picker */}
        <div className="grid sm:grid-cols-2 gap-3">
          <button
            onClick={() => { setMode('local'); save('local'); }}
            className={`p-4 rounded-xl border-2 text-left transition-all ${mode === 'local' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Wifi className="w-4 h-4 text-primary" />
              <p className="font-bold text-sm">Local WiFi</p>
              {mode === 'local' && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Server runs on a laptop at the venue. All judge devices must join the same WiFi network. No internet required — works anywhere.
            </p>
          </button>
          <button
            onClick={() => setMode('cloud')}
            className={`p-4 rounded-xl border-2 text-left transition-all ${mode === 'cloud' ? 'border-primary bg-primary/5' : 'border-border hover:border-primary/40'}`}
          >
            <div className="flex items-center gap-2 mb-1.5">
              <Globe className="w-4 h-4 text-primary" />
              <p className="font-bold text-sm">Cloud / Online</p>
              {mode === 'cloud' && <CheckCircle2 className="w-4 h-4 text-primary ml-auto" />}
            </div>
            <p className="text-xs text-muted-foreground leading-relaxed">
              Server is deployed to the internet. Judges can connect from <strong>any network</strong> — mobile data, hotel WiFi, etc. Requires internet on every device.
            </p>
          </button>
        </div>

        {/* Local: show detected IPs */}
        {mode === 'local' && network?.urls?.length > 0 && (
          <div className="p-3 bg-muted/50 rounded-xl border space-y-2">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Detected Local Addresses</p>
            {network.urls.map((url: string, i: number) => (
              <div key={i} className="flex items-center gap-2">
                <code className="flex-1 text-xs font-mono bg-background px-2 py-1 rounded border">{url}</code>
                <button
                  onClick={() => { navigator.clipboard.writeText(url); toast({ title: 'Copied' }); }}
                  className="text-muted-foreground hover:text-foreground transition-colors"
                >
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
            <p className="text-xs text-muted-foreground">QR codes on the Recording page point to this address. All devices must be on the same WiFi.</p>
          </div>
        )}

        {/* Cloud: public URL field */}
        {mode === 'cloud' && (
          <div className="space-y-3">
            <div className="flex gap-3 items-end">
              <Input
                label="Public URL"
                placeholder="https://your-app.replit.app"
                value={publicUrl}
                onChange={e => setPublicUrl(e.target.value)}
                className="h-10 font-mono text-xs"
              />
              <Button
                variant="primary"
                className="h-10 px-5 shrink-0"
                isLoading={saveMutation.isPending}
                onClick={() => save('cloud')}
              >
                Save
              </Button>
            </div>
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900 rounded-lg p-3">
              Enter the full public URL where this app is deployed (e.g. your Replit deployment URL).
              QR codes on the Recording page will use this address so judges can connect from any network without needing to be on the same WiFi.
            </p>
          </div>
        )}
      </div>
    </AdminSection>
  );
}

// ─── App Settings ──────────────────────────────────────────────────────────────
function AppSettingsPanel() {
  const { toast } = useToast();
  const { data: settings, refetch } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => { const res = await fetch('/api/settings'); return res.json(); },
  });
  const { data: wscStatus, refetch: refetchStatus } = useQuery({
    queryKey: ['wsc-status'],
    queryFn: async () => { const res = await fetch('/api/waterskiconnect/status'); return res.json(); },
    refetchInterval: 10000,
    staleTime: 5000,
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
    onSuccess: () => { toast({ title: 'Settings saved' }); refetch(); refetchStatus(); },
  });

  const webhookUrl = `${window.location.origin}/api/waterskiconnect/inbound`;

  const wscBadge = wscStatus?.webhook?.enabled
    ? <Badge variant="success" className="flex items-center gap-1 text-xs"><CheckCircle2 className="w-2.5 h-2.5" /> On</Badge>
    : <Badge variant="outline" className="text-muted-foreground text-xs">Off</Badge>;

  return (
    <>
      {/* Admin PIN */}
      <AdminSection icon={<Key className="w-4 h-4" />} title="Admin PIN" subtitle="Master PIN to access this panel">
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
      </AdminSection>

      {/* WaterskiConnect */}
      <AdminSection
        icon={<Radio className="w-4 h-4" />}
        title="WaterskiConnect"
        subtitle="Inbound webhook for boat-side scoring software"
        badge={wscBadge}
      >
        <div className="p-5 space-y-5">
          <p className="text-sm text-muted-foreground">
            When enabled, boat-side scoring software can POST pass data to the inbound webhook URL below.
            SlalomStream will automatically create the pass in the active tournament.
          </p>

          <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
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

          {wscEnabled && (
            <div className="space-y-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">Inbound Webhook URL</p>
                <div className="flex items-center gap-2">
                  <code className="flex-1 bg-muted px-3 py-2 rounded-lg text-xs font-mono break-all">{webhookUrl}</code>
                  <Button variant="outline" size="sm" className="shrink-0"
                    onClick={() => { navigator.clipboard.writeText(webhookUrl); toast({ title: 'Copied to clipboard' }); }}>
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
                <Button variant="primary" className="h-10 px-5 shrink-0" isLoading={saveMutation.isPending}
                  onClick={() => saveMutation.mutate({ waterskiconnect_enabled: wscEnabled, waterskiconnect_token: wscToken })}>
                  Save
                </Button>
              </div>

              <div className="p-4 bg-muted/50 rounded-xl border">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Status</p>
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
      </AdminSection>
    </>
  );
}

// ─── SurePath Panel ────────────────────────────────────────────────────────────
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
      const r = await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      return r.json();
    },
    onSuccess: () => { toast({ title: 'SurePath settings saved' }); refetch(); refetchStatus(); },
  });

  const reconnectMutation = useMutation({
    mutationFn: async () => { const r = await fetch('/api/waterskiconnect/surepath/connect', { method: 'POST' }); return r.json(); },
    onSuccess: () => { toast({ title: 'Reconnecting to WaterskiConnect…' }); refetchStatus(); },
  });

  const disconnectMutation = useMutation({
    mutationFn: async () => { const r = await fetch('/api/waterskiconnect/surepath/disconnect', { method: 'POST' }); return r.json(); },
    onSuccess: () => { toast({ title: 'Disconnected from WaterskiConnect' }); refetchStatus(); },
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

  const badge = isConnected
    ? <Badge variant="success" className="flex items-center gap-1 text-xs"><PlugZap className="w-2.5 h-2.5" /> Live</Badge>
    : isConnecting
      ? <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs flex items-center gap-1"><Plug className="w-2.5 h-2.5 animate-pulse" /> Connecting</Badge>
      : <Badge variant="outline" className="text-muted-foreground text-xs">Offline</Badge>;

  return (
    <AdminSection
      icon={<Waves className="w-4 h-4" />}
      title="SurePath Live"
      subtitle="Auto-create passes when SurePath boat speed exceeds 30 km/h"
      badge={badge}
    >
      <div className="p-5 space-y-5">
        <p className="text-sm text-muted-foreground">
          SurePath communicates with scoring apps via the <strong>WaterskiConnect</strong> server.
          SlalomStream connects as an observer using the same Event Name and Sub ID as your SurePath rover.
          The Observer PIN is displayed in your scoring software (WSTIMS / Lion).
        </p>

        <label className="flex items-center gap-2 cursor-pointer select-none w-fit">
          <div
            onClick={() => { const next = !enabled; setEnabled(next); saveMutation.mutate({ surepath_enabled: next, surepath_event_name: eventName||null, surepath_event_sub_id: subId||null, surepath_observer_pin: pin||null, waterskiconnect_url: wsUrl||null }); }}
            className={`relative w-10 h-6 rounded-full transition-colors ${enabled ? 'bg-primary' : 'bg-muted-foreground/30'}`}
          >
            <div className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-white shadow transition-transform ${enabled ? 'translate-x-4' : ''}`} />
          </div>
          <span className="font-semibold text-sm">{enabled ? 'SurePath integration enabled' : 'SurePath integration disabled'}</span>
        </label>

        <div className="grid sm:grid-cols-2 gap-4">
          <Input label="Event Name" placeholder="e.g. 26NZL0001 or MyLake2026" value={eventName}
            onChange={e => setEventName(e.target.value)} className="h-10 font-mono" />
          <Input label="Event Sub ID (leave blank for single lake)" placeholder="e.g. Lake1" value={subId}
            onChange={e => setSubId(e.target.value)} className="h-10 font-mono" />
          <Input label="Observer PIN (from scoring software)" type="password" placeholder="As shown in WSTIMS / Lion"
            value={pin} onChange={e => setPin(e.target.value)} className="h-10 font-mono tracking-widest" />
          <Input label="WaterskiConnect Server URL" placeholder="wss://waterskiconnect.com/ws"
            value={wsUrl} onChange={e => setWsUrl(e.target.value)} className="h-10 font-mono text-xs" />
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
                <><span className="text-muted-foreground">Connected since</span><span className="font-mono text-xs">{new Date(sp.connectedAt).toLocaleTimeString()}</span></>
              )}
              {sp?.eventName && (
                <><span className="text-muted-foreground">Event</span><span className="font-mono text-xs">{sp.eventName}</span></>
              )}
              <span className="text-muted-foreground">Passes auto-created</span>
              <span className="font-mono font-bold">{sp?.passesCreated ?? 0}</span>
              {sp?.lastMessage && (
                <><span className="text-muted-foreground">Last message</span><span className="font-mono text-xs">{sp.lastMessage.type} at {new Date(sp.lastMessage.ts).toLocaleTimeString()}</span></>
              )}
              {sp?.error && (
                <><span className="text-muted-foreground">Error</span><span className="text-destructive text-xs font-mono">{sp.error}</span></>
              )}
            </div>
          </div>
        )}

        <p className="text-xs text-muted-foreground bg-amber-50 border border-amber-200 rounded-lg p-3">
          <strong>Setup in SurePath:</strong> Select Boat Lane Mode → Tournament Settings → set Scoring Server to "WaterskiConnect", then enter the same Event Name and Sub ID here. The Observer PIN is displayed once connected in your scoring software.
        </p>
      </div>
    </AdminSection>
  );
}

// ─── Officials PINs ────────────────────────────────────────────────────────────
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

  const openEdit = (o: Official) => { setEditingId(o.id); setEditPin(o.pin ?? ''); };

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
      queryClient.setQueryData<Official[]>(['officials'], prev => prev ? prev.map(o => o.id === updated.id ? updated : o) : prev);
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
      queryClient.setQueryData<Official[]>(['officials'], prev => prev ? prev.map(o => o.id === updated.id ? updated : o) : prev);
      toast({ title: newVal ? `${official.first_name} ${official.surname} is now an admin` : 'Admin access removed' });
    } catch (e: any) {
      toast({ title: e.message || 'Save failed', variant: 'destructive' });
    }
  };

  const pinBadge = withoutPin > 0
    ? <Badge variant="outline" className="text-amber-600 border-amber-300 text-xs">{withoutPin} without PIN</Badge>
    : <Badge variant="success" className="text-xs">All have PINs</Badge>;

  const headerActions = (
    <div className="flex items-center gap-2">
      <button
        onClick={() => setRevealAll(v => !v)}
        className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors px-2 py-1.5 rounded-lg hover:bg-muted"
        title={revealAll ? 'Hide PINs' : 'Reveal PINs'}
      >
        {revealAll ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
        <span className="hidden sm:inline">{revealAll ? 'Hide' : 'Reveal'}</span>
      </button>
      <Button variant="primary" size="sm" onClick={handleAutoAssign} isLoading={autoAssigning} className="flex items-center gap-1.5">
        <Wand2 className="w-3.5 h-3.5" />
        <span className="hidden sm:inline">Auto-assign PINs</span>
        <span className="sm:hidden">Auto-PINs</span>
      </Button>
    </div>
  );

  return (
    <AdminSection
      icon={<Key className="w-4 h-4" />}
      title="Officials PINs"
      subtitle={`${withPin} of ${active.length} officials have a PIN`}
      badge={pinBadge}
      actions={headerActions}
    >
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
                        <button onClick={() => savePin(o)} disabled={saving}
                          className="text-xs px-2 py-1 bg-primary text-primary-foreground rounded-lg font-bold disabled:opacity-50">
                          {saving ? '…' : 'Save'}
                        </button>
                        <button onClick={() => setEditingId(null)}
                          className="text-xs px-2 py-1 text-muted-foreground hover:text-foreground">
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
                        <button onClick={() => openEdit(o)} className="text-[11px] text-primary hover:underline font-semibold">
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
                        o.is_admin ? 'bg-primary border-primary text-primary-foreground' : 'border-border bg-background hover:border-primary/50'
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
        </p>
      </div>
    </AdminSection>
  );
}

// ─── IWWF EMS Import ───────────────────────────────────────────────────────────
interface EmsParticipant {
  first_name: string; surname: string; country: string;
  category: string; division: string; yob: number | null; events: string[];
}
interface EmsResult {
  code: string; name: string; site: string; date: string;
  details_url: string; participant_count: number; participants: EmsParticipant[];
}

const EMS_CALENDAR_URL = 'https://ems.iwwf.sport/?Country=NZL&Discipline=Waterski';
const EMS_BASE_URL     = 'https://ems.iwwf.sport';

function EmsImportPanel({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const createSkier = useCreateSkier({ mutation: {} });

  const [guideOpen, setGuideOpen]   = useState(false);
  const [code, setCode]             = useState('');
  const [result, setResult]         = useState<EmsResult | null>(null);
  const [fetching, setFetching]     = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [fetchHint, setFetchHint]   = useState<string | null>(null);
  const [selected, setSelected]     = useState<Set<number>>(new Set());
  const [importing, setImporting]   = useState(false);
  const [imported, setImported]     = useState<number>(0);

  const fetchEms = async () => {
    if (!code.trim()) return;
    setFetching(true); setFetchError(null); setFetchHint(null); setResult(null); setSelected(new Set()); setImported(0);
    try {
      const res = await fetch(`/api/ems/search?code=${encodeURIComponent(code.trim())}`);
      const data = await res.json();
      if (!res.ok) { if (data.hint) setFetchHint(data.hint); throw new Error(data.error || 'EMS lookup failed'); }
      setResult(data);
      const slalomIdxs = data.participants.map((_p: EmsParticipant, i: number) => i).filter((i: number) => data.participants[i].events.includes('Slalom'));
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
            data: { first_name: p.first_name || 'Unknown', surname: p.surname || p.first_name, division: p.division, country: p.country || 'NZL' }
          }, { onSuccess: () => { count++; resolve(); }, onError: reject });
        });
      } catch { /* skip duplicates */ }
    }
    setImported(count);
    setImporting(false);
    queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'skiers'] });
    toast({ title: `Imported ${count} of ${toImport.length} participants`, description: `From EMS: ${result.name}` });
  };

  return (
    <AdminSection
      icon={<Globe className="w-4 h-4" />}
      title="Import from IWWF EMS"
      subtitle="Bulk-import registered participants straight from ems.iwwf.sport"
      borderClass="border-blue-200 dark:border-blue-900"
    >
      <div className="p-5 space-y-5">

        {/* ── Step 1: Open EMS Calendar ──────────────────────────────── */}
        <div className="rounded-xl border border-blue-200 dark:border-blue-800 overflow-hidden">
          <div className="flex items-center gap-4 p-4 bg-blue-50 dark:bg-blue-950/40">
            <div className="w-8 h-8 rounded-full bg-blue-600 text-white flex items-center justify-center font-bold text-sm shrink-0">1</div>
            <div className="flex-1 min-w-0">
              <p className="font-semibold text-sm text-blue-900 dark:text-blue-100">Open the IWWF EMS Calendar</p>
              <p className="text-[11px] text-blue-600 dark:text-blue-400 mt-0.5">Find your tournament — pre-filtered to New Zealand waterski events</p>
            </div>
            <a
              href={EMS_CALENDAR_URL}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setGuideOpen(true)}
              className="shrink-0 flex items-center gap-1.5 px-3 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-semibold rounded-lg transition-colors"
            >
              Open EMS <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Collapsible step guide */}
          <button
            onClick={() => setGuideOpen(o => !o)}
            className="w-full flex items-center justify-between px-4 py-2 text-xs text-blue-700 dark:text-blue-300 hover:bg-blue-50/60 dark:hover:bg-blue-900/30 transition-colors border-t border-blue-100 dark:border-blue-800"
          >
            <span className="font-medium">How to get the competition URL</span>
            {guideOpen ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
          </button>
          {guideOpen && (
            <div className="px-4 pb-4 pt-2 bg-blue-50/40 dark:bg-blue-950/20 border-t border-blue-100 dark:border-blue-800 space-y-3">
              {[
                { n: 1, icon: <ExternalLink className="w-3.5 h-3.5" />, text: <>Click <strong>Open EMS</strong> above — the NZL waterski calendar opens in a new tab.</> },
                { n: 2, icon: <ArrowRight className="w-3.5 h-3.5" />, text: <>Find your tournament in the list and click its name to open the competition detail page.</> },
                { n: 3, icon: <ClipboardPaste className="w-3.5 h-3.5" />, text: <>Copy the full URL from your browser's address bar. It will look like:<br /><code className="text-[10px] bg-blue-100 dark:bg-blue-900 px-1.5 py-0.5 rounded font-mono block mt-1 break-all">{EMS_BASE_URL}/Competitions/Details?Id=xxxxxxxx-xxxx-…</code></> },
                { n: 4, icon: <ClipboardPaste className="w-3.5 h-3.5" />, text: <>Paste it into the field below and click <strong>Search</strong>. You can also type the sanction code (e.g. <strong>26NZL018</strong>) directly if you know it.</> },
              ].map(step => (
                <div key={step.n} className="flex gap-3 items-start">
                  <div className="w-5 h-5 rounded-full bg-blue-200 dark:bg-blue-800 text-blue-700 dark:text-blue-300 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">{step.n}</div>
                  <p className="text-xs text-blue-800 dark:text-blue-200 leading-relaxed">{step.text}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* ── Step 2: Paste URL / sanction code ─────────────────────── */}
        <div className="rounded-xl border border-border overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-3 bg-muted/40 border-b">
            <div className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center font-bold text-sm shrink-0">2</div>
            <div>
              <p className="font-semibold text-sm">Paste the competition URL or sanction code</p>
              <p className="text-[11px] text-muted-foreground mt-0.5">Slalom participants are automatically pre-selected</p>
            </div>
          </div>
          <div className="p-4 space-y-3">
            <div className="flex gap-2">
              <div className="flex-1">
                <Input
                  placeholder="https://ems.iwwf.sport/Competitions/Details?Id=…  or  26NZL018"
                  value={code}
                  onChange={e => setCode(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') fetchEms(); }}
                />
              </div>
              <div className="flex items-end">
                <Button variant="primary" onClick={fetchEms} isLoading={fetching} disabled={!code.trim()}>
                  Search
                </Button>
              </div>
            </div>

            {fetchError && (
              <div className="space-y-2">
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg text-red-700 dark:text-red-300 text-sm">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{fetchError}</span>
                </div>
                {fetchHint && (
                  <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-800 dark:text-amber-200 text-xs">
                    <p className="font-bold mb-1">Tip</p>
                    <p>{fetchHint}</p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Step 3: Review & import ────────────────────────────────── */}
        {result && (
          <div className="rounded-xl border border-emerald-200 dark:border-emerald-800 overflow-hidden">
            <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 dark:bg-emerald-950/40 border-b border-emerald-200 dark:border-emerald-800">
              <div className="w-8 h-8 rounded-full bg-emerald-600 text-white flex items-center justify-center font-bold text-sm shrink-0">3</div>
              <div className="flex-1 min-w-0">
                <p className="font-semibold text-sm text-emerald-900 dark:text-emerald-100 truncate">{result.name}</p>
                <div className="flex flex-wrap gap-2 mt-0.5 text-[11px] text-emerald-700 dark:text-emerald-300">
                  {result.site && <span>📍 {result.site}</span>}
                  {result.date && <span>📅 {result.date}</span>}
                  <span className="font-mono bg-emerald-100 dark:bg-emerald-900 px-1.5 py-0.5 rounded">{result.code}</span>
                </div>
              </div>
              <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-300 shrink-0">{result.participant_count} found</span>
            </div>

            <div className="p-4 space-y-4">
              <div className="flex items-center justify-between">
                <p className="text-sm font-bold flex items-center gap-1.5">
                  <ListChecks className="w-4 h-4 text-primary" />
                  {selected.size} of {result.participants.length} selected
                </p>
                <button onClick={toggleAll} className="text-xs text-primary hover:underline font-medium">
                  {selected.size === result.participants.length ? 'Deselect all' : 'Select all'}
                </button>
              </div>

              <div className="max-h-72 overflow-y-auto rounded-xl border divide-y">
                {result.participants.map((p, i) => (
                  <label key={i} className={`flex items-center gap-3 px-3 py-2 cursor-pointer hover:bg-muted/40 transition-colors ${!selected.has(i) ? 'opacity-40' : ''}`}>
                    <input type="checkbox" checked={selected.has(i)} onChange={() => setSelected(prev => {
                      const next = new Set(prev); next.has(i) ? next.delete(i) : next.add(i); return next;
                    })} className="rounded accent-primary" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate">
                        {p.first_name} {p.surname}
                        <span className="text-[10px] text-muted-foreground ml-1 font-normal">{p.country}</span>
                      </p>
                      <p className="text-[11px] text-muted-foreground">{p.division}</p>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      {p.events.map(ev => (
                        <span key={ev} className={`text-[10px] px-1.5 py-0.5 rounded font-semibold ${ev === 'Slalom' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300' : 'bg-muted text-muted-foreground'}`}>
                          {ev[0]}
                        </span>
                      ))}
                    </div>
                  </label>
                ))}
              </div>

              {imported > 0 && (
                <div className="flex items-center gap-2 p-3 bg-emerald-50 dark:bg-emerald-950/30 rounded-xl border border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 font-medium text-sm">
                  <CheckCircle2 className="w-4 h-4" /> {imported} participants added to the tournament roster
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
          </div>
        )}
      </div>
    </AdminSection>
  );
}

// ─── Software Update ───────────────────────────────────────────────────────────
type CheckResult = {
  status: 'up_to_date' | 'update_available' | 'no_repo' | 'no_releases' | 'no_git' | 'no_remote' | 'error';
  current?: string;
  latest?: string;
  release_notes?: string | null;
  html_url?: string | null;
  error?: string;
  message?: string;
};

function UpdatePanel() {
  const { toast } = useToast();
  const { adminToken } = useAppStore();
  const { data: settings, refetch: refetchSettings } = useQuery({
    queryKey: ['app-settings'],
    queryFn: async () => { const res = await fetch('/api/settings'); return res.json(); },
  });

  const [installedVersion, setInstalledVersion] = useState<string | null>(null);
  const [downloadUrlInput, setDownloadUrlInput] = useState('');

  // ZIP upload/fetch state
  type ZipStatus = 'idle' | 'uploading' | 'fetching' | 'scanned' | 'applying';
  interface ZipScanResult { version: string; currentVersion: string; hasApiDist: boolean; hasFrontendDist: boolean }
  const [zipStatus, setZipStatus]         = useState<ZipStatus>('idle');
  const [zipScan, setZipScan]             = useState<ZipScanResult | null>(null);
  const [zipError, setZipError]           = useState<string | null>(null);
  const [zipRestarting, setZipRestarting] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const zipInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('/api/update/version')
      .then(r => r.json() as Promise<{ version: string }>)
      .then(d => setInstalledVersion(d.version))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (settings?.update_download_url) setDownloadUrlInput(settings.update_download_url);
  }, [settings]);

  const saveDownloadUrl = async () => {
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_download_url: downloadUrlInput.trim() }),
    });
    refetchSettings();
    toast({ title: 'Download URL saved' });
  };

  const downloadZip = async () => {
    setIsDownloading(true);
    try {
      const res = await fetch('/api/update/download');
      if (!res.ok) {
        const data = await res.json() as { error?: string };
        toast({ title: 'Download failed', description: data.error ?? `HTTP ${res.status}`, variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const versionMatch = installedVersion ?? 'latest';
      const filename = `slalomstream-v${versionMatch}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = filename; a.click();
      URL.revokeObjectURL(url);
    } catch (err: any) {
      toast({ title: 'Download failed', description: err.message ?? 'Unknown error', variant: 'destructive' });
    } finally {
      setIsDownloading(false);
    }
  };

  const fetchUpdate = async () => {
    setZipStatus('fetching');
    setZipError(null);
    setZipScan(null);
    try {
      const res = await fetch('/api/update/fetch', {
        method: 'POST',
        headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
      });
      const data = await res.json();
      if (!res.ok) { setZipError(data.error ?? 'Fetch failed'); setZipStatus('idle'); return; }
      setZipScan(data as ZipScanResult);
      setZipStatus('scanned');
    } catch (err: any) {
      setZipError(err.message ?? 'Fetch failed');
      setZipStatus('idle');
    }
  };

  const uploadZip = async (file: File) => {
    setZipStatus('uploading');
    setZipError(null);
    setZipScan(null);
    const form = new FormData();
    form.append('file', file);
    try {
      const res = await fetch('/api/update/upload', {
        method: 'POST',
        headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
        body: form,
      });
      const data = await res.json();
      if (!res.ok) { setZipError(data.error ?? 'Upload failed'); setZipStatus('idle'); return; }
      setZipScan(data as ZipScanResult);
      setZipStatus('scanned');
    } catch (err: any) {
      setZipError(err.message ?? 'Upload failed');
      setZipStatus('idle');
    }
  };

  const applyZip = async () => {
    setZipStatus('applying');
    setZipError(null);
    try {
      const res = await fetch('/api/update/apply-zip', {
        method: 'POST',
        headers: adminToken ? { 'X-Admin-Token': adminToken } : {},
      });
      const data = await res.json();
      if (!res.ok) { setZipError(data.error ?? 'Apply failed'); setZipStatus('scanned'); return; }
      setZipRestarting(true);
      setTimeout(async () => {
        for (let i = 0; i < 25; i++) {
          await new Promise(r => setTimeout(r, 2000));
          try { const ping = await fetch('/api/healthz'); if (ping.ok) { window.location.reload(); return; } } catch {}
        }
      }, 4000);
    } catch (err: any) {
      setZipError(err.message ?? 'Apply failed');
      setZipStatus('scanned');
    }
  };

  const downloadUrl = settings?.update_download_url ?? '';
  const thisAppDownloadUrl = `${window.location.origin}/api/update/download`;

  const useThisAppAsSource = async () => {
    setDownloadUrlInput(thisAppDownloadUrl);
    await fetch('/api/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ update_download_url: thisAppDownloadUrl }),
    });
    refetchSettings();
    toast({ title: 'Download URL set', description: 'Pointing to this app\'s built-in download endpoint.' });
  };

  return (
    <AdminSection
      icon={<RefreshCw className="w-4 h-4" />}
      title="Software Update"
      subtitle="Update the app by uploading a new version ZIP"
    >
      <div className="p-5 space-y-5">

        {/* Current version */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Installed version:</span>
          <code className="bg-muted px-2 py-0.5 rounded font-mono text-xs font-bold">
            v{installedVersion ?? '…'}
          </code>
        </div>

        {/* ── Download URL ─────────────────────────────────────────────── */}
        <div className="space-y-2">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Update Download Location</p>
          <p className="text-xs text-muted-foreground">
            Set the URL where the latest ZIP is hosted (e.g. a Google Drive or Dropbox shared link). Operators can open it directly from this panel to download the file.
          </p>
          <div className="flex gap-2">
            <Input
              placeholder="https://drive.google.com/…  or  https://www.dropbox.com/…"
              value={downloadUrlInput}
              onChange={e => setDownloadUrlInput(e.target.value)}
              className="flex-1 font-mono text-xs"
            />
            <Button variant="outline" onClick={saveDownloadUrl} disabled={!downloadUrlInput.trim()} className="shrink-0">
              Save
            </Button>
          </div>
          {/* Download + self-host helpers */}
          <div className="flex flex-wrap gap-2 mt-1">
            <Button
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={downloadZip}
              isLoading={isDownloading}
              disabled={isDownloading}
            >
              <Download className="w-3.5 h-3.5" />
              Download update ZIP
            </Button>
            <Button
              variant="outline"
              className={`h-8 text-xs gap-1.5 ${downloadUrl === thisAppDownloadUrl ? 'text-emerald-700 dark:text-emerald-400 border-emerald-300 dark:border-emerald-700' : 'text-blue-700 dark:text-blue-300 border-blue-300 dark:border-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/40'}`}
              onClick={useThisAppAsSource}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              {downloadUrl === thisAppDownloadUrl ? 'Using this app ✓' : 'Use this app as update source'}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            <strong>Download update ZIP</strong> saves the current build to your device for distribution. <strong>Use this app as update source</strong> sets the download URL to this published app's endpoint — venues can then fetch updates automatically with one click after each republish.
          </p>
        </div>

        {/* ── ZIP Upload ───────────────────────────────────────────────── */}
        <div className="space-y-3 border-t pt-4">
          <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground">Apply Update ZIP</p>

          {zipRestarting ? (
            <div className="flex items-center gap-3 p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-700 text-emerald-700 dark:text-emerald-300 text-sm font-semibold">
              <RefreshCw className="w-5 h-5 animate-spin shrink-0" />
              <div>
                <p>Update applied — server is restarting…</p>
                <p className="font-normal text-xs mt-0.5">This page will reload automatically when the server is back online.</p>
              </div>
            </div>
          ) : (
            <>
              {/* Auto-fetch — always visible, disabled until URL is configured */}
              <div className="p-3 bg-primary/5 border border-primary/20 rounded-xl space-y-2">
                <p className="text-xs font-semibold">Automatic update</p>
                <p className="text-xs text-muted-foreground">
                  {downloadUrl
                    ? 'Fetch and prepare the update directly from the configured download URL — no file download or upload needed.'
                    : 'Set a download URL above first (or click "Use this app as update source"), then use this button to fetch updates automatically.'}
                </p>
                <Button
                  variant="primary"
                  onClick={fetchUpdate}
                  disabled={!downloadUrl || zipStatus === 'fetching' || zipStatus === 'uploading' || zipStatus === 'applying'}
                  isLoading={zipStatus === 'fetching'}
                  className="h-9 gap-2 w-full"
                >
                  <RefreshCw className="w-4 h-4" />
                  {zipStatus === 'fetching' ? 'Downloading update…' : 'Fetch & prepare update'}
                </Button>
              </div>

              <div className="flex items-center gap-2">
                <div className="h-px flex-1 bg-border" />
                <span className="text-[10px] text-muted-foreground uppercase tracking-widest">or upload manually</span>
                <div className="h-px flex-1 bg-border" />
              </div>

              <input
                ref={zipInputRef}
                type="file"
                accept=".zip,application/zip"
                className="hidden"
                onChange={e => { const f = e.target.files?.[0]; if (f) uploadZip(f); e.target.value = ''; }}
              />
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  onClick={() => zipInputRef.current?.click()}
                  disabled={zipStatus === 'uploading' || zipStatus === 'fetching' || zipStatus === 'applying'}
                  isLoading={zipStatus === 'uploading'}
                  className="flex items-center gap-2 flex-1"
                >
                  <Download className="w-4 h-4" />
                  {zipStatus === 'uploading' ? 'Scanning ZIP…' : zipScan ? 'Upload different ZIP' : 'Upload ZIP file'}
                </Button>
                {zipScan && zipStatus === 'scanned' && (
                  <Button
                    variant="primary"
                    onClick={applyZip}
                    disabled={zipStatus === 'applying'}
                    isLoading={zipStatus === 'applying'}
                    className="flex items-center gap-2"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Apply Update
                  </Button>
                )}
              </div>

              {zipScan && zipStatus === 'scanned' && (
                <div className="p-3 rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950/30 space-y-2">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                    <span className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">Valid SlalomStream ZIP</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="bg-white dark:bg-emerald-900/30 rounded-lg p-2">
                      <p className="text-muted-foreground">Current version</p>
                      <p className="font-mono font-bold">v{zipScan.currentVersion}</p>
                    </div>
                    <div className="bg-white dark:bg-emerald-900/30 rounded-lg p-2">
                      <p className="text-muted-foreground">ZIP version</p>
                      <p className="font-mono font-bold">v{zipScan.version}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 text-[11px] text-emerald-700 dark:text-emerald-300">
                    {zipScan.hasApiDist      && <span className="bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 rounded">✓ Server</span>}
                    {zipScan.hasFrontendDist && <span className="bg-emerald-100 dark:bg-emerald-900 px-2 py-0.5 rounded">✓ Frontend</span>}
                  </div>
                </div>
              )}

              {zipError && (
                <div className="flex items-start gap-2 p-3 bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-xl text-red-700 dark:text-red-300 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{zipError}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </AdminSection>
  );
}

// ─── Tournament Archive ────────────────────────────────────────────────────────
function TournamentArchive() {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tournaments } = useQuery({
    queryKey: ['/api/tournaments', 'archive-panel'],
    queryFn: async () => {
      const res = await fetch('/api/tournaments');
      if (!res.ok) throw new Error('Failed to load');
      return res.json() as Promise<{ id: number; name: string; status: string; is_test: boolean }[]>;
    },
  });

  const archiveMutation = useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await fetch(`/api/tournaments/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] });
    },
  });

  const active = tournaments?.filter(t => t.status !== 'archived' && !t.is_test) ?? [];
  const archived = tournaments?.filter(t => t.status === 'archived') ?? [];

  const statusBadge = (t: { status: string }) => {
    if (t.status === 'active') return <Badge variant="success" className="text-[10px]">Active</Badge>;
    if (t.status === 'completed') return <Badge variant="outline" className="text-[10px]">Completed</Badge>;
    return <Badge variant="warning" className="text-[10px]">Upcoming</Badge>;
  };

  const archivedBadge = archived.length > 0
    ? <Badge variant="outline" className="text-xs">{archived.length} archived</Badge>
    : undefined;

  return (
    <AdminSection
      icon={<Archive className="w-4 h-4" />}
      title="Tournament Archive"
      subtitle="Close out completed events and hide them from the home screen"
      badge={archivedBadge}
    >
      <div className="p-5 space-y-5">
        {active.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Active & Upcoming</p>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y">
                  {active.map(t => (
                    <tr key={t.id} className="hover:bg-muted/50">
                      <td className="px-4 py-3 font-semibold">{t.name}</td>
                      <td className="px-4 py-3">{statusBadge(t)}</td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="outline"
                          className="h-7 text-xs gap-1.5"
                          isLoading={archiveMutation.isPending && (archiveMutation.variables as any)?.id === t.id}
                          onClick={() =>
                            archiveMutation.mutate(
                              { id: t.id, status: 'archived' },
                              { onSuccess: () => toast({ title: `${t.name} archived` }) }
                            )
                          }
                        >
                          <Archive className="w-3 h-3" /> Archive
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {archived.length > 0 && (
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">Archived</p>
            <div className="border rounded-xl overflow-hidden">
              <table className="w-full text-sm text-left">
                <tbody className="divide-y">
                  {archived.map(t => (
                    <tr key={t.id} className="hover:bg-muted/50 text-muted-foreground">
                      <td className="px-4 py-3 font-medium">{t.name}</td>
                      <td className="px-4 py-3">
                        <Badge variant="outline" className="text-[10px] text-muted-foreground">Archived</Badge>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <Button
                          variant="ghost"
                          className="h-7 text-xs gap-1.5"
                          isLoading={archiveMutation.isPending && (archiveMutation.variables as any)?.id === t.id}
                          onClick={() =>
                            archiveMutation.mutate(
                              { id: t.id, status: 'completed' },
                              { onSuccess: () => toast({ title: `${t.name} restored` }) }
                            )
                          }
                        >
                          <RotateCcw className="w-3 h-3" /> Restore
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {(!tournaments || (active.length === 0 && archived.length === 0)) && (
          <p className="text-center text-muted-foreground text-sm py-4">No tournaments yet.</p>
        )}
      </div>
    </AdminSection>
  );
}

// ─── Score Corrections ─────────────────────────────────────────────────────────
const SCORE_OPTIONS = ['0', '0.5', '1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6_no_gates'];

type PassRow = { id: number; skier_name: string; round_number: number; rope_length: number; buoys_scored: number | null; status: string };
type JudgeScoreRow = { id: number; pass_id: number; judge_role: string; judge_name: string; pass_score: string };

function ScoreCorrections({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: passes } = useQuery({
    queryKey: ['/api/tournaments', tournamentId, 'passes'],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments/${tournamentId}/passes`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<PassRow[]>;
    },
  });

  const [expandedPass, setExpandedPass] = useState<number | null>(null);
  const [editingBuoys, setEditingBuoys] = useState<Record<number, string>>({});

  const { data: judgeScores } = useQuery({
    queryKey: ['/api/passes', expandedPass, 'judge-scores'],
    queryFn: async () => {
      const res = await fetch(`/api/passes/${expandedPass}/judge-scores`);
      if (!res.ok) throw new Error('Failed');
      return res.json() as Promise<JudgeScoreRow[]>;
    },
    enabled: expandedPass !== null,
  });

  const saveBuoys = async (passId: number) => {
    const val = editingBuoys[passId];
    if (val === undefined || val === '') return;
    const res = await fetch(`/api/passes/${passId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ buoys_scored: parseFloat(val), status: 'complete' }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
      setEditingBuoys(prev => { const n = { ...prev }; delete n[passId]; return n; });
      toast({ title: 'Score updated' });
    }
  };

  const updateJudgeScore = async (passId: number, scoreId: number, pass_score: string) => {
    const res = await fetch(`/api/passes/${passId}/judge-scores/${scoreId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pass_score }),
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['/api/passes', expandedPass, 'judge-scores'] });
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
      toast({ title: 'Judge score corrected, re-collated' });
    }
  };

  const sorted = [...(passes ?? [])].sort((a, b) => a.round_number - b.round_number || a.id - b.id);
  const countBadge = <Badge variant="outline" className="text-xs">{sorted.length} passes</Badge>;

  return (
    <AdminSection
      icon={<Pencil className="w-4 h-4" />}
      title="Score Corrections"
      subtitle="Override pass scores or correct individual judge scores"
      badge={countBadge}
    >
      <div className="p-5">
        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Skier</th>
                <th className="px-4 py-3 hidden sm:table-cell">Rnd</th>
                <th className="px-4 py-3 hidden sm:table-cell">Rope</th>
                <th className="px-4 py-3">Score</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {sorted.map(p => (
                <React.Fragment key={p.id}>
                  <tr className={`hover:bg-muted/50 ${expandedPass === p.id ? 'bg-primary/5' : ''}`}>
                    <td className="px-4 py-3 font-semibold">{p.skier_name}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{p.round_number}</td>
                    <td className="px-4 py-3 hidden sm:table-cell text-muted-foreground text-xs">{p.rope_length}m</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          max="6"
                          className="w-16 h-7 border rounded px-2 text-xs font-mono text-center bg-background"
                          value={editingBuoys[p.id] ?? (p.buoys_scored ?? '')}
                          onChange={e => setEditingBuoys(prev => ({ ...prev, [p.id]: e.target.value }))}
                        />
                        {editingBuoys[p.id] !== undefined && (
                          <button
                            onClick={() => saveBuoys(p.id)}
                            className="text-xs text-primary font-bold hover:underline whitespace-nowrap"
                          >
                            Save
                          </button>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => setExpandedPass(expandedPass === p.id ? null : p.id)}
                        className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 ml-auto"
                      >
                        {expandedPass === p.id
                          ? <ChevronUp className="w-3 h-3" />
                          : <ChevronDown className="w-3 h-3" />}
                        Judges
                      </button>
                    </td>
                  </tr>
                  {expandedPass === p.id && (
                    <tr>
                      <td colSpan={5} className="bg-muted/30 px-4 py-3">
                        {!judgeScores ? (
                          <p className="text-xs text-muted-foreground">Loading…</p>
                        ) : judgeScores.length === 0 ? (
                          <p className="text-xs text-muted-foreground">No judge scores recorded for this pass.</p>
                        ) : (
                          <div>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-muted-foreground mb-2">
                              Judge Scores — changing selection saves immediately
                            </p>
                            <div className="grid gap-2">
                              {judgeScores.map(score => (
                                <div key={score.id} className="flex items-center gap-3 text-xs">
                                  <span className="w-20 font-semibold text-muted-foreground shrink-0">{score.judge_role}</span>
                                  <span className="flex-1 text-muted-foreground truncate">{score.judge_name}</span>
                                  <select
                                    className="h-7 border rounded px-2 text-xs bg-background font-mono"
                                    value={score.pass_score}
                                    onChange={e => updateJudgeScore(p.id, score.id, e.target.value)}
                                  >
                                    {SCORE_OPTIONS.map(v => (
                                      <option key={v} value={v}>{v === '6_no_gates' ? '6 (no gates)' : v}</option>
                                    ))}
                                  </select>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
              {sorted.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No passes recorded yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Editing "Score" overrides the collated buoys count directly. Changing a judge score dropdown re-collates automatically.
        </p>
      </div>
    </AdminSection>
  );
}

// ─── Skier Roster ──────────────────────────────────────────────────────────────
function SkierManagement({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { data: skiers } = useListSkiers(tournamentId);
  const createMutation = useCreateSkier({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'skiers'] }) }
  });

  const [form, setForm] = useState({ first_name: '', surname: '', division: DIVISIONS[0] });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(
      { id: tournamentId, data: { ...form, is_financial: true } },
      { onSuccess: () => setForm({ first_name: '', surname: '', division: DIVISIONS[0] }) }
    );
  };

  const countBadge = <Badge variant="outline" className="text-xs">{skiers?.length ?? 0} skiers</Badge>;

  return (
    <AdminSection icon={<UserPlus className="w-4 h-4" />} title="Skier Roster" badge={countBadge}>
      <div className="p-5">
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 items-end mb-5">
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
    </AdminSection>
  );
}

// ─── Judge Register ────────────────────────────────────────────────────────────
const ROLE_LABELS: Record<string, string> = {
  judge_a: 'Judge A', judge_b: 'Judge B', boat_judge: 'Boat Judge',
  judge_c: 'Judge C', judge_d: 'Judge D', judge_e: 'Judge E', chief_judge: 'Chief Judge',
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
    createMutation.mutate(
      { id: tournamentId, data: { ...form, is_active: true } },
      { onSuccess: () => { setForm({ name: '', judge_role: JUDGE_ROLES[0], judge_level: '', pin: '' }); toast({ title: 'Judge created' }); } }
    );
  };

  const deleteJudge = async (judgeId: number) => {
    await fetch(`/api/judges/${judgeId}`, { method: 'DELETE' });
    queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'judges'] });
    toast({ title: 'Judge removed' });
  };

  const countBadge = <Badge variant="outline" className="text-xs">{judges?.length ?? 0} judges</Badge>;

  return (
    <AdminSection icon={<Settings className="w-4 h-4" />} title="Judge Register" badge={countBadge}>
      <div className="p-5">
        <form onSubmit={onSubmit} className="grid grid-cols-2 sm:grid-cols-4 gap-3 items-end mb-5" autoComplete="off">
          <Input label="Full Name" required autoComplete="off" value={form.name}
            onChange={e => setForm({...form, name: e.target.value})} className="h-10 col-span-2 sm:col-span-1" />
          <Select label="Role" value={form.judge_role} onChange={e => setForm({...form, judge_role: e.target.value})}
            options={JUDGE_ROLES.map(r => ({ label: ROLE_LABELS[r] ?? r, value: r }))} className="h-10" />
          <Input label="Level (opt.)" placeholder="e.g. Grade 1" value={form.judge_level}
            onChange={e => setForm({...form, judge_level: e.target.value})} className="h-10" />
          <div className="flex gap-2 items-end col-span-2 sm:col-span-1">
            <Input label="PIN" type="password" maxLength={4} required autoComplete="new-password"
              name="judge-new-pin-field" value={form.pin} onChange={e => setForm({...form, pin: e.target.value})}
              className="h-10 font-mono tracking-widest w-20" placeholder="1234" />
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
                        <button onClick={() => deleteJudge(j.id)}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
              {(!judges || judges.length === 0) && (
                <tr><td colSpan={5} className="px-4 py-8 text-center text-muted-foreground">No judges. Add above, or set PINs for officials.</td></tr>
              )}
            </tbody>
          </table>
        </div>

        <p className="text-xs text-muted-foreground mt-3">
          Manually added judges are specific to this tournament. Officials from the NZTWSA Register with a PIN set appear automatically in all tournaments — shown with the "Officials Register" badge.
        </p>
      </div>
    </AdminSection>
  );
}

// ─── Network Status Card ────────────────────────────────────────────────────────
function NetworkStatusCard() {
  const { toast } = useToast();
  const { data: network, refetch } = useQuery({
    queryKey: ['network-info'],
    queryFn: async () => { const r = await fetch('/api/network-info'); return r.json(); },
    refetchInterval: 30000,
    staleTime: 10000,
  });

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(() => toast({ title: 'Copied to clipboard' }));
  };

  const urls: string[] = network?.urls ?? [];

  return (
    <Card className="overflow-hidden border-primary/20 bg-emerald-950 text-white">
      <div className="px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Monitor className="w-4 h-4 text-emerald-400" />
          <span className="font-bold text-sm text-white">This Server</span>
          <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-400/15 px-2 py-0.5 rounded-full border border-emerald-400/20">
            port {network?.port ?? '…'}
          </span>
        </div>
        <button onClick={() => refetch()} className="p-1.5 text-emerald-400/70 hover:text-emerald-300 transition-colors rounded-lg">
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      <div className="px-4 pb-3 space-y-2">
        {urls.length === 0 ? (
          <p className="text-emerald-300/70 text-xs">Detecting network addresses…</p>
        ) : (
          urls.map((url: string) => (
            <div key={url} className="flex items-center gap-2 bg-emerald-900/60 border border-emerald-700/40 rounded-xl px-3 py-2">
              <Wifi className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
              <span className="font-mono text-sm text-white font-semibold flex-1 truncate">{url}</span>
              <button
                onClick={() => copy(url)}
                className="p-1 text-emerald-400/70 hover:text-emerald-300 transition-colors rounded"
                title="Copy URL"
              >
                <Copy className="w-3.5 h-3.5" />
              </button>
            </div>
          ))
        )}
        <p className="text-emerald-300/60 text-[11px] leading-snug pt-0.5">
          Judges and scoreboard screens connect to this URL in their browser. All devices must be on the same WiFi network.
        </p>
      </div>
    </Card>
  );
}

// ─── System Operations Panel ───────────────────────────────────────────────────
function SystemOperationsPanel() {
  const { toast } = useToast();
  const [confirming, setConfirming] = useState(false);

  const shutdownMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/system/shutdown', { method: 'POST' });
      return res.json();
    },
    onSuccess: () => {
      toast({ title: 'Server shutting down', description: 'You can now close the console window.' });
      setConfirming(false);
    },
    onError: () => toast({ title: 'Shutdown failed', variant: 'destructive' }),
  });

  return (
    <AdminSection
      icon={<Server className="w-4 h-4" />}
      title="System Operations"
      subtitle="Server lifecycle controls"
      borderClass="border-red-200 dark:border-red-900"
    >
      <div className="px-4 py-4 space-y-3">
        <div className="flex items-start gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700 rounded-xl">
          <AlertCircle className="w-4 h-4 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
          <div>
            <p className="text-sm font-semibold text-amber-800 dark:text-amber-300">Shutdown stops the server</p>
            <p className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">
              All connected judges and scoreboards will lose their connection. Use this at the end of the tournament day to cleanly stop the server instead of force-closing the console window.
            </p>
          </div>
        </div>

        {!confirming ? (
          <Button
            variant="outline"
            className="gap-2 border-red-300 text-red-600 hover:bg-red-50 dark:border-red-700 dark:text-red-400 dark:hover:bg-red-900/20"
            onClick={() => setConfirming(true)}
          >
            <PowerOff className="w-4 h-4" /> Shut Down Server
          </Button>
        ) : (
          <div className="flex items-center gap-3">
            <Button
              variant="destructive"
              className="gap-2"
              onClick={() => shutdownMutation.mutate()}
              isLoading={shutdownMutation.isPending}
            >
              <PowerOff className="w-4 h-4" /> Confirm Shutdown
            </Button>
            <Button variant="outline" onClick={() => setConfirming(false)}>Cancel</Button>
          </div>
        )}
      </div>
    </AdminSection>
  );
}
