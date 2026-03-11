import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import {
  useGetTournament, useListSkiers, useListPasses,
  useCreatePass, useUpdatePass
} from '@workspace/api-client-react';
import { Card, Button, Badge, PageHeader, Select, Input } from '@/components/ui/shared';
import {
  Play, SquareSquare, Timer, User, Wifi, ChevronDown, ChevronUp,
  Camera, CameraOff, Circle, Square, Maximize2, RefreshCw,
  Gauge, MonitorPlay, CheckCircle2, Download, ExternalLink, SwitchCamera
} from 'lucide-react';
import { ROPE_LENGTHS, SPEEDS, formatRope, formatSpeed, getRopeColour, getJudgingPanel } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG } from 'qrcode.react';

// ─── Network info ─────────────────────────────────────────────────────────────
interface NetworkInfo { addresses: { name: string; address: string; family: string }[]; port: string; urls: string[] }
function useNetworkInfo() {
  return useQuery<NetworkInfo>({
    queryKey: ['network-info'],
    queryFn: async () => { const r = await fetch('/api/network-info'); return r.json(); },
    refetchInterval: 30000,
    staleTime: 15000,
  });
}

interface AppSettings { connection_mode: string; public_url: string | null; [key: string]: unknown }
function useAppSettings() {
  return useQuery<AppSettings>({
    queryKey: ['app-settings'],
    queryFn: async () => { const r = await fetch('/api/settings'); return r.json(); },
    staleTime: 30000,
  });
}

// ─── Judge score overlay data ──────────────────────────────────────────────────
function usePassJudgeScores(passId: number | null) {
  return useQuery<any[]>({
    queryKey: ['pass-judge-scores', passId],
    queryFn: async () => {
      if (!passId) return [];
      const r = await fetch(`/api/passes/${passId}/judge-scores`);
      return r.ok ? r.json() : [];
    },
    enabled: !!passId,
    refetchInterval: 2000,
  });
}

// ─── Video hook ────────────────────────────────────────────────────────────────
type VideoMode = 'idle' | 'preview' | 'recording' | 'replay';

export interface VideoDevice { deviceId: string; label: string; }

function useVideoRecorder() {
  const [mode, setMode] = useState<VideoMode>('idle');
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [error, setError] = useState<string | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>('');

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);

  // Enumerate video input devices — labels only available after permission
  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({
          deviceId: d.deviceId,
          label: d.label || `Camera ${i + 1}`,
        }));
      setDevices(cams);
      // Auto-select first device if nothing selected yet
      setSelectedDeviceId(prev => {
        if (prev) return prev;
        return cams[0]?.deviceId ?? '';
      });
    } catch {
      // enumerateDevices not supported — silently ignore
    }
  }, []);

  // Enumerate on mount (may get empty labels before permission granted)
  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => {
      navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
    };
  }, [refreshDevices]);

  const startCamera = useCallback(async (deviceId?: string) => {
    setError(null);
    const targetDevice = deviceId ?? selectedDeviceId;
    try {
      // Stop any existing stream first
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 },
        height: { ideal: 1080 },
        frameRate: { ideal: 60 },
      };
      if (targetDevice) videoConstraints.deviceId = { exact: targetDevice };

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      if (targetDevice) setSelectedDeviceId(targetDevice);
      // Re-enumerate now that we have permission — labels will be populated
      await refreshDevices();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Camera access denied');
    }
  }, [selectedDeviceId, refreshDevices]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setMode('idle');
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || mode === 'recording') return;
    if (replayUrl) URL.revokeObjectURL(replayUrl);
    setReplayUrl(null);
    chunksRef.current = [];

    const mimeType =
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
      MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' :
      'video/webm';

    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        setReplayUrl(url);
        setPlaybackRate(1);
        // Switch video to replay
        if (videoRef.current) {
          videoRef.current.srcObject = null;
          videoRef.current.src = url;
          videoRef.current.muted = false;
          videoRef.current.loop = false;
          videoRef.current.playbackRate = 1;
          videoRef.current.play().catch(() => {});
        }
        setMode('replay');
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setMode('recording');
    } catch (err: any) {
      setError(`Recording not supported: ${err.message}`);
    }
  }, [mode, replayUrl]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const backToPreview = useCallback(() => {
    if (videoRef.current) {
      videoRef.current.src = '';
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true;
      videoRef.current.loop = false;
      videoRef.current.play().catch(() => {});
    }
    setMode(streamRef.current ? 'preview' : 'idle');
  }, []);

  const setSpeed = useCallback((rate: number) => {
    setPlaybackRate(rate);
    if (videoRef.current) videoRef.current.playbackRate = rate;
  }, []);

  const togglePiP = useCallback(async () => {
    if (!videoRef.current) return;
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
        setPipActive(false);
      } else {
        await videoRef.current.requestPictureInPicture();
        setPipActive(true);
      }
    } catch (err: any) {
      setError(`Picture-in-Picture not supported: ${err.message}`);
    }
  }, []);

  // PiP lifecycle
  useEffect(() => {
    const vid = videoRef.current;
    if (!vid) return;
    const onEnter = () => setPipActive(true);
    const onLeave = () => setPipActive(false);
    vid.addEventListener('enterpictureinpicture', onEnter);
    vid.addEventListener('leavepictureinpicture', onLeave);
    return () => {
      vid.removeEventListener('enterpictureinpicture', onEnter);
      vid.removeEventListener('leavepictureinpicture', onLeave);
    };
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      streamRef.current?.getTracks().forEach(t => t.stop());
      if (replayUrl) URL.revokeObjectURL(replayUrl);
    };
  }, []);

  const downloadRecording = useCallback((skierName?: string) => {
    if (!replayUrl) return;
    const name = skierName ? `${skierName.replace(/\s+/g, '-')}-` : '';
    const a = document.createElement('a');
    a.href = replayUrl;
    a.download = `slalom-${name}${Date.now()}.webm`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }, [replayUrl]);

  return {
    videoRef, mode, replayUrl, playbackRate, error, pipActive,
    devices, selectedDeviceId, setSelectedDeviceId,
    startCamera, stopCamera, startRecording, stopRecording, backToPreview,
    setSpeed, togglePiP, downloadRecording,
  };
}

// ─── Video Panel ───────────────────────────────────────────────────────────────
interface VideoPanelProps {
  video: ReturnType<typeof useVideoRecorder>;
  activePassId: number | null;
  activePassName: string | null;
}

function VideoPanel({ video, activePassId, activePassName }: VideoPanelProps) {
  const { data: scores } = usePassJudgeScores(activePassId);
  const { mode, videoRef, error, pipActive, playbackRate } = video;

  const ROLE_SHORT: Record<string, string> = {
    judge_a: 'A', judge_b: 'B', judge_c: 'C', judge_d: 'D', judge_e: 'E', chief_judge: 'CJ',
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-black border shadow-2xl relative">
      {/* Video element — always mounted */}
      <video
        ref={videoRef}
        className="w-full aspect-video object-cover"
        playsInline
        autoPlay
        muted
        style={{ display: mode === 'idle' ? 'none' : 'block' }}
      />

      {/* Idle state */}
      {mode === 'idle' && (
        <div className="w-full aspect-video flex flex-col items-center justify-center bg-gradient-to-br from-slate-900 to-slate-800 gap-4 px-6 text-center">
          <Camera className="w-14 h-14 text-slate-500" />
          <p className="text-slate-400 text-sm font-medium">Camera offline</p>

          {/* Device picker */}
          {video.devices.length > 1 && (
            <div className="w-full max-w-xs">
              <select
                value={video.selectedDeviceId}
                onChange={e => video.setSelectedDeviceId(e.target.value)}
                className="w-full text-sm rounded-lg bg-slate-700 border border-slate-600 text-white px-3 py-2 focus:outline-none focus:ring-2 focus:ring-primary"
              >
                {video.devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                ))}
              </select>
            </div>
          )}

          <Button
            variant="primary"
            onClick={() => video.startCamera()}
            className="flex items-center gap-2"
          >
            <Camera className="w-4 h-4" /> Enable Camera
          </Button>
          {error && (
            <div className="space-y-2">
              <p className="text-red-400 text-xs">{error}</p>
              {(error.toLowerCase().includes('permission') || error.toLowerCase().includes('allow') || error.toLowerCase().includes('denied')) && (
                <div className="bg-amber-900/40 border border-amber-700/50 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-amber-300 text-xs font-semibold">Camera tip</p>
                  <p className="text-amber-200/80 text-[11px] leading-tight">
                    Camera may be blocked if viewing inside a browser preview pane.
                    Open the app in a full browser tab to allow camera access.
                  </p>
                  <button
                    onClick={() => window.open(window.location.href, '_blank')}
                    className="mt-1 flex items-center gap-1.5 text-amber-300 hover:text-amber-200 text-[11px] font-semibold underline"
                  >
                    <ExternalLink className="w-3 h-3" /> Open in new tab
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Overlays when camera/replay active */}
      {mode !== 'idle' && (
        <>
          {/* Status badge — top left */}
          <div className="absolute top-3 left-3 flex items-center gap-2">
            {mode === 'recording' && (
              <span className="flex items-center gap-1.5 bg-red-600/90 backdrop-blur text-white text-xs font-bold px-2.5 py-1 rounded-full shadow">
                <Circle className="w-2.5 h-2.5 fill-white animate-pulse" /> REC
              </span>
            )}
            {mode === 'preview' && (
              <span className="flex items-center gap-1.5 bg-black/60 backdrop-blur text-white text-xs font-semibold px-2.5 py-1 rounded-full">
                LIVE
              </span>
            )}
            {mode === 'replay' && (
              <span className="flex items-center gap-1.5 bg-blue-600/90 backdrop-blur text-white text-xs font-bold px-2.5 py-1 rounded-full">
                <MonitorPlay className="w-3 h-3" /> REPLAY
                {playbackRate !== 1 && ` · ${playbackRate}×`}
              </span>
            )}
          </div>

          {/* Skier name — top right (during recording) */}
          {(mode === 'recording' || mode === 'replay') && activePassName && (
            <div className="absolute top-3 right-3 bg-black/70 backdrop-blur text-white text-xs font-bold px-3 py-1 rounded-full">
              {activePassName}
            </div>
          )}

          {/* Judge score overlay — bottom left */}
          {scores && scores.length > 0 && (
            <div className="absolute bottom-12 left-3 flex flex-col gap-1">
              {scores.map((s: any) => (
                <div key={s.id} className="flex items-center gap-2 bg-black/75 backdrop-blur text-white text-sm font-bold px-2.5 py-1 rounded-lg">
                  <span className="text-emerald-400 text-xs font-semibold w-5">{ROLE_SHORT[s.judge_role] ?? 'J'}</span>
                  <span>{s.pass_score}</span>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                </div>
              ))}
            </div>
          )}

          {/* Controls bar — bottom */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              {(mode === 'preview' || mode === 'recording') && (
                <button
                  onClick={video.stopCamera}
                  className="text-white/70 hover:text-white transition-colors p-1"
                  title="Stop camera"
                >
                  <CameraOff className="w-4 h-4" />
                </button>
              )}
              {/* Camera switcher — shown when live/recording and multiple devices available */}
              {(mode === 'preview' || mode === 'recording') && video.devices.length > 1 && (
                <div className="flex items-center gap-1">
                  <SwitchCamera className="w-3.5 h-3.5 text-white/50 shrink-0" />
                  <select
                    value={video.selectedDeviceId}
                    onChange={e => video.startCamera(e.target.value)}
                    disabled={mode === 'recording'}
                    className="text-[11px] bg-white/10 border border-white/20 text-white rounded px-1.5 py-0.5 focus:outline-none disabled:opacity-40 max-w-[130px] truncate"
                    title={mode === 'recording' ? 'Cannot switch camera while recording' : 'Switch camera'}
                  >
                    {video.devices.map(d => (
                      <option key={d.deviceId} value={d.deviceId} className="bg-slate-800 text-white">{d.label}</option>
                    ))}
                  </select>
                </div>
              )}
              {mode === 'replay' && (
                <>
                  <button onClick={video.backToPreview} className="text-white/70 hover:text-white p-1" title="Back to live">
                    <Camera className="w-4 h-4" />
                  </button>
                  <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1">
                    <Gauge className="w-3.5 h-3.5 text-white/60" />
                    {[0.25, 0.5, 1].map(r => (
                      <button
                        key={r}
                        onClick={() => video.setSpeed(r)}
                        className={`text-xs font-bold px-1.5 py-0.5 rounded transition-colors ${playbackRate === r ? 'text-emerald-400' : 'text-white/60 hover:text-white'}`}
                      >
                        {r === 1 ? '1×' : `${r}×`}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
            <div className="flex items-center gap-2">
              {/* PiP */}
              {'pictureInPictureEnabled' in document && (
                <button
                  onClick={video.togglePiP}
                  className={`p-1.5 rounded-lg transition-colors ${pipActive ? 'text-emerald-400 bg-emerald-400/20' : 'text-white/70 hover:text-white'}`}
                  title="Picture-in-Picture"
                >
                  <Maximize2 className="w-4 h-4" />
                </button>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ─── Tournament-aware Judge Station QR Panel ───────────────────────────────────
// QR codes encode the JUDGING POSITION (role), not the person.
// Stations shown depend on the tournament's judge_count:
//   1 judge  → Judge A only (also Chief & Boat)
//   3 judges → Judge A, B, C/Boat + Chief Judge
//   5 judges → Judge A, B, C, D, E/Boat + Chief Judge
function JudgeConnectPanel({ tournament }: { tournament: any }) {
  const [open, setOpen] = useState(false);
  const { data: network } = useNetworkInfo();
  const { data: appSettings } = useAppSettings();

  const judgeCount = tournament?.judge_count ?? 1;
  const panel = getJudgingPanel(judgeCount);

  // Add Chief Judge QR unless 1-judge (where A is also chief)
  const stations = [
    ...panel.map(s => ({ role: s.role, label: s.label })),
    ...(judgeCount > 1 ? [{ role: 'chief_judge', label: 'Chief Judge' }] : []),
  ];

  const isCloud = appSettings?.connection_mode === 'cloud' && !!appSettings?.public_url;

  const getBase = () => {
    if (isCloud) return (appSettings!.public_url as string).replace(/\/$/, '');
    if (network?.urls?.[0]) {
      const host = network.urls[0].split('//')[1]?.split(':')[0];
      const port = window.location.port || network.port;
      return `http://${host}:${port}`;
    }
    return window.location.origin;
  };

  const getRoleUrl = (role: string) => `${getBase()}/judging?role=${role}`;

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
            <p className="font-bold text-sm">Judge Station QR Codes</p>
            <p className="text-[11px] text-muted-foreground">
              {judgeCount}-judge panel · {stations.length} station{stations.length !== 1 ? 's' : ''}. Any official scans, enters PIN.
            </p>
          </div>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>

      {open && (
        <div className="border-t p-5 space-y-4">
          <p className="text-xs text-muted-foreground">
            Place each QR code at the matching judging station. Any official with a valid PIN scans
            their <strong>position's</strong> QR and enters their PIN — the system identifies them automatically.
            The Boat Judge scans the <strong>{panel.find(s => s.isBoat)?.label ?? 'last judge'}</strong> station.
          </p>
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
            {stations.map(station => {
              const url = getRoleUrl(station.role);
              return (
                <div key={station.role} className="flex flex-col items-center gap-2 p-3 rounded-xl border bg-card hover:border-primary/40 transition-colors">
                  <div className="p-2 bg-white rounded-xl border shadow-sm">
                    <QRCodeSVG
                      value={url}
                      size={110}
                      level="M"
                      fgColor="#064e3b"
                      bgColor="#ffffff"
                    />
                  </div>
                  <div className="text-center">
                    <p className="font-bold text-sm leading-tight">{station.label}</p>
                    <p className="text-[10px] text-muted-foreground font-mono mt-0.5 break-all">/judging?role={station.role}</p>
                  </div>
                </div>
              );
            })}
          </div>
          {isCloud ? (
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <strong>Cloud mode:</strong> Judges can scan from any network — mobile data or any WiFi.
              All QR codes point to <code className="font-mono text-xs">{appSettings?.public_url}</code>.
            </p>
          ) : network?.urls?.[0] ? (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <strong>Local WiFi mode:</strong> All judge devices must connect to the same WiFi network as this server.
              QR codes point to <code className="font-mono text-xs">{network.urls[0]}</code>.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

// ─── Main Recording Page ───────────────────────────────────────────────────────
export default function Recording() {
  const { activeTournamentId } = useAppStore();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const { data: tournament } = useGetTournament(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: skiers } = useListSkiers(activeTournamentId || 0, { query: { enabled: !!activeTournamentId } });
  const { data: passes } = useListPasses(activeTournamentId || 0, {
    query: { enabled: !!activeTournamentId },
    request: { refetchInterval: 3000 } as any,
  });

  const activePass = passes?.find(p => p.status === 'pending');
  const recentPasses = passes
    ?.filter(p => p.status !== 'pending')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
    .slice(0, 8) || [];

  const [skierId, setSkierId] = useState('');
  const [rope, setRope] = useState('18.25');
  const [speed, setSpeed] = useState('55');
  const [round, setRound] = useState('1');

  const video = useVideoRecorder();
  const prevActivePassId = useRef<number | null>(null);

  // Auto-start recording when pass starts, auto-stop when it ends
  useEffect(() => {
    const curr = activePass?.id ?? null;
    const prev = prevActivePassId.current;

    if (curr && !prev) {
      // Pass just started — begin recording if camera active
      if (video.mode === 'preview') {
        video.startRecording();
        toast({ title: "Recording started", description: activePass?.skier_name });
      }
    } else if (!curr && prev) {
      // Pass just ended — stop recording → auto-replay
      if (video.mode === 'recording') {
        video.stopRecording();
      }
    }
    prevActivePassId.current = curr;
  }, [activePass?.id]);

  const createMutation = useCreatePass({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'passes'] });
        toast({ title: "Pass started" });
      }
    }
  });

  const updateMutation = useUpdatePass({
    mutation: {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'passes'] });
        toast({ title: "Pass ended — scores collated" });
      }
    }
  });

  if (!activeTournamentId) {
    return <div className="p-8 text-center"><p className="text-xl text-muted-foreground">Select a tournament from Home first.</p></div>;
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
    updateMutation.mutate({ id: activePass.id, data: { status: 'scored' } });
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pass Recording"
        subtitle="Operator Control Panel"
        actions={
          <Badge variant={activePass ? "success" : "outline"} className={activePass ? "animate-pulse" : ""}>
            {activePass ? "● SKIER ON WATER" : "STANDBY"}
          </Badge>
        }
      />

      <div className="grid xl:grid-cols-5 gap-5">
        {/* ── Left column: Video + Judge Connect ── */}
        <div className="xl:col-span-3 space-y-4">
          <VideoPanel
            video={video}
            activePassId={activePass?.id ?? null}
            activePassName={activePass?.skier_name ?? null}
          />

          {/* Video action bar */}
          {video.mode !== 'idle' && (
            <div className="flex items-center gap-2 flex-wrap">
              {video.mode === 'preview' && (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={video.startRecording}
                  title="Start recording manually"
                  className="flex items-center gap-2"
                >
                  <Circle className="w-3.5 h-3.5 fill-current" /> Record
                </Button>
              )}
              {video.mode === 'recording' && (
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={video.stopRecording}
                  className="flex items-center gap-2"
                >
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop Recording
                </Button>
              )}
              {video.mode === 'replay' && (
                <>
                  <Button variant="outline" size="sm" onClick={video.backToPreview} className="flex items-center gap-2">
                    <Camera className="w-3.5 h-3.5" /> Back to Live
                  </Button>
                  <Button variant="outline" size="sm" onClick={() => { if (video.videoRef.current) { video.videoRef.current.currentTime = 0; video.videoRef.current.play(); } }}>
                    <RefreshCw className="w-3.5 h-3.5" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => video.downloadRecording(activePass?.skier_name ?? undefined)}
                    className="flex items-center gap-2"
                    title="Download recording — your browser will ask where to save it"
                  >
                    <Download className="w-3.5 h-3.5" /> Save
                  </Button>
                </>
              )}
              <span className="text-xs text-muted-foreground ml-1">
                {video.mode === 'preview' && 'Camera live — recording starts automatically when a pass begins'}
                {video.mode === 'recording' && 'Recording… will stop and replay automatically when pass ends'}
                {video.mode === 'replay' && 'Instant replay — Save to download the .webm file'}
              </span>
            </div>
          )}

          <JudgeConnectPanel tournament={tournament} />
        </div>

        {/* ── Right column: Pass control + recent passes ── */}
        <div className="xl:col-span-2 space-y-5">
          {/* Pass control card */}
          <Card className="p-5 bg-gradient-to-br from-card to-emerald-50 dark:to-emerald-950/20 shadow-xl border-primary/20">
            <h2 className="text-xl font-bold mb-5 flex items-center gap-2">
              <Timer className="text-primary w-5 h-5" />
              {activePass ? "Active Pass" : "Setup Next Pass"}
            </h2>

            {activePass ? (
              <div className="space-y-5">
                <div className="p-5 bg-primary/10 rounded-2xl border border-primary/20 text-center space-y-2">
                  <p className="text-xs font-bold text-primary uppercase tracking-widest">On water now</p>
                  <p className="text-3xl font-display font-bold">{activePass.skier_name}</p>
                  <p className="text-muted-foreground font-semibold text-sm flex items-center justify-center gap-2">
                    Rnd {activePass.round_number} · {formatSpeed(activePass.speed_kph)}
                    {activePass.rope_length && (() => {
                      const c = getRopeColour(activePass.rope_length);
                      return (
                        <span
                          className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold border"
                          style={{ background: c.bg, color: c.text, borderColor: c.border }}
                        >
                          {formatRope(activePass.rope_length)}
                        </span>
                      );
                    })()}
                  </p>
                </div>
                <Button
                  variant="destructive"
                  size="lg"
                  className="w-full h-16 text-lg shadow-red-500/25 shadow-xl"
                  onClick={handleEndPass}
                  isLoading={updateMutation.isPending}
                >
                  <SquareSquare className="mr-2 h-5 w-5" /> END PASS / COLLATE
                </Button>
                <JudgeScoreStatusBar passId={activePass.id} />
              </div>
            ) : (
              <div className="space-y-4">
                <Select
                  label="Skier"
                  value={skierId}
                  onChange={e => setSkierId(e.target.value)}
                  options={[
                    { label: '-- Select Skier --', value: '' },
                    ...(skiers?.map(s => ({
                      label: `${s.first_name} ${s.surname} · ${s.division || '—'}`,
                      value: s.id,
                    })) || [])
                  ]}
                />
                <div className="grid grid-cols-2 gap-3">
                  <Select
                    label="Rope"
                    value={rope}
                    onChange={e => setRope(e.target.value)}
                    options={ROPE_LENGTHS.map(r => ({ label: formatRope(r), value: r }))}
                  />
                  <Select
                    label="Speed"
                    value={speed}
                    onChange={e => setSpeed(e.target.value)}
                    options={SPEEDS.map(s => ({ label: formatSpeed(s), value: s }))}
                  />
                </div>
                <Input
                  label="Round"
                  type="number"
                  min="1"
                  value={round}
                  onChange={e => setRound(e.target.value)}
                />
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full h-14 text-lg"
                  onClick={handleStartPass}
                  isLoading={createMutation.isPending}
                >
                  <Play className="mr-2 h-5 w-5 fill-current" /> START PASS
                </Button>
              </div>
            )}
          </Card>

          {/* Recent passes */}
          <div>
            <h3 className="font-bold text-base px-1 mb-3 flex items-center gap-2">
              <User className="w-4 h-4 text-muted-foreground" /> Recent Passes
            </h3>
            {recentPasses.length === 0 ? (
              <Card className="p-6 text-center text-muted-foreground border-dashed text-sm">No passes yet.</Card>
            ) : (
              <div className="space-y-2">
                {recentPasses.map(pass => {
                  const rc = pass.rope_length ? getRopeColour(pass.rope_length) : null;
                  return (
                  <Card key={pass.id} className="p-3 hover:border-primary/50 transition-colors flex justify-between items-center">
                    <div>
                      <p className="font-bold text-sm">{pass.skier_name}</p>
                      <p className="text-[11px] text-muted-foreground font-semibold flex items-center gap-1.5 flex-wrap">
                        R{pass.round_number} · {pass.speed_kph}kph
                        {rc && pass.rope_length && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold"
                            style={{ background: rc.bg, color: rc.text, borderColor: rc.border }}
                          >
                            {pass.rope_length}m
                          </span>
                        )}
                      </p>
                    </div>
                    <div className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 px-3 py-1 rounded-lg text-center min-w-[3rem]">
                      <p className="text-[10px] uppercase font-bold opacity-70">Score</p>
                      <p className="font-display font-black text-lg leading-none">{pass.buoys_scored ?? '—'}</p>
                    </div>
                  </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Judge score status bar (during active pass) ───────────────────────────────
function JudgeScoreStatusBar({ passId }: { passId: number }) {
  const { data: scores } = usePassJudgeScores(passId);

  if (!scores || scores.length === 0) {
    return (
      <p className="text-center text-xs text-muted-foreground animate-pulse">
        Waiting for judge scores…
      </p>
    );
  }

  const ROLE_SHORT: Record<string, string> = {
    judge_a: 'A', judge_b: 'B', judge_c: 'C', judge_d: 'D', judge_e: 'E', chief_judge: 'CJ',
  };

  return (
    <div className="bg-muted/50 rounded-xl p-3">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-2">
        Scores received ({scores.length})
      </p>
      <div className="flex flex-wrap gap-2">
        {scores.map((s: any) => (
          <div key={s.id} className="flex items-center gap-1.5 bg-card border rounded-lg px-2.5 py-1">
            <span className="text-[10px] font-bold text-muted-foreground">{ROLE_SHORT[s.judge_role] ?? 'J'}</span>
            <span className="font-display font-bold text-sm text-emerald-700">{s.pass_score}</span>
            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
          </div>
        ))}
      </div>
    </div>
  );
}
