import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Waves, Maximize2, Minimize2, Camera, CameraOff, SwitchCamera } from 'lucide-react';

const LS_DEVICE_KEY = 'slalom_camera_device_id';

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

  const activePass = (passes ?? []).find((p: any) => p.status === 'pending') ?? null;

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

  return { tournament, activePass, scores: scores ?? [] };
}

interface VideoDevice { deviceId: string; label: string; }

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

  const { tournament, activePass, scores } = useActiveTournamentInfo();

  const ROLE_SHORT: Record<string, string> = {
    judge_a: 'A', judge_b: 'B', judge_c: 'C', judge_d: 'D', judge_e: 'E', chief_judge: 'CJ',
  };

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

      {/* ── Overlays (always shown) ── */}

      {/* Top-left: tournament name */}
      {tournament && (
        <div className="absolute top-4 left-4 bg-black/60 backdrop-blur text-white px-4 py-2 rounded-xl">
          <div className="flex items-center gap-2">
            <Waves className="w-4 h-4 text-emerald-400" />
            <span className="font-bold text-sm">{tournament.name}</span>
          </div>
        </div>
      )}

      {/* Top-right: active pass info */}
      {activePass && (
        <div className="absolute top-4 right-4 bg-black/70 backdrop-blur text-white px-5 py-3 rounded-2xl text-right space-y-0.5">
          <p className="text-xs font-bold text-emerald-400 uppercase tracking-widest animate-pulse">● On Water</p>
          <p className="font-bold text-2xl leading-tight">{activePass.skier_name}</p>
          <p className="text-slate-300 text-sm">
            R{activePass.round_number} · {activePass.speed_kph}kph · {activePass.rope_length}m
          </p>
        </div>
      )}

      {/* Bottom-left: judge scores */}
      {scores.filter((s: any) => s.judge_role !== 'chief_judge').length > 0 && (
        <div className="absolute bottom-16 left-4 flex flex-col gap-2">
          {scores
            .filter((s: any) => s.judge_role !== 'chief_judge')
            .map((s: any) => (
              <div
                key={s.id}
                className="flex items-center gap-3 bg-black/75 backdrop-blur text-white px-4 py-2 rounded-xl"
              >
                <span className="text-emerald-400 text-sm font-bold w-6">
                  {ROLE_SHORT[s.judge_role] ?? 'J'}
                </span>
                <span className="font-display font-black text-2xl">{s.pass_score === '6_no_gates' ? '6ng' : s.pass_score}</span>
              </div>
            ))}
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
