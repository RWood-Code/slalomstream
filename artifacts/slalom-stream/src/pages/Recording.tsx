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
  CheckCircle2, Download, ExternalLink, SwitchCamera,
  X, Monitor, Gauge, MonitorPlay, FolderOpen, FolderPlus,
  Clock, Flag, AlertTriangle, FileSearch,
} from 'lucide-react';
import { ROPE_LENGTHS, SPEEDS, VALID_IWWF_SCORES, formatRope, formatSpeed, getRopeColour, getJudgingPanel, suggestNextRope } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG } from 'qrcode.react';

const LS_DEVICE_KEY = 'slalom_camera_device_id';
const LS_LITE_MODE  = 'slalom_lite_mode';

// ─── IndexedDB helpers for persisting directory handles ───────────────────────
const IDB_DB_NAME = 'slalom-stream-dirs';
const IDB_STORE   = 'dirs';
const IDB_PRIMARY = 'primary';
const IDB_BACKUP  = 'backup';

function openDirDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(IDB_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}
async function idbGetDir(key: string): Promise<FileSystemDirectoryHandle | null> {
  const db = await openDirDB();
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(key);
    req.onsuccess = () => resolve((req.result as FileSystemDirectoryHandle) ?? null);
    req.onerror   = () => reject(req.error);
  });
}
async function idbSetDir(key: string, handle: FileSystemDirectoryHandle): Promise<void> {
  const db = await openDirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(handle, key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}
async function idbDeleteDir(key: string): Promise<void> {
  const db = await openDirDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(key);
    tx.oncomplete = () => resolve();
    tx.onerror    = () => reject(tx.error);
  });
}

// ─── Save folder hook ─────────────────────────────────────────────────────────
interface SaveFolders {
  primaryHandle: FileSystemDirectoryHandle | null;
  backupHandle:  FileSystemDirectoryHandle | null;
  hasDirectoryPicker: boolean;
  choosePrimary: () => Promise<void>;
  chooseBackup:  () => Promise<void>;
  clearPrimary:  () => Promise<void>;
  clearBackup:   () => Promise<void>;
  /** Write blob to primary (and backup if set). Returns true if at least one folder saved. */
  saveToFolders: (blob: Blob, filename: string) => Promise<{ savedPrimary: boolean; savedBackup: boolean }>;
}

function useSaveFolders(): SaveFolders {
  const [primaryHandle, setPrimaryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupHandle,  setBackupHandle]  = useState<FileSystemDirectoryHandle | null>(null);
  const hasDirectoryPicker = typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  useEffect(() => {
    if (!hasDirectoryPicker) return;
    (async () => {
      try {
        const [p, b] = await Promise.all([idbGetDir(IDB_PRIMARY), idbGetDir(IDB_BACKUP)]);
        if (p) {
          const perm = await (p as unknown as { requestPermission?(o: object): Promise<string> }).requestPermission?.({ mode: 'readwrite' }) ?? 'granted';
          if (perm === 'granted') setPrimaryHandle(p);
        }
        if (b) {
          const perm = await (b as unknown as { requestPermission?(o: object): Promise<string> }).requestPermission?.({ mode: 'readwrite' }) ?? 'granted';
          if (perm === 'granted') setBackupHandle(b);
        }
      } catch { /* permission denied or IDB error — silently ignore */ }
    })();
  }, [hasDirectoryPicker]);

  const pickDir = async (): Promise<FileSystemDirectoryHandle | null> => {
    try {
      const handle = await (window as unknown as { showDirectoryPicker(o?: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
      return handle;
    } catch (e) {
      const err = e as Error;
      if (err.name === 'AbortError') return null;
      if (err.name === 'SecurityError') {
        alert('Folder picker is not available inside the Replit preview pane. Open the app directly in a browser tab to set save folders.');
        return null;
      }
      throw e;
    }
  };

  const choosePrimary = async () => {
    const h = await pickDir();
    if (!h) return;
    await idbSetDir(IDB_PRIMARY, h);
    setPrimaryHandle(h);
  };
  const chooseBackup = async () => {
    const h = await pickDir();
    if (!h) return;
    await idbSetDir(IDB_BACKUP, h);
    setBackupHandle(h);
  };
  const clearPrimary = async () => { await idbDeleteDir(IDB_PRIMARY); setPrimaryHandle(null); };
  const clearBackup  = async () => { await idbDeleteDir(IDB_BACKUP);  setBackupHandle(null); };

  const saveToFolders = async (blob: Blob, filename: string) => {
    const writeToDir = async (dir: FileSystemDirectoryHandle): Promise<boolean> => {
      try {
        const fh = await dir.getFileHandle(filename, { create: true });
        const writable = await fh.createWritable();
        await writable.write(blob);
        await writable.close();
        return true;
      } catch { return false; }
    };
    const [savedPrimary, savedBackup] = await Promise.all([
      primaryHandle ? writeToDir(primaryHandle) : Promise.resolve(false),
      backupHandle  ? writeToDir(backupHandle)  : Promise.resolve(false),
    ]);
    return { savedPrimary, savedBackup };
  };

  return { primaryHandle, backupHandle, hasDirectoryPicker, choosePrimary, chooseBackup, clearPrimary, clearBackup, saveToFolders };
}

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
type VideoMode = 'idle' | 'preview' | 'recording';

export interface VideoDevice { deviceId: string; label: string; }

function useVideoRecorder() {
  const [mode, setMode] = useState<VideoMode>('idle');
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    () => localStorage.getItem(LS_DEVICE_KEY) ?? ''
  );

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const prevUrlRef = useRef<string | null>(null);

  // Enumerate video input devices — labels only available after permission
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
    const targetDevice = deviceId ?? selectedDeviceId;
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 },
      };
      if (targetDevice) videoConstraints.deviceId = { exact: targetDevice };

      const stream = await navigator.mediaDevices.getUserMedia({ video: videoConstraints, audio: false });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        videoRef.current.muted = true;
        videoRef.current.play().catch(() => {});
      }
      if (targetDevice) {
        setSelectedDeviceId(targetDevice);
        localStorage.setItem(LS_DEVICE_KEY, targetDevice);
      }
      await refreshDevices();
      setMode('preview');
    } catch (err: any) {
      setError(err.message || 'Camera access denied');
    }
  }, [selectedDeviceId, refreshDevices]);

  const stopCamera = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setMode('idle');
  }, []);

  const startRecording = useCallback(() => {
    if (!streamRef.current || mode === 'recording') return;
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
        blobRef.current = blob;
        // Revoke previous replay URL
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setReplayUrl(url);
        setShowReplay(true);
        // Stay on live preview — main video never switches to replay
        setMode(streamRef.current ? 'preview' : 'idle');
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setMode('recording');
    } catch (err: any) {
      setError(`Recording not supported: ${err.message}`);
    }
  }, [mode]);

  const stopRecording = useCallback(() => {
    recorderRef.current?.stop();
    recorderRef.current = null;
  }, []);

  const dismissReplay = useCallback(() => setShowReplay(false), []);

  // Save to configured folders (primary + backup), falling back to browser download
  const saveRecording = useCallback(async (
    skierName?: string,
    folderSave?: (blob: Blob, filename: string) => Promise<{ savedPrimary: boolean; savedBackup: boolean }> | null,
  ) => {
    if (!blobRef.current) return;
    const filename = skierName
      ? `${skierName.replace(/\s+/g, '-')}-${Date.now()}.webm`
      : `slalom-${Date.now()}.webm`;

    if (folderSave) {
      const { savedPrimary, savedBackup } = await folderSave(blobRef.current, filename);
      if (savedPrimary || savedBackup) return; // at least one succeeded — done
    }

    // Standard download fallback (no folders set or write failed)
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blobRef.current);
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
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

  useEffect(() => () => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
  }, []);

  return {
    videoRef, mode, replayUrl, showReplay, error, pipActive,
    devices, selectedDeviceId, setSelectedDeviceId,
    startCamera, stopCamera, startRecording, stopRecording,
    dismissReplay, saveRecording, togglePiP,
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
  const { mode, videoRef, error, pipActive } = video;

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

          <Button variant="primary" onClick={() => video.startCamera()} className="flex items-center gap-2">
            <Camera className="w-4 h-4" /> Enable Camera
          </Button>
          {error && (
            <div className="space-y-2">
              <p className="text-red-400 text-xs">{error}</p>
              {(error.toLowerCase().includes('permission') || error.toLowerCase().includes('allow') || error.toLowerCase().includes('denied')) && (
                <div className="bg-amber-900/40 border border-amber-700/50 rounded-lg px-3 py-2 space-y-1">
                  <p className="text-amber-300 text-xs font-semibold">Camera tip</p>
                  <p className="text-amber-200/80 text-[11px] leading-tight">
                    Camera may be blocked if viewing inside a browser preview pane. Open the app in a full browser tab to allow camera access.
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

      {/* Overlays when camera active */}
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
          </div>

          {/* Skier name — top right (during recording) */}
          {mode === 'recording' && activePassName && (
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
                  <span>{s.pass_score === '6_no_gates' ? '6 NG' : s.pass_score}</span>
                  <CheckCircle2 className="w-3 h-3 text-emerald-400" />
                </div>
              ))}
            </div>
          )}

          {/* Controls bar — bottom */}
          <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/80 to-transparent px-3 py-2 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <button onClick={video.stopCamera} className="text-white/70 hover:text-white transition-colors p-1" title="Stop camera">
                <CameraOff className="w-4 h-4" />
              </button>
              {video.devices.length > 1 && (
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
            </div>
            <div className="flex items-center gap-2">
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

// ─── Replay Slide Panel ────────────────────────────────────────────────────────
interface ReplaySlidePanelProps {
  replayUrl: string | null;
  open: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  skierName?: string | null;
}

function ReplaySlidePanel({ replayUrl, open, onClose, onSave, skierName }: ReplaySlidePanelProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(true);

  // When opened or URL changes, load the replay
  useEffect(() => {
    if (!open || !replayUrl || !videoRef.current) return;
    videoRef.current.src = replayUrl;
    videoRef.current.playbackRate = 1;
    videoRef.current.play().catch(() => {});
    setRate(1);
    setPlaying(true);
  }, [open, replayUrl]);

  const changeRate = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  const restart = () => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = 0;
    videoRef.current.play().catch(() => {});
    setPlaying(true);
  };

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); setPlaying(true); }
    else { videoRef.current.pause(); setPlaying(false); }
  };

  return (
    <>
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm"
          onClick={onClose}
        />
      )}

      {/* Slide-up panel */}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-400 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '90vh' }}
      >
        <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-slate-700/60 shrink-0">
            <div className="flex items-center gap-3">
              <MonitorPlay className="w-5 h-5 text-blue-400" />
              <div>
                <p className="font-bold text-white text-sm">Instant Replay</p>
                {skierName && <p className="text-slate-400 text-xs">{skierName}</p>}
              </div>
              <span className="bg-blue-600/30 text-blue-300 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-600/40">
                REVIEW
              </span>
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Video */}
          <div className="relative bg-black shrink-0">
            <video
              ref={videoRef}
              className="w-full"
              style={{ maxHeight: '55vh', objectFit: 'contain' }}
              playsInline
              onClick={togglePlay}
            />
            {!playing && (
              <div
                className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer"
                onClick={togglePlay}
              >
                <div className="w-16 h-16 rounded-full bg-white/20 flex items-center justify-center backdrop-blur">
                  <Play className="w-7 h-7 text-white fill-white ml-1" />
                </div>
              </div>
            )}
          </div>

          {/* Controls */}
          <div className="px-5 py-4 flex items-center justify-between gap-4 shrink-0">
            {/* Playback controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={restart}
                className="flex items-center gap-1.5 text-slate-300 hover:text-white bg-white/10 hover:bg-white/20 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" /> Restart
              </button>

              <div className="flex items-center gap-1 bg-white/10 rounded-lg px-2 py-1.5">
                <Gauge className="w-3.5 h-3.5 text-slate-400 mr-1" />
                {[0.25, 0.5, 1].map(r => (
                  <button
                    key={r}
                    onClick={() => changeRate(r)}
                    className={`text-xs font-bold px-2 py-0.5 rounded transition-colors ${rate === r ? 'text-emerald-400 bg-emerald-400/20' : 'text-slate-400 hover:text-white'}`}
                  >
                    {r === 1 ? '1×' : `${r}×`}
                  </button>
                ))}
              </div>
            </div>

            {/* Save */}
            <button
              onClick={onSave}
              className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors"
            >
              <Download className="w-4 h-4" /> Save Recording
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Lite Score Panel ─────────────────────────────────────────────────────────
// Operator enters all judge scores directly on the Recording screen.
interface LiteScorePanelProps {
  activePassId: number | null;
  tournamentId: number;
  judgeCount: number;
}

const SCORE_LABELS: Record<string, string> = {
  '6_no_gates': '6 NG',
};
function scoreLabel(s: string) { return SCORE_LABELS[s] ?? s; }

function LiteScorePanel({ activePassId, tournamentId, judgeCount }: LiteScorePanelProps) {
  const scoringPanel = getJudgingPanel(judgeCount);
  const [submitted, setSubmitted] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<Record<string, boolean>>({});
  const queryClient = useQueryClient();

  // Reset when pass changes
  useEffect(() => {
    setSubmitted({});
    setBusy({});
  }, [activePassId]);

  const submitScore = async (role: string, score: string) => {
    if (!activePassId) return;
    setBusy(b => ({ ...b, [role]: true }));
    try {
      await fetch(`/api/passes/${activePassId}/judge-scores`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tournament_id: tournamentId,
          judge_id: null,
          judge_name: `Operator`,
          judge_role: role,
          pass_score: score,
        }),
      });
      setSubmitted(s => ({ ...s, [role]: score }));
      queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'passes'] });
    } catch {}
    setBusy(b => ({ ...b, [role]: false }));
  };

  if (!activePassId) {
    return (
      <Card className="p-4 border-dashed">
        <p className="text-center text-sm text-muted-foreground">Start a pass to enter scores in Lite mode.</p>
      </Card>
    );
  }

  return (
    <Card className="overflow-hidden">
      <div className="px-4 py-3 border-b bg-primary/5 flex items-center gap-2">
        <Square className="w-4 h-4 text-primary" />
        <span className="font-bold text-sm">Lite Mode — Score Entry</span>
        <span className="text-xs text-muted-foreground ml-1">· {judgeCount} judge{judgeCount !== 1 ? 's' : ''}</span>
      </div>

      {/* One table per judge */}
      <div
        className="grid gap-0 divide-x"
        style={{ gridTemplateColumns: `repeat(${scoringPanel.length}, minmax(0, 1fr))` }}
      >
        {scoringPanel.map(station => {
          const done = submitted[station.role];
          const loading = busy[station.role];
          return (
            <div key={station.role} className={`p-3 space-y-2 ${done ? 'bg-emerald-50 dark:bg-emerald-950/20' : ''}`}>
              {/* Column header */}
              <div className="text-center pb-1 border-b">
                <p className="font-bold text-sm leading-tight">{station.label}</p>
                {done && (
                  <div className="flex items-center justify-center gap-1 mt-1">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500" />
                    <span className="font-display font-black text-base text-emerald-600">{scoreLabel(done)}</span>
                  </div>
                )}
              </div>

              {/* Score buttons: 3 columns × 4 rows */}
              <div className="grid grid-cols-3 gap-1">
                {VALID_IWWF_SCORES.map(score => {
                  const isSelected = submitted[station.role] === score;
                  return (
                    <button
                      key={score}
                      onClick={() => submitScore(station.role, score)}
                      disabled={loading}
                      className={`
                        text-xs font-bold rounded-lg py-1.5 transition-all border
                        ${isSelected
                          ? 'bg-emerald-500 text-white border-emerald-600 shadow-inner'
                          : 'bg-card hover:bg-primary/10 border-border hover:border-primary text-foreground'
                        }
                        disabled:opacity-40 disabled:cursor-not-allowed
                      `}
                    >
                      {scoreLabel(score)}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}

// ─── Tournament-aware Judge Station QR Panel ───────────────────────────────────
function JudgeConnectPanel({ tournament }: { tournament: any }) {
  const [open, setOpen] = useState(false);
  const { data: network } = useNetworkInfo();
  const { data: appSettings } = useAppSettings();

  const judgeCount = tournament?.judge_count ?? 1;
  const panel = getJudgingPanel(judgeCount);

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

  const getRoleUrl = (role: string) => `${getBase()}/judging?role=${role}&t=${tournament?.id ?? ''}`;

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
                    <QRCodeSVG value={url} size={110} level="M" fgColor="#064e3b" bgColor="#ffffff" />
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

// ─── Save Folder Bar ─────────────────────────────────────────────────────────
function SaveFolderBar({ folders }: { folders: SaveFolders }) {
  const { hasDirectoryPicker, primaryHandle, backupHandle, choosePrimary, chooseBackup, clearPrimary, clearBackup } = folders;

  if (!hasDirectoryPicker) return null;

  const Row = ({
    label, handle, onChoose, onClear,
  }: {
    label: string;
    handle: FileSystemDirectoryHandle | null;
    onChoose: () => void;
    onClear: () => void;
  }) => (
    <div className="flex items-center gap-2 min-w-0">
      <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-14 shrink-0">{label}</span>
      {handle ? (
        <>
          <FolderOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
          <span className="text-xs font-mono text-foreground truncate max-w-[160px]" title={handle.name}>{handle.name}</span>
          <button
            onClick={onChoose}
            className="text-[10px] text-muted-foreground hover:text-foreground transition-colors shrink-0 underline underline-offset-2"
          >
            Change
          </button>
          <button
            onClick={onClear}
            className="text-[10px] text-muted-foreground hover:text-destructive transition-colors shrink-0"
            title="Remove this folder"
          >
            <X className="w-3 h-3" />
          </button>
        </>
      ) : (
        <>
          <button
            onClick={onChoose}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded px-2 py-0.5"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Set folder…
          </button>
        </>
      )}
    </div>
  );

  return (
    <div className="border border-border rounded-xl px-3 py-2.5 space-y-1.5 bg-muted/30">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Save Location</p>
      <Row label="Primary" handle={primaryHandle} onChoose={choosePrimary} onClear={clearPrimary} />
      <Row label="Backup"  handle={backupHandle}  onChoose={chooseBackup}  onClear={clearBackup} />
      {!primaryHandle && !backupHandle && (
        <p className="text-[10px] text-muted-foreground/70 pt-0.5">
          No folder set — recordings will download to your browser&apos;s download folder.
        </p>
      )}
    </div>
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
    query: { enabled: !!activeTournamentId, refetchInterval: 2000 },
  });

  const activePass = React.useMemo(() => passes?.find(p => p.status === 'pending') ?? null, [passes]);
  const recentPasses = React.useMemo(() =>
    passes
      ?.filter(p => p.status !== 'pending')
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
      .slice(0, 8) ?? [],
    [passes]
  );

  const [skierId, setSkierId] = useState('');
  const [rope, setRope] = useState('18.25');
  const [speed, setSpeed] = useState('55');
  const [round, setRound] = useState('1');
  const [disputePassId, setDisputePassId] = useState<number | null>(null);

  // Rope pre-fill: when skierId changes, look at that skier's last pass and suggest next rope
  useEffect(() => {
    if (!skierId || !passes) return;
    const skierPasses = passes
      .filter(p => String(p.skier_id) === skierId && p.status !== 'pending' && p.buoys_scored !== null)
      .sort((a, b) => (b.id ?? 0) - (a.id ?? 0));
    const last = skierPasses[0] ?? null;
    const suggested = last ? suggestNextRope(last) : null;
    if (suggested !== null) setRope(String(suggested));
  }, [skierId]);

  // Persistent settings
  const [liteMode, setLiteMode] = useState(() => localStorage.getItem(LS_LITE_MODE) === 'true');

  const toggleLiteMode = () => {
    const next = !liteMode;
    setLiteMode(next);
    localStorage.setItem(LS_LITE_MODE, String(next));
  };

  const folders = useSaveFolders();
  const video = useVideoRecorder();
  const prevActivePassId = useRef<number | null>(null);
  // Capture skier name at pass-start so replay panel has it after pass ends
  const replaySkierName = useRef<string | undefined>(undefined);

  // Auto-start recording when pass starts, auto-stop when it ends
  useEffect(() => {
    const curr = activePass?.id ?? null;
    const prev = prevActivePassId.current;

    if (curr && !prev && video.mode === 'preview') {
      replaySkierName.current = activePass?.skier_name ?? undefined;
      video.startRecording();
      toast({ title: "Recording started", description: activePass?.skier_name });
    } else if (!curr && prev && video.mode === 'recording') {
      video.stopRecording();
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

  const judgeCount = tournament?.judge_count ?? 1;

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

  const openLiveView = () => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    const url = `${window.location.origin}${base}/live?t=${activeTournamentId}`;
    window.open(url, 'slalom-live', 'width=1280,height=720,menubar=no,toolbar=no,location=no,status=no');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pass Recording"
        subtitle="Operator Control Panel"
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <Badge variant={activePass ? "success" : "outline"} className={activePass ? "animate-pulse" : ""}>
              {activePass ? "● SKIER ON WATER" : "STANDBY"}
            </Badge>

            {/* Lite Mode toggle */}
            <button
              onClick={toggleLiteMode}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border transition-colors ${
                liteMode
                  ? 'bg-amber-500/20 border-amber-500/50 text-amber-600 dark:text-amber-400'
                  : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/30'
              }`}
              title={liteMode ? 'Lite mode: operator enters all scores — click to switch to remote judging' : 'Switch to Lite mode: enter scores directly on this screen'}
            >
              <Square className="w-3.5 h-3.5" />
              {liteMode ? 'Lite ON' : 'Lite'}
            </button>

            {/* Pop-out live view */}
            <button
              onClick={openLiveView}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title="Open fullscreen live view in a new window — drag to a second monitor"
            >
              <Monitor className="w-3.5 h-3.5" /> Live View
            </button>
          </div>
        }
      />

      <div className="grid xl:grid-cols-5 gap-5">
        {/* ── Left column: Video + Judge/Lite panel ── */}
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
                <Button variant="primary" size="sm" onClick={video.startRecording} className="flex items-center gap-2">
                  <Circle className="w-3.5 h-3.5 fill-current" /> Record
                </Button>
              )}
              {video.mode === 'recording' && (
                <Button variant="destructive" size="sm" onClick={video.stopRecording} className="flex items-center gap-2">
                  <Square className="w-3.5 h-3.5 fill-current" /> Stop Recording
                </Button>
              )}
              <span className="text-xs text-muted-foreground ml-1">
                {video.mode === 'preview' && 'Camera live — recording starts automatically when a pass begins'}
                {video.mode === 'recording' && 'Recording… stops automatically when the pass ends — instant replay will appear'}
              </span>
            </div>
          )}

          {/* Save folder settings */}
          <SaveFolderBar folders={folders} />

          {/* Judge connect panel OR lite score entry */}
          {liteMode ? (
            <LiteScorePanel
              activePassId={activePass?.id ?? null}
              tournamentId={activeTournamentId}
              judgeCount={judgeCount}
            />
          ) : (
            <JudgeConnectPanel tournament={tournament} />
          )}
        </div>

        {/* ── Right column: Pass control + recent passes ── */}
        <div className="xl:col-span-2 space-y-5">
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
                <FlagButtons passId={activePass.id} />
                <JudgeScoreStatusBar passId={activePass.id} judgeCount={judgeCount} />
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
                    <Card
                      key={pass.id}
                      className="p-3 hover:border-primary/50 transition-colors flex justify-between items-center cursor-pointer group"
                      onClick={() => setDisputePassId(pass.id ?? null)}
                    >
                      <div className="flex-1 min-w-0">
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
                      <div className="flex items-center gap-2 shrink-0">
                        <FileSearch className="w-3.5 h-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        <div className="bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-200 px-3 py-1 rounded-lg text-center min-w-[3rem]">
                          <p className="text-[10px] uppercase font-bold opacity-70">Score</p>
                          <p className="font-display font-black text-lg leading-none">{pass.buoys_scored ?? '—'}</p>
                        </div>
                      </div>
                    </Card>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Dispute review modal */}
      {disputePassId !== null && (
        <DisputeModal passId={disputePassId} onClose={() => setDisputePassId(null)} />
      )}

      {/* Replay slide-up panel — portal-style, appears over everything */}
      <ReplaySlidePanel
        replayUrl={video.replayUrl}
        open={video.showReplay}
        onClose={video.dismissReplay}
        onSave={async () => {
          const skierName = replaySkierName.current;
          const hasFolders = folders.primaryHandle || folders.backupHandle;
          await video.saveRecording(skierName, hasFolders ? folders.saveToFolders : null);
          if (hasFolders) {
            const parts: string[] = [];
            if (folders.primaryHandle) parts.push(folders.primaryHandle.name);
            if (folders.backupHandle) parts.push(`backup: ${folders.backupHandle.name}`);
            toast({ title: 'Recording saved', description: parts.join(' · ') });
          }
        }}
        skierName={replaySkierName.current}
      />
    </div>
  );
}

// ─── Judge Score Status Bar ─────────────────────────────────────────────────────
// Shows a slot for each expected judge + their submission status in real time
function JudgeScoreStatusBar({ passId, judgeCount }: { passId: number; judgeCount: number }) {
  const { data: scores } = usePassJudgeScores(passId);
  const panel = getJudgingPanel(judgeCount);

  const ROLE_SHORT: Record<string, string> = {
    judge_a: 'A', judge_b: 'B', judge_c: 'C', judge_d: 'D', judge_e: 'E', chief_judge: 'CJ',
  };

  const received = scores?.length ?? 0;
  const allIn = received >= panel.length;

  return (
    <div className="bg-muted/40 rounded-xl p-3 space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
          Judge Status
        </p>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${allIn ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700 animate-pulse'}`}>
          {received}/{panel.length} in
        </span>
      </div>
      <div className={`grid gap-2`} style={{ gridTemplateColumns: `repeat(${panel.length}, 1fr)` }}>
        {panel.map(station => {
          const score = scores?.find((s: any) => s.judge_role === station.role);
          const isIn = !!score;
          return (
            <div
              key={station.role}
              className={`flex flex-col items-center justify-center p-2 rounded-xl border transition-all ${
                isIn
                  ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                  : 'bg-muted/60 border-border'
              }`}
            >
              <span className="text-[9px] font-bold uppercase tracking-wider text-muted-foreground">
                {ROLE_SHORT[station.role] ?? 'J'}
              </span>
              {isIn ? (
                <>
                  <span className="font-display font-black text-base text-emerald-700 dark:text-emerald-400 leading-none mt-1">
                    {score.pass_score === '6_no_gates' ? '6*' : score.pass_score}
                  </span>
                  <CheckCircle2 className="w-3 h-3 text-emerald-500 mt-0.5" />
                </>
              ) : (
                <Clock className="w-3.5 h-3.5 text-muted-foreground/50 mt-1 animate-pulse" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── Fall / Gate-miss flag buttons ────────────────────────────────────────────
function FlagButtons({ passId }: { passId: number }) {
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const addFlag = async (flag: string) => {
    try {
      const res = await fetch(`/api/passes/${passId}/flag`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ flag }),
      });
      if (!res.ok) throw new Error('Failed');
      toast({ title: `${flag} flagged` });
      queryClient.invalidateQueries({ queryKey: ['/api/passes', passId] });
    } catch {
      toast({ title: 'Flag failed', variant: 'destructive' });
    }
  };

  return (
    <div className="flex gap-2">
      <button
        onClick={() => addFlag('FALL')}
        className="flex-1 flex items-center justify-center gap-1.5 bg-red-50 hover:bg-red-100 dark:bg-red-950/30 dark:hover:bg-red-950/60 text-red-700 dark:text-red-400 border border-red-200 dark:border-red-800 rounded-xl py-2 text-xs font-bold transition-colors"
      >
        <Flag className="w-3.5 h-3.5" /> FALL
      </button>
      <button
        onClick={() => addFlag('GATE MISS')}
        className="flex-1 flex items-center justify-center gap-1.5 bg-amber-50 hover:bg-amber-100 dark:bg-amber-950/30 dark:hover:bg-amber-950/60 text-amber-700 dark:text-amber-400 border border-amber-200 dark:border-amber-800 rounded-xl py-2 text-xs font-bold transition-colors"
      >
        <AlertTriangle className="w-3.5 h-3.5" /> GATE MISS
      </button>
    </div>
  );
}

// ─── Dispute Review Modal ─────────────────────────────────────────────────────
function DisputeModal({ passId, onClose }: { passId: number; onClose: () => void }) {
  const { data: scores } = usePassJudgeScores(passId);
  const { data: passData } = useQuery({
    queryKey: ['/api/passes', passId],
    queryFn: async () => { const r = await fetch(`/api/passes/${passId}`); return r.json(); },
  });

  const ROLE_LABELS: Record<string, string> = {
    judge_a: 'Judge A', judge_b: 'Judge B', judge_c: 'Judge C',
    judge_d: 'Judge D', judge_e: 'Judge E', chief_judge: 'Chief Judge',
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-lg leading-none">{passData?.skier_name ?? '…'}</h3>
            <p className="text-sm text-muted-foreground mt-1">
              Rnd {passData?.round_number} · {passData?.speed_kph}kph · {passData?.rope_length}m
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-xl hover:bg-muted transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="border-t pt-4 space-y-2">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Judge Scores</p>
          {!scores || scores.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No judge scores recorded</p>
          ) : (
            (scores as any[]).map(s => (
              <div key={s.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                <span className="font-semibold text-sm">{ROLE_LABELS[s.judge_role] ?? s.judge_role}</span>
                <span className="font-display font-black text-xl text-primary">
                  {s.pass_score === '6_no_gates' ? '6 (no gates)' : s.pass_score}
                </span>
              </div>
            ))
          )}
        </div>

        {passData?.final_score !== null && passData?.final_score !== undefined && (
          <div className="flex items-center justify-between p-3 bg-primary/10 rounded-xl border border-primary/20">
            <span className="font-bold text-sm">Final Score</span>
            <span className="font-display font-black text-2xl text-primary">{passData.final_score}</span>
          </div>
        )}
      </div>
    </div>
  );
}
