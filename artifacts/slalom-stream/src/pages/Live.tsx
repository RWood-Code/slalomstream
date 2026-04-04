import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Waves, Maximize2, Minimize2, Camera, CameraOff, SwitchCamera, Trophy, Clock } from 'lucide-react';

const LS_DEVICE_KEY = 'slalom_camera_device_id';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function fmtScore(s: string): string {
  return s === '6_no_gates' ? '6ng' : s;
}

const ROLE_SHORT: Record<string, string> = {
  judge_a: 'A', judge_b: 'B', judge_c: 'C', judge_d: 'D', judge_e: 'E', chief_judge: 'CJ',
};
const ALL_PANEL_ROLES = ['judge_a', 'judge_b', 'judge_c', 'judge_d', 'judge_e'];

// ─── Data hooks ───────────────────────────────────────────────────────────────
function useActiveTournamentInfo() {
  const params = new URLSearchParams(window.location.search);
  const tid = params.get('t') ? parseInt(params.get('t')!, 10) : null;

  const { data: tournament } = useQuery({
    queryKey: ['live-tournament', tid],
    queryFn: async () => {
      if (!tid) return null;
      const r = await fetch(`/api/tournaments/${tid}`);
      return r.ok ? r.json() : null;
    },
    enabled: !!tid,
    refetchInterval: 10000,
  });

  const { data: passes } = useQuery({
    queryKey: ['live-passes', tid],
    queryFn: async () => {
      if (!tid) return [];
      const r = await fetch(`/api/tournaments/${tid}/passes`);
      return r.ok ? r.json() : [];
    },
    enabled: !!tid,
    refetchInterval: 2000,
  });

  const allPasses: any[] = passes ?? [];
  const activePass = allPasses.find((p: any) => p.status === 'pending') ?? null;

  const { data: scores } = useQuery({
    queryKey: ['live-scores', activePass?.id],
    queryFn: async () => {
      if (!activePass?.id) return [];
      const r = await fetch(`/api/passes/${activePass.id}/judge-scores`);
      return r.ok ? r.json() : [];
    },
    enabled: !!activePass?.id,
    refetchInterval: 1500,
  });

  // Personal best check — refetch every 15s, only when there's an active pass
  const { data: pbData } = useQuery({
    queryKey: ['live-pb', activePass?.skier_name, activePass?.division, activePass?.id],
    queryFn: async () => {
      if (!activePass) return null;
      const p = new URLSearchParams({
        name: activePass.skier_name,
        division: activePass.division || 'Open',
        exclude_pass_id: String(activePass.id),
      });
      const r = await fetch(`/api/passes/personal-best?${p}`);
      return r.ok ? r.json() : null;
    },
    enabled: !!activePass,
    staleTime: 10000,
    refetchInterval: 15000,
  });

  // ── Derived data (computed locally from already-fetched passes) ──────────────

  const completedPasses = allPasses.filter((p: any) => p.status === 'complete' && p.buoys_scored !== null);

  // Round-by-round history for the active skier in this tournament
  const skierHistory: any[] = activePass
    ? completedPasses
        .filter((p: any) => p.skier_name === activePass.skier_name)
        .sort((a: any, b: any) => a.round_number - b.round_number)
    : [];

  // Division standings: best score per skier in same division
  const divisionPasses = activePass
    ? completedPasses.filter((p: any) => (p.division || 'Open') === (activePass.division || 'Open'))
    : completedPasses;

  const skierBests: Record<string, number> = {};
  for (const p of divisionPasses) {
    if (skierBests[p.skier_name] === undefined || p.buoys_scored > skierBests[p.skier_name]) {
      skierBests[p.skier_name] = p.buoys_scored;
    }
  }
  const sortedSkiers = Object.entries(skierBests).sort(([, a], [, b]) => b - a);
  const activeSkierRank = activePass
    ? sortedSkiers.findIndex(([name]) => name === activePass.skier_name) + 1
    : 0;
  const divisionTotal = sortedSkiers.length;

  // Last completed skier — best-effort "On Deck" (who just finished)
  const lastCompleted: any = activePass
    ? completedPasses
        .filter((p: any) => p.skier_name !== activePass.skier_name)
        .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())[0] ?? null
    : null;

  // PB Candidate: compute estimated median of submitted scoring-judge scores
  const currentScores: any[] = scores ?? [];
  const numberedScores = currentScores.filter((s: any) => s.judge_role !== 'chief_judge');
  let estimatedScore: number | null = null;
  if (numberedScores.length > 0) {
    const nums = numberedScores
      .map((s: any) => (s.pass_score === '6_no_gates' ? 6 : parseFloat(s.pass_score)))
      .sort((a: number, b: number) => a - b);
    const mid = Math.floor(nums.length / 2);
    estimatedScore = nums.length % 2 === 0
      ? (nums[mid - 1] + nums[mid]) / 2
      : nums[mid];
  }
  const historicalBest: number | null = pbData?.best ?? null;
  const isPBCandidate =
    estimatedScore !== null &&
    (historicalBest === null || estimatedScore > historicalBest);

  return {
    tournament,
    activePass,
    scores: currentScores,
    skierHistory,
    activeSkierRank,
    divisionTotal,
    lastCompleted,
    isPBCandidate,
    estimatedScore,
  };
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function Live() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [cameraActive, setCameraActive] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    () => localStorage.getItem(LS_DEVICE_KEY) ?? ''
  );
  const [error, setError] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const {
    tournament, activePass, scores,
    skierHistory, activeSkierRank, divisionTotal,
    lastCompleted, isPBCandidate,
  } = useActiveTournamentInfo();

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
      setDevices(cams);
      setSelectedDeviceId(prev => {
        const stored = localStorage.getItem(LS_DEVICE_KEY);
        if (stored && cams.find(c => c.deviceId === stored)) return stored;
        if (prev && cams.find(c => c.deviceId === prev)) return prev;
        return cams[0]?.deviceId ?? '';
      });
    } catch {}
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  useEffect(() => {
    const saved = localStorage.getItem(LS_DEVICE_KEY);
    if (saved) startCamera(saved);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    setError(null);
    const target = deviceId ?? selectedDeviceId;
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      const constraints: MediaTrackConstraints = {
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 },
      };
      if (target) constraints.deviceId = { exact: target };
      const stream = await navigator.mediaDevices.getUserMedia({ video: constraints, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      if (target) {
        setSelectedDeviceId(target);
        localStorage.setItem(LS_DEVICE_KEY, target);
      }
      await refreshDevices();
      setCameraActive(true);
    } catch (e: any) {
      setError(e.message || 'Camera access denied');
    }
  }, [selectedDeviceId, refreshDevices]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setCameraActive(false);
  }, []);

  useEffect(() => () => { streamRef.current?.getTracks().forEach(t => t.stop()); }, []);

  const toggleFullscreen = useCallback(() => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen().then(() => setFullscreen(true)).catch(() => {});
    } else {
      document.exitFullscreen().then(() => setFullscreen(false)).catch(() => {});
    }
  }, []);

  const resetHideTimer = useCallback(() => {
    setShowControls(true);
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => setShowControls(false), 3000);
  }, []);

  useEffect(() => {
    resetHideTimer();
    return () => { if (hideTimer.current) clearTimeout(hideTimer.current); };
  }, []);

  // Judge panel: determine expected panel roles
  const judgeCount = tournament?.judge_count ?? 3;
  const panelRoles = ALL_PANEL_ROLES.slice(0, judgeCount);
  const cjScore = scores.find((s: any) => s.judge_role === 'chief_judge');

  return (
    <div
      className="fixed inset-0 bg-black flex items-center justify-center overflow-hidden cursor-none"
      onMouseMove={resetHideTimer}
      onClick={resetHideTimer}
    >
      {/* Camera video */}
      <video
        ref={videoRef}
        className="w-full h-full object-cover"
        playsInline
        autoPlay
        muted
        style={{ display: cameraActive ? 'block' : 'none' }}
      />

      {/* No camera placeholder */}
      {!cameraActive && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-6 bg-gradient-to-br from-slate-900 to-black">
          <div className="flex items-center gap-3 mb-2">
            <Waves className="w-8 h-8 text-emerald-400" />
            <span className="text-white font-bold text-2xl tracking-tight">SlalomStream</span>
            <span className="text-emerald-400 text-xs font-bold uppercase tracking-widest bg-emerald-400/10 px-2 py-0.5 rounded">Live</span>
          </div>

          {error && <p className="text-red-400 text-sm">{error}</p>}

          {devices.length > 1 && (
            <select
              value={selectedDeviceId}
              onChange={e => setSelectedDeviceId(e.target.value)}
              className="text-sm rounded-lg bg-slate-700 border border-slate-600 text-white px-3 py-2 focus:outline-none max-w-xs w-full"
            >
              {devices.map(d => (
                <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
              ))}
            </select>
          )}

          <button
            onClick={() => startCamera()}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-6 py-3 rounded-xl transition-colors"
          >
            <Camera className="w-5 h-5" /> Enable Camera
          </button>

          {tournament && (
            <div className="mt-4 text-center">
              <p className="text-slate-400 text-sm">{tournament.name}</p>
            </div>
          )}
        </div>
      )}

      {/* ── Overlays (always visible) ─────────────────────────────────────────── */}

      {/* Top-left: tournament name */}
      {tournament && (
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur text-white px-4 py-2 rounded-xl">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm">{tournament.name}</span>
          </div>
        </div>
      )}

      {/* Top-right: current skier panel — redesigned */}
      {activePass && (
        <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-md text-white rounded-2xl px-5 py-4 max-w-[300px] space-y-2.5 text-right">
          {/* On Water pulse */}
          <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-widest flex items-center justify-end gap-1.5">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse inline-block" />
            On Water
          </p>

          {/* Name */}
          <p className="font-black text-3xl leading-tight tracking-tight">{activePass.skier_name}</p>

          {/* Division + round + rope + speed */}
          <div className="flex items-center justify-end gap-1.5 flex-wrap">
            <span className="text-[11px] bg-white/15 px-2 py-0.5 rounded-full font-bold uppercase tracking-wide">
              {activePass.division || 'Open'}
            </span>
            <span className="text-slate-300 text-sm">
              R{activePass.round_number} · {activePass.rope_length}m · {activePass.speed_kph}kph
            </span>
          </div>

          {/* Round history for this skier */}
          {skierHistory.length > 0 && (
            <div className="flex items-center justify-end gap-1.5 flex-wrap pt-0.5">
              {skierHistory.map((p: any) => (
                <div
                  key={p.id}
                  className="text-right bg-white/10 px-2.5 py-1 rounded-lg min-w-[3rem]"
                >
                  <div className="text-[10px] text-slate-400 font-semibold">R{p.round_number}</div>
                  <div className="text-base font-black text-white leading-none">{p.buoys_scored}</div>
                  <div className="text-[9px] text-slate-500">{p.rope_length}m</div>
                </div>
              ))}
            </div>
          )}

          {/* Rank + PB candidate badge */}
          <div className="flex items-center justify-end gap-2 flex-wrap pt-0.5">
            {activeSkierRank > 0 && divisionTotal > 0 && (
              <span className="text-[11px] bg-white/15 text-white px-2.5 py-1 rounded-lg font-bold">
                {ordinal(activeSkierRank)} / {divisionTotal}
              </span>
            )}
            {isPBCandidate && (
              <span className="text-[11px] bg-amber-500/30 text-amber-300 border border-amber-500/40 px-2.5 py-1 rounded-lg font-bold flex items-center gap-1">
                <Trophy className="w-3 h-3" /> PB Candidate
              </span>
            )}
          </div>
        </div>
      )}

      {/* Bottom-left: judge scores — enlarged chips with Waiting state */}
      {activePass && (
        <div className="absolute bottom-16 left-4 flex flex-col gap-2">
          {/* Numbered judges */}
          <div className="flex flex-col gap-1.5">
            {panelRoles.map(role => {
              const s = scores.find((sc: any) => sc.judge_role === role);
              return s ? (
                <div
                  key={role}
                  className="flex items-center gap-3 bg-black/80 backdrop-blur text-white px-4 py-2.5 rounded-xl"
                >
                  <span className="text-emerald-400 text-sm font-black w-5 shrink-0">
                    {ROLE_SHORT[role]}
                  </span>
                  <span className="font-black text-3xl leading-none tabular-nums">
                    {fmtScore(s.pass_score)}
                  </span>
                </div>
              ) : (
                <div
                  key={role}
                  className="flex items-center gap-3 bg-black/60 backdrop-blur text-white/40 px-4 py-2.5 rounded-xl"
                >
                  <span className="text-slate-600 text-sm font-black w-5 shrink-0">
                    {ROLE_SHORT[role]}
                  </span>
                  <span className="flex items-center gap-1.5 text-slate-500 text-sm font-semibold">
                    <Clock className="w-3.5 h-3.5 animate-pulse" /> Waiting
                  </span>
                </div>
              );
            })}
          </div>

          {/* CJ score — shown separately below numbered judges */}
          {cjScore && (
            <div className="flex items-center gap-3 bg-black/80 backdrop-blur text-white px-4 py-2.5 rounded-xl border border-white/10">
              <span className="text-purple-400 text-sm font-black w-5 shrink-0">CJ</span>
              <span className="font-black text-3xl leading-none tabular-nums">
                {fmtScore(cjScore.pass_score)}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Bottom-right: Last Up panel (best-effort "On Deck") */}
      {lastCompleted && activePass && (
        <div className="absolute bottom-16 right-4 bg-black/70 backdrop-blur-md text-white px-4 py-3 rounded-xl text-right space-y-0.5">
          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Last Up</p>
          <p className="font-bold text-lg leading-tight">{lastCompleted.skier_name}</p>
          <p className="text-sm text-slate-300">{lastCompleted.division || 'Open'}</p>
          {lastCompleted.buoys_scored !== null && lastCompleted.buoys_scored !== undefined && (
            <p className="text-base font-black text-emerald-400 leading-none pt-0.5">{lastCompleted.buoys_scored}</p>
          )}
        </div>
      )}

      {/* Controls overlay — fades after 3s idle */}
      <div
        className={`absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-4 py-3 flex items-center justify-between gap-3 transition-opacity duration-500 ${showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        style={{ cursor: 'default' }}
      >
        <div className="flex items-center gap-3">
          {cameraActive ? (
            <button
              onClick={stopCamera}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-semibold transition-colors"
            >
              <CameraOff className="w-4 h-4" /> Stop Camera
            </button>
          ) : (
            <button
              onClick={() => startCamera()}
              className="flex items-center gap-1.5 text-white/70 hover:text-white text-sm font-semibold transition-colors"
            >
              <Camera className="w-4 h-4" /> Start Camera
            </button>
          )}

          {cameraActive && devices.length > 1 && (
            <div className="flex items-center gap-1.5">
              <SwitchCamera className="w-3.5 h-3.5 text-white/50" />
              <select
                value={selectedDeviceId}
                onChange={e => startCamera(e.target.value)}
                className="text-[11px] bg-white/10 border border-white/20 text-white rounded px-2 py-0.5 focus:outline-none max-w-[150px]"
              >
                {devices.map(d => (
                  <option key={d.deviceId} value={d.deviceId} className="bg-slate-800">{d.label}</option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div className="flex items-center gap-2">
          <span className="text-white/40 text-xs">SlalomStream Live View</span>
          <button
            onClick={toggleFullscreen}
            className="text-white/70 hover:text-white transition-colors p-1"
            title={fullscreen ? 'Exit fullscreen' : 'Fullscreen'}
          >
            {fullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </div>
  );
}
