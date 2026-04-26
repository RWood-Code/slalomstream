import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore } from '@/lib/store';
import { authedFetch } from '@/lib/authed-fetch';
import {
  useGetTournament, useListSkiers, useListPasses,
  useCreatePass, useUpdatePass, useCreateSkier,
} from '@workspace/api-client-react';
import { Card, Button, Badge, PageHeader, Select, Input } from '@/components/ui/shared';
import {
  Play, SquareSquare, Timer, User, Wifi, ChevronDown, ChevronUp,
  Camera, CameraOff, Circle, Square, Maximize2, RefreshCw,
  CheckCircle2, Download, ExternalLink, SwitchCamera,
  X, Monitor, Gauge, MonitorPlay, FolderOpen, FolderPlus,
  Clock, Flag, AlertTriangle, FileSearch, UserPlus, Trophy,
  Mic, MicOff, BookmarkPlus, SkipBack, SkipForward,
  ChevronLeft, ChevronRight, Repeat, HardDrive, WifiOff,
  Video, Scissors, Film, Search, Trash2,
} from 'lucide-react';
import { ROPE_LENGTHS, SPEEDS, VALID_IWWF_SCORES, DIVISIONS, formatRope, formatSpeed, getRopeColour, getJudgingPanel, suggestNextRope } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { QRCodeSVG } from 'qrcode.react';
import { isTauri, tauriInvoke, tauriConvertFileSrc } from '@/lib/tauri';

const LS_DEVICE_KEY = 'slalom_camera_device_id';
const LS_LITE_MODE  = 'slalom_lite_mode';
const MAX_MARKERS   = 8;

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

// ─── IndexedDB helpers for persisting individual recording file handles ────────
// Stores FileSystemFileHandle references keyed by filename so the library can
// offer playback of past recordings without requiring directory re-selection.
const IDB_REC_DB_NAME = 'slalom-stream-recordings';
const IDB_REC_STORE   = 'files';

const IDB_REC_MARKERS_STORE = 'markers';

function openRecordingsDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_REC_DB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_REC_STORE)) {
        db.createObjectStore(IDB_REC_STORE);
      }
      if (!db.objectStoreNames.contains(IDB_REC_MARKERS_STORE)) {
        db.createObjectStore(IDB_REC_MARKERS_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror   = () => reject(req.error);
  });
}

async function idbRegisterRecordingHandle(filename: string, handle: FileSystemFileHandle): Promise<void> {
  try {
    const db = await openRecordingsDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_REC_STORE, 'readwrite');
      tx.objectStore(IDB_REC_STORE).put(handle, filename);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch { /* non-critical — library scan still works via dir handle */ }
}

async function idbStoreMarkerData(filename: string, markers: MarkerMs[]): Promise<void> {
  try {
    const db = await openRecordingsDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_REC_MARKERS_STORE, 'readwrite');
      tx.objectStore(IDB_REC_MARKERS_STORE).put(markers, filename);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch { /* non-critical */ }
}

async function idbGetMarkerData(filename: string): Promise<MarkerMs[]> {
  try {
    const db = await openRecordingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_REC_MARKERS_STORE, 'readonly');
      const req = tx.objectStore(IDB_REC_MARKERS_STORE).get(filename);
      req.onsuccess = () => resolve((req.result as MarkerMs[] | undefined) ?? []);
      req.onerror   = () => reject(req.error);
    });
  } catch {
    return [];
  }
}

async function idbGetMarkerFilenames(): Promise<Set<string>> {
  try {
    const db = await openRecordingsDB();
    return new Promise((resolve, reject) => {
      const tx = db.transaction(IDB_REC_MARKERS_STORE, 'readonly');
      const store = tx.objectStore(IDB_REC_MARKERS_STORE);
      const names = new Set<string>();
      const cursorReq = store.openKeyCursor();
      cursorReq.onsuccess = () => {
        const cursor = cursorReq.result;
        if (cursor) { names.add(cursor.key as string); cursor.continue(); }
        else resolve(names);
      };
      cursorReq.onerror = () => reject(cursorReq.error);
    });
  } catch {
    return new Set<string>();
  }
}

interface RecordingHandleEntry { filename: string; handle: FileSystemFileHandle }

async function idbGetAllRecordingHandles(): Promise<RecordingHandleEntry[]> {
  const db = await openRecordingsDB();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(IDB_REC_STORE, 'readonly');
    const store = tx.objectStore(IDB_REC_STORE);
    const results: RecordingHandleEntry[] = [];
    const cursorReq = store.openCursor();
    cursorReq.onsuccess = () => {
      const cursor = cursorReq.result;
      if (cursor) {
        results.push({ filename: cursor.key as string, handle: cursor.value as FileSystemFileHandle });
        cursor.continue();
      } else {
        resolve(results);
      }
    };
    cursorReq.onerror = () => reject(cursorReq.error);
  });
}

async function idbDeleteRecordingHandle(filename: string): Promise<void> {
  try {
    const db = await openRecordingsDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction([IDB_REC_STORE, IDB_REC_MARKERS_STORE], 'readwrite');
      tx.objectStore(IDB_REC_STORE).delete(filename);
      tx.objectStore(IDB_REC_MARKERS_STORE).delete(filename);
      tx.oncomplete = () => resolve();
      tx.onerror    = () => reject(tx.error);
    });
  } catch { /* non-critical */ }
}

// ─── Save folder hook (Tauri-native + browser fallback) ───────────────────────
interface FolderEntry {
  path: string;
  name: string;
  freeBytes: number | null;
  accessible: boolean;
}

interface SaveFolders {
  primary: FolderEntry | null;
  backup:  FolderEntry | null;
  hasDirectoryPicker: boolean;
  choosePrimary: () => Promise<void>;
  chooseBackup:  () => Promise<void>;
  clearPrimary:  () => Promise<void>;
  clearBackup:   () => Promise<void>;
  saveToFolders: (blob: Blob, filename: string) => Promise<{ savedPrimary: boolean; savedBackup: boolean }>;
  /** Primary path string (Tauri mode) or null */
  primaryPath: string | null;
  /** Backup path string (Tauri mode) or null */
  backupPath: string | null;
  /** Legacy browser handle (for non-Tauri fallback) */
  primaryHandle: FileSystemDirectoryHandle | null;
  backupHandle:  FileSystemDirectoryHandle | null;
}

const FIVE_GB = 5 * 1024 * 1024 * 1024;

async function getDiskInfo(path: string): Promise<{ freeBytes: number | null; accessible: boolean }> {
  if (!isTauri) return { freeBytes: null, accessible: true };
  try {
    const accessible = await tauriInvoke<boolean>('check_path_accessible', { path });
    if (!accessible) return { freeBytes: null, accessible: false };
    const freeBytes = await tauriInvoke<number>('get_disk_space', { path });
    return { freeBytes, accessible: true };
  } catch {
    return { freeBytes: null, accessible: false };
  }
}

function pathToName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).pop() ?? path;
}

function useSaveFolders(): SaveFolders {
  // Tauri-mode: string paths
  const [primaryPath, setPrimaryPath] = useState<string | null>(null);
  const [backupPath,  setBackupPath]  = useState<string | null>(null);
  const [primaryInfo, setPrimaryInfo] = useState<{ freeBytes: number | null; accessible: boolean }>({ freeBytes: null, accessible: true });
  const [backupInfo,  setBackupInfo]  = useState<{ freeBytes: number | null; accessible: boolean }>({ freeBytes: null, accessible: true });

  // Browser-mode: directory handles (IndexedDB)
  const [primaryHandle, setPrimaryHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const [backupHandle,  setBackupHandle]  = useState<FileSystemDirectoryHandle | null>(null);

  const hasDirectoryPicker = isTauri || typeof (window as unknown as { showDirectoryPicker?: unknown }).showDirectoryPicker === 'function';

  // Load persisted paths on startup
  useEffect(() => {
    if (isTauri) {
      (async () => {
        try {
          const config = await tauriInvoke<{ primary?: string; backup?: string }>('get_folder_config');
          if (config.primary) {
            setPrimaryPath(config.primary);
            getDiskInfo(config.primary).then(setPrimaryInfo);
          }
          if (config.backup) {
            setBackupPath(config.backup);
            getDiskInfo(config.backup).then(setBackupInfo);
          }
        } catch {}
      })();
    } else {
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
        } catch {}
      })();
    }
  }, []);

  const persistConfig = async (primary: string | null, backup: string | null) => {
    if (!isTauri) return;
    await tauriInvoke('set_folder_config', { config: { primary, backup } }).catch(() => {});
  };

  const choosePrimary = async () => {
    if (isTauri) {
      try {
        const path = await tauriInvoke<string | null>('choose_save_folder');
        if (!path) return;
        setPrimaryPath(path);
        getDiskInfo(path).then(setPrimaryInfo);
        await persistConfig(path, backupPath);
      } catch {}
    } else {
      try {
        const handle = await (window as unknown as { showDirectoryPicker(o?: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
        await idbSetDir(IDB_PRIMARY, handle);
        setPrimaryHandle(handle);
      } catch (e) {
        const err = e as Error;
        if (err.name === 'AbortError') return;
        if (err.name === 'SecurityError') alert('Folder picker unavailable in preview pane. Open in a full browser tab.');
      }
    }
  };

  const chooseBackup = async () => {
    if (isTauri) {
      try {
        const path = await tauriInvoke<string | null>('choose_save_folder');
        if (!path) return;
        setBackupPath(path);
        getDiskInfo(path).then(setBackupInfo);
        await persistConfig(primaryPath, path);
      } catch {}
    } else {
      try {
        const handle = await (window as unknown as { showDirectoryPicker(o?: object): Promise<FileSystemDirectoryHandle> }).showDirectoryPicker({ mode: 'readwrite' });
        await idbSetDir(IDB_BACKUP, handle);
        setBackupHandle(handle);
      } catch (e) {
        const err = e as Error;
        if (err.name === 'AbortError') return;
        if (err.name === 'SecurityError') alert('Folder picker unavailable in preview pane. Open in a full browser tab.');
      }
    }
  };

  const clearPrimary = async () => {
    if (isTauri) {
      setPrimaryPath(null);
      setPrimaryInfo({ freeBytes: null, accessible: true });
      await persistConfig(null, backupPath);
    } else {
      await idbDeleteDir(IDB_PRIMARY);
      setPrimaryHandle(null);
    }
  };

  const clearBackup = async () => {
    if (isTauri) {
      setBackupPath(null);
      setBackupInfo({ freeBytes: null, accessible: true });
      await persistConfig(primaryPath, null);
    } else {
      await idbDeleteDir(IDB_BACKUP);
      setBackupHandle(null);
    }
  };

  const saveToFolders = async (blob: Blob, filename: string) => {
    let savedPrimary = false;
    let savedBackup  = false;

    if (isTauri) {
      const saveTo = async (dir: string): Promise<boolean> => {
        try {
          const sep = dir.includes('\\') ? '\\' : '/';
          const filePath = `${dir}${sep}${filename}`;
          const ab = await blob.arrayBuffer();
          const bytes = Array.from(new Uint8Array(ab));
          await tauriInvoke('write_binary_file', { path: filePath, data: bytes });
          return true;
        } catch { return false; }
      };
      if (primaryPath) savedPrimary = await saveTo(primaryPath);
      if (backupPath)  savedBackup  = await saveTo(backupPath);
    } else {
      const writeToDir = async (dir: FileSystemDirectoryHandle): Promise<boolean> => {
        try {
          const fh = await dir.getFileHandle(filename, { create: true });
          const writable = await fh.createWritable();
          await writable.write(blob);
          await writable.close();
          void idbRegisterRecordingHandle(filename, fh);
          return true;
        } catch { return false; }
      };
      [savedPrimary, savedBackup] = await Promise.all([
        primaryHandle ? writeToDir(primaryHandle) : Promise.resolve(false),
        backupHandle  ? writeToDir(backupHandle)  : Promise.resolve(false),
      ]);
    }

    return { savedPrimary, savedBackup };
  };

  const primary: FolderEntry | null = isTauri && primaryPath
    ? { path: primaryPath, name: pathToName(primaryPath), freeBytes: primaryInfo.freeBytes, accessible: primaryInfo.accessible }
    : !isTauri && primaryHandle
      ? { path: primaryHandle.name, name: primaryHandle.name, freeBytes: null, accessible: true }
      : null;

  const backup: FolderEntry | null = isTauri && backupPath
    ? { path: backupPath, name: pathToName(backupPath), freeBytes: backupInfo.freeBytes, accessible: backupInfo.accessible }
    : !isTauri && backupHandle
      ? { path: backupHandle.name, name: backupHandle.name, freeBytes: null, accessible: true }
      : null;

  return {
    primary, backup, hasDirectoryPicker,
    choosePrimary, chooseBackup, clearPrimary, clearBackup, saveToFolders,
    primaryPath, backupPath, primaryHandle, backupHandle,
  };
}

// ─── SurePath connection status ───────────────────────────────────────────────
interface SurePathStatusData {
  connected: boolean;
  connecting: boolean;
  lastMessage: { ts: string; type: string } | null;
  passesCreated: number;
  error: string | null;
}

function useSurePathStatus() {
  return useQuery<SurePathStatusData>({
    queryKey: ['surepath-status'],
    queryFn: async () => { const r = await fetch('/api/surepath/status'); return r.json(); },
    refetchInterval: 10000,
    staleTime: 8000,
  });
}

function SurePathDot() {
  const { data: sp } = useSurePathStatus();
  if (!sp) return null;

  const lastMsgAgeSec = sp.lastMessage?.ts
    ? Math.floor((Date.now() - new Date(sp.lastMessage.ts).getTime()) / 1000)
    : null;

  const health: 'green' | 'amber' | 'red' =
    sp.connected && lastMsgAgeSec !== null && lastMsgAgeSec <= 60 ? 'green' :
    sp.connected || sp.connecting ? 'amber' :
    'red';

  const statusLabel =
    health === 'green' ? 'SurePath: live' :
    health === 'amber' ? (sp.connecting ? 'SurePath: connecting' : 'SurePath: stale') :
    'SurePath: offline';

  const lastMsgLabel = sp.lastMessage?.ts
    ? (() => {
        const ageSec = Math.floor((Date.now() - new Date(sp.lastMessage.ts).getTime()) / 1000);
        const rel = ageSec < 5 ? 'just now' : ageSec < 60 ? `${ageSec}s ago` : ageSec < 3600 ? `${Math.floor(ageSec / 60)} min ago` : `${Math.floor(ageSec / 3600)} hr ago`;
        return `Last message: ${rel}`;
      })()
    : 'No messages received yet';

  const tooltip = [statusLabel, lastMsgLabel, sp.error ? `Error: ${sp.error}` : ''].filter(Boolean).join(' · ');

  return (
    <span
      title={tooltip}
      className={`flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg border transition-colors ${
        health === 'green'
          ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
          : health === 'amber'
            ? 'bg-amber-500/15 border-amber-500/30 text-amber-600 dark:text-amber-400'
            : 'bg-red-500/10 border-red-500/20 text-red-500 dark:text-red-400'
      }`}
    >
      <span className={`w-2 h-2 rounded-full shrink-0 ${
        health === 'green' ? 'bg-emerald-500' : health === 'amber' ? 'bg-amber-500 animate-pulse' : 'bg-red-500'
      }`} />
      SurePath
    </span>
  );
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
export interface AudioDevice { deviceId: string; label: string; }

/** ms elapsed since recording started, stamped when addMarker() is called */
export type MarkerMs = number;

function buildFilename(
  skierName?: string | null,
  division?: string | null,
  rope?: number | null,
  format: 'mp4' | 'webm' = 'webm',
): { base: string; ext: string } {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const parts: string[] = [];
  if (skierName) parts.push(skierName.replace(/\s+/g, '-').replace(/[^A-Za-z0-9-]/g, ''));
  if (division)  parts.push(division.replace(/\s+/g, '-'));
  if (rope)      parts.push(`${rope}m`);
  parts.push(ts);
  const base = parts.join('-') || `slalom-${ts}`;
  return { base, ext: format };
}

function useVideoRecorder() {
  const [mode, setMode] = useState<VideoMode>('idle');
  const [replayUrl, setReplayUrl] = useState<string | null>(null);
  const [replayFilename, setReplayFilename] = useState<string | null>(null);
  const [showReplay, setShowReplay] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pipActive, setPipActive] = useState(false);
  const [devices, setDevices] = useState<VideoDevice[]>([]);
  const [audioDevices, setAudioDevices] = useState<AudioDevice[]>([]);
  const [selectedDeviceId, setSelectedDeviceId] = useState<string>(
    () => localStorage.getItem(LS_DEVICE_KEY) ?? ''
  );
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [selectedAudioDeviceId, setSelectedAudioDeviceId] = useState<string>('');
  const [markers, setMarkers] = useState<MarkerMs[]>([]);
  const [ffmpegSavedPath, setFfmpegSavedPath] = useState<string | null>(null);

  // Tauri-mode: native device lists from FFmpeg (device_name is what FFmpeg needs)
  const [ffmpegVideoDevices, setFfmpegVideoDevices] = useState<{ deviceId: string; label: string; native_name: string }[]>([]);
  const [ffmpegAudioDevices, setFfmpegAudioDevices] = useState<{ deviceId: string; label: string; native_name: string }[]>([]);
  const [selectedFfmpegVideoName, setSelectedFfmpegVideoName] = useState<string>('0');
  const [selectedFfmpegAudioName, setSelectedFfmpegAudioName] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  // Tauri mode: MJPEG preview displayed in an <img> element (not <video>)
  const previewImgRef = useRef<HTMLImageElement>(null);
  const PREVIEW_PORT = 9877;
  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const blobRef = useRef<Blob | null>(null);
  const prevUrlRef = useRef<string | null>(null);
  const recordingStartRef = useRef<number | null>(null);
  const markersRef = useRef<MarkerMs[]>([]);
  // Tauri/FFmpeg recording state
  const isTauriRecordingRef = useRef(false);
  const ffmpegOutputPathRef = useRef<string | null>(null);

  const refreshDevices = useCallback(async () => {
    try {
      const all = await navigator.mediaDevices.enumerateDevices();
      const cams = all
        .filter(d => d.kind === 'videoinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Camera ${i + 1}` }));
      const mics = all
        .filter(d => d.kind === 'audioinput')
        .map((d, i) => ({ deviceId: d.deviceId, label: d.label || `Mic ${i + 1}` }));
      setDevices(cams);
      setAudioDevices(mics);
      setSelectedDeviceId(prev => {
        const stored = localStorage.getItem(LS_DEVICE_KEY);
        if (stored && cams.find(c => c.deviceId === stored)) return stored;
        if (prev && cams.find(c => c.deviceId === prev)) return prev;
        return cams[0]?.deviceId ?? '';
      });
      setSelectedAudioDeviceId(prev => {
        if (prev && mics.find(m => m.deviceId === prev)) return prev;
        return mics[0]?.deviceId ?? '';
      });
    } catch {}
  }, []);

  useEffect(() => {
    refreshDevices();
    navigator.mediaDevices?.addEventListener?.('devicechange', refreshDevices);
    return () => navigator.mediaDevices?.removeEventListener?.('devicechange', refreshDevices);
  }, [refreshDevices]);

  // Tauri only: load native FFmpeg device names for capture
  useEffect(() => {
    if (!isTauri) return;
    (async () => {
      try {
        const [vDevs, aDevs] = await Promise.all([
          tauriInvoke<{ deviceId: string; label: string; native_name: string }[]>('list_video_devices'),
          tauriInvoke<{ deviceId: string; label: string; native_name: string }[]>('list_audio_devices'),
        ]);
        setFfmpegVideoDevices(vDevs);
        setFfmpegAudioDevices(aDevs);
        if (vDevs.length > 0) setSelectedFfmpegVideoName(vDevs[0].native_name);
        if (aDevs.length > 0) setSelectedFfmpegAudioName(aDevs[0].native_name);
      } catch {}
    })();
  }, []);

  const startCamera = useCallback(async (deviceId?: string) => {
    setError(null);
    const targetDevice = deviceId ?? selectedDeviceId;

    // ── Tauri mode: use FFmpeg MJPEG loopback for preview ─────────────────────
    // FFmpeg captures directly from the native device (avfoundation/dshow/v4l2)
    // and streams MJPEG over HTTP on 127.0.0.1:PREVIEW_PORT.  The WebView shows
    // this via an <img> element, bypassing getUserMedia device-permission issues
    // and surfacing capture cards (e.g. Elgato CamLink) that browsers may not enumerate.
    if (isTauri) {
      try {
        // Stop any existing preview before restarting with new device
        await tauriInvoke('stop_ffmpeg_preview').catch(() => {});
        const deviceToUse = selectedFfmpegVideoName || '0';
        await tauriInvoke('start_ffmpeg_preview', {
          deviceName: deviceToUse,
          previewPort: PREVIEW_PORT,
        });
        if (previewImgRef.current) {
          // Append timestamp to force browser to reload the stream
          previewImgRef.current.src = `http://127.0.0.1:${PREVIEW_PORT}/?t=${Date.now()}`;
        }
        setMode('preview');
      } catch (err: any) {
        setError(`FFmpeg preview failed: ${String(err)}`);
      }
      return;
    }

    // ── Browser mode: getUserMedia ─────────────────────────────────────────────
    try {
      streamRef.current?.getTracks().forEach(t => t.stop());
      streamRef.current = null;

      const videoConstraints: MediaTrackConstraints = {
        width: { ideal: 1920 }, height: { ideal: 1080 }, frameRate: { ideal: 60 },
      };
      if (targetDevice) videoConstraints.deviceId = { exact: targetDevice };

      const audioConstraints: boolean | MediaTrackConstraints = audioEnabled
        ? (selectedAudioDeviceId ? { deviceId: { exact: selectedAudioDeviceId } } : true)
        : false;

      const stream = await navigator.mediaDevices.getUserMedia({
        video: videoConstraints,
        audio: audioConstraints,
      });
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
  }, [selectedDeviceId, selectedFfmpegVideoName, audioEnabled, selectedAudioDeviceId, refreshDevices]);

  const stopCamera = useCallback(() => {
    if (isTauri) {
      tauriInvoke('stop_ffmpeg_preview').catch(() => {});
      if (previewImgRef.current) previewImgRef.current.src = '';
    }
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setMode('idle');
  }, []);

  const startRecording = useCallback(async (opts?: {
    skierName?: string; division?: string; rope?: number;
    /** Primary save folder path (Tauri mode) — if provided, FFmpeg writes directly to disk */
    outputDir?: string | null;
  }): Promise<boolean> => {
    if (mode === 'recording') return false;
    markersRef.current = [];
    setMarkers([]);
    recordingStartRef.current = Date.now();

    // ── Tauri / FFmpeg path ────────────────────────────────────────────────────
    if (isTauri && opts?.outputDir) {
      // Stop standalone preview first — the recording process takes over camera +
      // also serves MJPEG preview on the same port via its embedded HTTP server.
      await tauriInvoke('stop_ffmpeg_preview').catch(() => {});

      const { base, ext } = buildFilename(opts?.skierName, opts?.division, opts?.rope, 'mp4');
      const filename = `${base}.${ext}`;
      const sep = opts.outputDir.includes('\\') ? '\\' : '/';
      const outputPath = `${opts.outputDir}${sep}${filename}`;
      ffmpegOutputPathRef.current = outputPath;
      isTauriRecordingRef.current = false; // will flip on success

      try {
        await tauriInvoke('start_ffmpeg_recording', {
          outputPath,
          deviceName: selectedFfmpegVideoName,
          audioDeviceName: audioEnabled ? (selectedFfmpegAudioName ?? null) : null,
          previewPort: PREVIEW_PORT,
        });
        isTauriRecordingRef.current = true;
        // Keep the live preview feed pointing at the same port — now served by the recording process
        if (previewImgRef.current) {
          previewImgRef.current.src = `http://127.0.0.1:${PREVIEW_PORT}/?t=${Date.now()}`;
        }
        setReplayFilename(filename);
        setMode('recording');
        return true;
      } catch (err: any) {
        setError(`FFmpeg recording failed: ${String(err)}`);
        recordingStartRef.current = null;
        return false;
      }
    }

    // ── Tauri with no save folder: block recording, surface explicit error ────────
    // In Tauri mode, recordings must be MP4 via FFmpeg (WebM fallback is not supported).
    // A primary save folder must be configured before recording can start.
    if (isTauri) {
      setError('Set a primary save folder before recording. Click the folder icon below.');
      recordingStartRef.current = null;
      return false;
    }

    // ── Browser / MediaRecorder fallback ──────────────────────────────────────
    if (!streamRef.current) return false;
    chunksRef.current = [];

    const mimeType =
      MediaRecorder.isTypeSupported('video/webm;codecs=vp9') ? 'video/webm;codecs=vp9' :
      MediaRecorder.isTypeSupported('video/webm;codecs=vp8') ? 'video/webm;codecs=vp8' :
      'video/webm';

    const { base, ext } = buildFilename(opts?.skierName, opts?.division, opts?.rope, 'webm');
    const filename = `${base}.${ext}`;

    try {
      const recorder = new MediaRecorder(streamRef.current, { mimeType });
      recorder.ondataavailable = e => { if (e.data.size > 0) chunksRef.current.push(e.data); };
      recorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mimeType });
        blobRef.current = blob;
        if (prevUrlRef.current) URL.revokeObjectURL(prevUrlRef.current);
        const url = URL.createObjectURL(blob);
        prevUrlRef.current = url;
        setReplayUrl(url);
        setReplayFilename(filename);
        setMarkers([...markersRef.current]);
        setShowReplay(true);
        setMode(streamRef.current ? 'preview' : 'idle');
        recordingStartRef.current = null;
      };
      recorder.start(100);
      recorderRef.current = recorder;
      setMode('recording');
      return true;
    } catch (err: any) {
      setError(`Recording not supported: ${err.message}`);
      return false;
    }
  }, [mode, selectedDeviceId, audioEnabled, selectedAudioDeviceId, selectedFfmpegVideoName, selectedFfmpegAudioName]);

  const stopRecording = useCallback(async () => {
    if (isTauriRecordingRef.current) {
      // ── Tauri / FFmpeg stop ────────────────────────────────────────────────
      isTauriRecordingRef.current = false;
      try {
        await tauriInvoke('stop_ffmpeg_recording');
      } catch {}

      const outputPath = ffmpegOutputPathRef.current;
      if (outputPath) {
        setFfmpegSavedPath(outputPath);
        setMarkers([...markersRef.current]);
        // Convert the saved file path to a tauri:// asset URL for playback.
        // Uses tauriConvertFileSrc which fails explicitly if the API is unavailable.
        try {
          const replayUrl = tauriConvertFileSrc(outputPath);
          setReplayUrl(replayUrl);
          setReplayFilename(outputPath.split(/[\\/]/).pop() ?? null);
          setShowReplay(true);
        } catch (err: any) {
          setError(`Replay unavailable: ${err.message}`);
        }
      }

      setMode('preview');
      recordingStartRef.current = null;

      // Restart MJPEG preview after recording ends so the user sees live camera
      // while reviewing the replay in the panel above.
      try {
        await tauriInvoke('start_ffmpeg_preview', {
          deviceName: selectedFfmpegVideoName,
          previewPort: PREVIEW_PORT,
        });
        if (previewImgRef.current) {
          previewImgRef.current.src = `http://127.0.0.1:${PREVIEW_PORT}/?t=${Date.now()}`;
        }
      } catch {}
    } else {
      // ── Browser / MediaRecorder stop ──────────────────────────────────────
      recorderRef.current?.stop();
      recorderRef.current = null;
    }
  }, [selectedFfmpegVideoName]);

  const addMarker = useCallback(() => {
    if (mode !== 'recording' || !recordingStartRef.current) return;
    if (markersRef.current.length >= MAX_MARKERS) return;
    const elapsed = Date.now() - recordingStartRef.current;
    markersRef.current = [...markersRef.current, elapsed];
    setMarkers([...markersRef.current]);
  }, [mode]);

  // M key shortcut for marking
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'm' || e.key === 'M') {
        if ((e.target as HTMLElement)?.tagName === 'INPUT' || (e.target as HTMLElement)?.tagName === 'TEXTAREA') return;
        addMarker();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [addMarker]);

  const dismissReplay = useCallback(() => setShowReplay(false), []);

  const saveRecording = useCallback(async (opts: {
    filename?: string | null;
    folderSave?: ((blob: Blob, filename: string) => Promise<{ savedPrimary: boolean; savedBackup: boolean }>) | null;
    primaryPath?: string | null;
    backupPath?: string | null;
    primaryHandle?: FileSystemDirectoryHandle | null;
    backupHandle?: FileSystemDirectoryHandle | null;
    markersToSave?: MarkerMs[];
  } = {}) => {
    const filename = opts.filename ?? replayFilename ?? `slalom-${Date.now()}.webm`;

    // ── Tauri FFmpeg mode: primary file already on disk — copy to backup + write markers ──
    if (ffmpegSavedPath) {
      let savedBackup = false;

      // Copy MP4 to backup folder if configured
      if (opts.backupPath) {
        const sep = opts.backupPath.includes('\\') ? '\\' : '/';
        const backupFilePath = `${opts.backupPath}${sep}${filename}`;
        savedBackup = await tauriInvoke<boolean>('copy_file', {
          src: ffmpegSavedPath,
          dst: backupFilePath,
        }).then(() => true).catch(() => false);
      }

      // Write markers sidecar to primary + backup
      if (opts.markersToSave && opts.markersToSave.length > 0) {
        const markerData = JSON.stringify({
          filename: ffmpegSavedPath.split(/[\\/]/).pop(),
          markers: opts.markersToSave.map((ms, i) => ({
            index: i, elapsed_ms: ms, label: `Marker ${i + 1}`,
          })),
        }, null, 2);
        const markersFilename = filename.replace(/\.[^.]+$/, '') + '.markers.json';
        const paths = [opts.primaryPath, opts.backupPath].filter(Boolean) as string[];
        for (const dir of paths) {
          const sep = dir.includes('\\') ? '\\' : '/';
          await tauriInvoke('write_text_file', { path: `${dir}${sep}${markersFilename}`, content: markerData }).catch(() => {});
        }
      }

      return { savedPrimary: true, savedBackup };
    }

    if (!blobRef.current) return { savedPrimary: false, savedBackup: false };

    let savedPrimary = false;
    let savedBackup  = false;

    if (opts.folderSave) {
      const result = await opts.folderSave(blobRef.current, filename);
      savedPrimary = result.savedPrimary;
      savedBackup  = result.savedBackup;

      // Write markers JSON sidecar
      if (opts.markersToSave && opts.markersToSave.length > 0) {
        const markerData = JSON.stringify({
          filename,
          markers: opts.markersToSave.map((ms, i) => ({
            index: i,
            elapsed_ms: ms,
            label: `Marker ${i + 1}`,
          })),
        }, null, 2);

        const markersFilename = filename.replace(/\.[^.]+$/, '') + '.markers.json';

        if (isTauri) {
          const paths = [opts.primaryPath, opts.backupPath].filter(Boolean) as string[];
          for (const dir of paths) {
            const sep = dir.includes('\\') ? '\\' : '/';
            const markerPath = `${dir}${sep}${markersFilename}`;
            await tauriInvoke('write_text_file', { path: markerPath, content: markerData }).catch(() => {});
          }
        } else {
          // Browser mode: persist marker timestamps in IndexedDB so the library
          // can load them when replaying a saved recording.
          void idbStoreMarkerData(filename, opts.markersToSave);

          // Also write a .markers.json sidecar to configured directory handles if available.
          const markerBlob = new Blob([markerData], { type: 'application/json' });
          for (const dir of [opts.primaryHandle, opts.backupHandle].filter(Boolean) as FileSystemDirectoryHandle[]) {
            try {
              const mfh = await dir.getFileHandle(markersFilename, { create: true });
              const writable = await mfh.createWritable();
              await writable.write(markerBlob);
              await writable.close();
            } catch { /* non-critical */ }
          }
        }
      }
    }

    if (!savedPrimary && !savedBackup) {
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blobRef.current);
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    }

    return { savedPrimary, savedBackup };
  }, [replayFilename, ffmpegSavedPath]);

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

  // Expose current FFmpeg output path so callers can auto-write markers at stop time
  const getFfmpegOutputPath = useCallback(() => ffmpegOutputPathRef.current, []);

  return {
    videoRef,
    // Tauri preview: MJPEG stream displayed in an <img> element
    previewImgRef,
    mode, replayUrl, replayFilename, showReplay, error, pipActive,
    // Browser media devices
    devices, audioDevices, selectedDeviceId, setSelectedDeviceId,
    audioEnabled, setAudioEnabled, selectedAudioDeviceId, setSelectedAudioDeviceId,
    // Tauri/FFmpeg native device lists
    ffmpegVideoDevices, ffmpegAudioDevices,
    selectedFfmpegVideoName, setSelectedFfmpegVideoName,
    selectedFfmpegAudioName, setSelectedFfmpegAudioName,
    markers, addMarker,
    ffmpegSavedPath,
    getFfmpegOutputPath,
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
  const { mode, videoRef, previewImgRef, error, pipActive } = video;

  const ROLE_SHORT: Record<string, string> = {
    judge_a: 'A', judge_b: 'B', judge_c: 'C', judge_d: 'D', judge_e: 'E', chief_judge: 'CJ',
  };

  return (
    <div className="rounded-2xl overflow-hidden bg-black border shadow-2xl relative">
      {/* Tauri mode: MJPEG preview via <img> element.
          Shown in both preview AND recording states — the recording process
          keeps the live feed alive via its embedded MJPEG HTTP server. */}
      {isTauri && mode !== 'idle' && !video.showReplay && (
        <img
          ref={previewImgRef}
          className="w-full aspect-video object-cover"
          alt="Camera preview"
          style={{ display: 'block' }}
        />
      )}

      {/* Video element — used for: browser live preview + replay in all modes */}
      <video
        ref={videoRef}
        className="w-full aspect-video object-cover"
        playsInline
        autoPlay
        muted
        style={{
          display: (
            // Show in browser mode when not idle, OR always for replay
            (!isTauri && mode !== 'idle') || video.showReplay
          ) ? 'block' : 'none',
        }}
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
            {/* Audio indicator */}
            {video.audioEnabled && (
              <span className="flex items-center gap-1 bg-blue-600/80 backdrop-blur text-white text-xs font-bold px-2 py-0.5 rounded-full">
                <Mic className="w-2.5 h-2.5" />
                <span className="flex gap-px items-end h-3">
                  {[3, 5, 4, 6, 3].map((h, i) => (
                    <span key={i} className="w-0.5 bg-white/80 rounded-full animate-pulse" style={{ height: `${h * 2}px`, animationDelay: `${i * 0.1}s` }} />
                  ))}
                </span>
              </span>
            )}
            {/* Marker count badge during recording */}
            {mode === 'recording' && video.markers.length > 0 && (
              <span className="flex items-center gap-1 bg-amber-500/80 backdrop-blur text-white text-xs font-bold px-2 py-0.5 rounded-full">
                <BookmarkPlus className="w-2.5 h-2.5" /> {video.markers.length}/{MAX_MARKERS}
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

          {/* Mark button — shown during recording, bottom center */}
          {mode === 'recording' && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2">
              <button
                onClick={video.addMarker}
                disabled={video.markers.length >= MAX_MARKERS}
                title={`Mark timestamp (M key) — ${video.markers.length}/${MAX_MARKERS} markers`}
                className="flex items-center gap-1.5 bg-amber-500/80 hover:bg-amber-500 disabled:opacity-40 disabled:cursor-not-allowed backdrop-blur text-white text-xs font-bold px-3 py-1.5 rounded-full transition-colors"
              >
                <BookmarkPlus className="w-3.5 h-3.5" /> Mark
              </button>
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

// ─── Enhanced Replay Player ───────────────────────────────────────────────────
function fmtMs(ms: number): string {
  const s = Math.floor(ms / 1000);
  const m = Math.floor(s / 60);
  const sec = s % 60;
  return `${m}:${sec.toString().padStart(2, '0')}`;
}

const FRAME_MS = 1000 / 60; // 60fps frame step — matches target recording framerate

interface ReplayPlayerProps {
  replayUrl: string | null;
  filename: string | null;
  ffmpegSavedPath?: string | null;
  markers: MarkerMs[];
  open: boolean;
  onClose: () => void;
  onSave: () => void | Promise<void>;
  skierName?: string | null;
  /** When true, hides the Save button (recording already on disk) */
  readOnly?: boolean;
}

function ReplayPlayer({ replayUrl, filename, ffmpegSavedPath, markers, open, onClose, onSave, skierName, readOnly }: ReplayPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const timelineRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();
  const [rate, setRate] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [loopA, setLoopA] = useState<number | null>(null);
  const [loopB, setLoopB] = useState<number | null>(null);
  const [loopActive, setLoopActive] = useState(false);
  const [trimIn, setTrimIn] = useState<number | null>(null);
  const [trimOut, setTrimOut] = useState<number | null>(null);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    if (!open || !replayUrl || !videoRef.current) return;
    videoRef.current.src = replayUrl;
    videoRef.current.load();
    videoRef.current.playbackRate = 1;
    setRate(1);
    setPlaying(false);
    setCurrentTime(0);
    setLoopA(null);
    setLoopB(null);
    setLoopActive(false);
    setTrimIn(null);
    setTrimOut(null);
    setExporting(false);
  }, [open, replayUrl]);

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const ct = videoRef.current.currentTime;
    setCurrentTime(ct);
    // Loop between markers
    if (loopActive && loopA !== null && loopB !== null) {
      const bSec = loopB / 1000;
      if (ct >= bSec) {
        videoRef.current.currentTime = loopA / 1000;
      }
    }
  };

  const handleLoadedMetadata = () => {
    if (videoRef.current) setDuration(videoRef.current.duration);
  };

  const handleEnded = () => setPlaying(false);
  const handlePlay = () => setPlaying(true);
  const handlePause = () => setPlaying(false);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (videoRef.current.paused) { videoRef.current.play(); }
    else { videoRef.current.pause(); }
  };

  const changeRate = (r: number) => {
    setRate(r);
    if (videoRef.current) videoRef.current.playbackRate = r;
  };

  const stepFrame = (dir: 1 | -1) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + dir * FRAME_MS / 1000));
  };

  const stepHalfSec = (dir: 1 | -1) => {
    if (!videoRef.current) return;
    videoRef.current.pause();
    videoRef.current.currentTime = Math.max(0, Math.min(duration, videoRef.current.currentTime + dir * 0.5));
  };

  const seekTo = (t: number) => {
    if (!videoRef.current) return;
    videoRef.current.currentTime = Math.max(0, Math.min(duration, t));
  };

  const handleTimelineClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!timelineRef.current || !duration) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    seekTo(ratio * duration);
  };

  const toggleLoopMarker = (markerMs: number) => {
    if (loopA === null) {
      setLoopA(markerMs);
    } else if (loopB === null && markerMs !== loopA) {
      const [a, b] = [Math.min(loopA, markerMs), Math.max(loopA, markerMs)];
      setLoopA(a);
      setLoopB(b);
      setLoopActive(true);
    } else {
      setLoopA(null);
      setLoopB(null);
      setLoopActive(false);
    }
  };

  // Keyboard navigation
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        e.shiftKey ? stepHalfSec(-1) : stepFrame(-1);
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        e.shiftKey ? stepHalfSec(1) : stepFrame(1);
      } else if (e.key === ' ') {
        e.preventDefault();
        togglePlay();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, duration, loopActive, loopA, loopB]);

  const progress = duration > 0 ? currentTime / duration : 0;

  const exportClip = async () => {
    if (trimIn === null || trimOut === null || trimOut <= trimIn) return;
    setExporting(true);
    try {
      // Build clip-relative marker array (filtered to range, elapsed_ms offset by trimIn)
      const trimInMs = Math.round(trimIn * 1000);
      const trimOutMs = Math.round(trimOut * 1000);
      const clippedMarkers = markers
        .filter(ms => ms >= trimInMs && ms <= trimOutMs)
        .map((ms, i) => ({ index: i, elapsed_ms: ms - trimInMs, label: `Marker ${i + 1}` }));

      if (isTauri && ffmpegSavedPath) {
        // Tauri / FFmpeg mode: shell out to ffmpeg for a fast stream-copy trim
        const dotIdx = ffmpegSavedPath.lastIndexOf('.');
        const stem = dotIdx > 0 ? ffmpegSavedPath.slice(0, dotIdx) : ffmpegSavedPath;
        const ext  = dotIdx > 0 ? ffmpegSavedPath.slice(dotIdx)    : '.mp4';
        const clipPath = `${stem}_clip${ext}`;
        const clipFilename = clipPath.split(/[\\/]/).pop() ?? clipPath;

        await tauriInvoke('trim_video', {
          input_path: ffmpegSavedPath,
          output_path: clipPath,
          start_sec: trimIn,
          end_sec: trimOut,
        });

        // Write markers sidecar using the same schema as the main recording sidecar
        const markerData = JSON.stringify({
          filename: clipFilename,
          markers: clippedMarkers,
        }, null, 2);
        const markerPath = `${stem}_clip.markers.json`;
        await tauriInvoke('write_text_file', {
          path: markerPath,
          content: markerData,
        });

        toast({
          title: 'Clip exported',
          description: `${clipFilename}${clippedMarkers.length > 0 ? ` + ${clippedMarkers.length} marker${clippedMarkers.length !== 1 ? 's' : ''}` : ''}`,
        });
      } else if (replayUrl && videoRef.current) {
        // Browser mode: re-record the clip range in real time via captureStream + MediaRecorder
        const vid = videoRef.current;
        vid.pause();
        vid.currentTime = trimIn;

        const stream = (vid as HTMLVideoElement & { captureStream?: (fps?: number) => MediaStream }).captureStream?.(60);
        if (!stream) {
          toast({ title: 'Export not supported', description: 'captureStream API unavailable in this browser.', variant: 'destructive' });
          setExporting(false);
          return;
        }

        // Pick the best supported MIME type with fallback
        const mimeType = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
          .find(m => MediaRecorder.isTypeSupported(m)) ?? '';

        const chunks: Blob[] = [];
        const mr = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
        mr.ondataavailable = e => { if (e.data.size > 0) chunks.push(e.data); };

        const clipBlob = await new Promise<Blob>((resolve, reject) => {
          mr.onstop = () => resolve(new Blob(chunks, { type: mimeType || 'video/webm' }));
          mr.onerror = reject;
          mr.start();
          vid.play();

          const checkEnd = () => {
            if (vid.currentTime >= trimOut) {
              mr.stop();
              vid.pause();
            } else {
              requestAnimationFrame(checkEnd);
            }
          };
          requestAnimationFrame(checkEnd);
        });

        const baseName = (filename ?? `slalom-clip-${Date.now()}`).replace(/\.[^.]+$/, '');
        const clipFilename = `${baseName}_clip.webm`;

        // Download the video clip
        const url = URL.createObjectURL(clipBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = clipFilename;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 5000);

        // Download the markers sidecar (same schema as Tauri/disk sidecar, always written for parity)
        const markerData = JSON.stringify({
          filename: clipFilename,
          markers: clippedMarkers,
        }, null, 2);
        const markersBlob = new Blob([markerData], { type: 'application/json' });
        const markersUrl = URL.createObjectURL(markersBlob);
        const ma = document.createElement('a');
        ma.href = markersUrl;
        ma.download = `${baseName}_clip.markers.json`;
        ma.click();
        setTimeout(() => URL.revokeObjectURL(markersUrl), 5000);

        toast({
          title: 'Clip downloaded',
          description: `${clipFilename}${clippedMarkers.length > 0 ? ` + ${clippedMarkers.length} marker${clippedMarkers.length !== 1 ? 's' : ''}` : ''}`,
        });
      }
    } catch (e) {
      toast({ title: 'Export failed', description: String(e), variant: 'destructive' });
    }
    setExporting(false);
  };

  return (
    <>
      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}

      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '92vh' }}
      >
        <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '92vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <MonitorPlay className="w-5 h-5 text-blue-400 shrink-0" />
              <div className="min-w-0">
                <p className="font-bold text-white text-sm leading-tight">Instant Replay</p>
                {skierName && <p className="text-slate-400 text-xs truncate">{skierName}</p>}
              </div>
              <span className="bg-blue-600/30 text-blue-300 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full border border-blue-600/40 shrink-0">
                REVIEW
              </span>
              {filename && (
                <span className="text-slate-500 text-[10px] font-mono truncate hidden sm:block max-w-[200px]" title={filename}>
                  {filename}
                </span>
              )}
            </div>
            <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Video */}
          <div className="relative bg-black shrink-0 cursor-pointer" onClick={togglePlay}>
            <video
              ref={videoRef}
              className="w-full"
              style={{ maxHeight: '48vh', objectFit: 'contain' }}
              playsInline
              onTimeUpdate={handleTimeUpdate}
              onLoadedMetadata={handleLoadedMetadata}
              onEnded={handleEnded}
              onPlay={handlePlay}
              onPause={handlePause}
            />
            {!playing && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                <div className="w-14 h-14 rounded-full bg-white/20 flex items-center justify-center backdrop-blur">
                  <Play className="w-6 h-6 text-white fill-white ml-0.5" />
                </div>
              </div>
            )}
          </div>

          {/* Timeline scrubber */}
          <div className="px-5 pt-3 pb-1 shrink-0 space-y-1.5">
            <div
              ref={timelineRef}
              className="relative h-6 flex items-center cursor-pointer group"
              onClick={handleTimelineClick}
            >
              {/* Track */}
              <div className="absolute inset-x-0 h-1.5 bg-white/10 rounded-full overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 bg-blue-500 rounded-full"
                  style={{ width: `${progress * 100}%` }}
                />
                {/* Loop region */}
                {loopActive && loopA !== null && loopB !== null && duration > 0 && (
                  <div
                    className="absolute inset-y-0 bg-amber-400/30 border-x border-amber-400/60"
                    style={{
                      left: `${(loopA / 1000 / duration) * 100}%`,
                      width: `${((loopB - loopA) / 1000 / duration) * 100}%`,
                    }}
                  />
                )}
                {/* Trim region */}
                {trimIn !== null && trimOut !== null && duration > 0 && (
                  <div
                    className="absolute inset-y-0 bg-cyan-400/25 border-x-2 border-cyan-400/70"
                    style={{
                      left: `${(trimIn / duration) * 100}%`,
                      width: `${((trimOut - trimIn) / duration) * 100}%`,
                    }}
                  />
                )}
              </div>
              {/* Playhead */}
              <div
                className="absolute top-0 w-3 h-6 -ml-1.5 flex items-center justify-center pointer-events-none"
                style={{ left: `${progress * 100}%` }}
              >
                <div className="w-3 h-3 rounded-full bg-white shadow ring-2 ring-blue-400" />
              </div>
              {/* Marker dots */}
              {duration > 0 && markers.map((ms, i) => (
                <button
                  key={i}
                  title={`Marker ${i + 1}: ${fmtMs(ms)} — click to set loop point`}
                  onClick={e => { e.stopPropagation(); seekTo(ms / 1000); toggleLoopMarker(ms); }}
                  className={`absolute top-0 w-3 h-6 -ml-1.5 flex items-center justify-center z-10 transition-transform hover:scale-125 ${
                    (loopA === ms || loopB === ms) ? 'scale-125' : ''
                  }`}
                  style={{ left: `${(ms / 1000 / duration) * 100}%` }}
                >
                  <span className={`w-2.5 h-2.5 rounded-full border-2 ${
                    loopA === ms ? 'bg-amber-400 border-amber-200' :
                    loopB === ms ? 'bg-orange-400 border-orange-200' :
                    'bg-emerald-400 border-emerald-200'
                  }`} />
                </button>
              ))}
              {/* Trim In handle */}
              {trimIn !== null && duration > 0 && (
                <div
                  className="absolute top-0 h-6 pointer-events-none z-20"
                  style={{ left: `${(trimIn / duration) * 100}%` }}
                >
                  <div className="w-0.5 h-full bg-cyan-400" />
                  <div className="absolute top-0 -ml-1.5 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-cyan-400" />
                </div>
              )}
              {/* Trim Out handle */}
              {trimOut !== null && duration > 0 && (
                <div
                  className="absolute top-0 h-6 pointer-events-none z-20"
                  style={{ left: `${(trimOut / duration) * 100}%` }}
                >
                  <div className="w-0.5 h-full bg-cyan-400" />
                  <div className="absolute top-0 -ml-1.5 w-0 h-0 border-l-[6px] border-r-[6px] border-t-[8px] border-l-transparent border-r-transparent border-t-cyan-400" />
                </div>
              )}
            </div>
            <div className="flex justify-between text-[10px] text-slate-500 font-mono">
              <span>{fmtMs(currentTime * 1000)}</span>
              <span>-{fmtMs(Math.max(0, (duration - currentTime) * 1000))}</span>
              <span>{fmtMs(duration * 1000)}</span>
            </div>
          </div>

          {/* Controls row */}
          <div className="px-5 pb-4 flex items-center justify-between gap-3 shrink-0 flex-wrap">
            {/* Step + play controls */}
            <div className="flex items-center gap-1">
              <button
                onClick={() => stepHalfSec(-1)}
                title="–0.5s (Shift+←)"
                className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <SkipBack className="w-4 h-4" />
              </button>
              <button
                onClick={() => stepFrame(-1)}
                title="–1 frame (←)"
                className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                onClick={togglePlay}
                className="mx-1 p-2 bg-white/15 hover:bg-white/25 rounded-xl text-white transition-colors"
              >
                {playing
                  ? <Square className="w-4 h-4 fill-white" />
                  : <Play className="w-4 h-4 fill-white ml-0.5" />
                }
              </button>
              <button
                onClick={() => stepFrame(1)}
                title="+1 frame (→)"
                className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
              <button
                onClick={() => stepHalfSec(1)}
                title="+0.5s (Shift+→)"
                className="p-1.5 text-slate-400 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition-colors"
              >
                <SkipForward className="w-4 h-4" />
              </button>

              {/* Speed selector */}
              <div className="flex items-center gap-0.5 bg-white/5 rounded-lg px-1.5 py-1 ml-2">
                <Gauge className="w-3.5 h-3.5 text-slate-500 mr-1" />
                {[0.25, 0.5, 1, 2].map(r => (
                  <button
                    key={r}
                    onClick={() => changeRate(r)}
                    className={`text-xs font-bold px-2 py-0.5 rounded transition-colors ${
                      rate === r ? 'text-emerald-400 bg-emerald-400/20' : 'text-slate-400 hover:text-white'
                    }`}
                  >
                    {r}×
                  </button>
                ))}
              </div>

              {/* Loop toggle */}
              {markers.length >= 2 && (
                <button
                  onClick={() => {
                    if (loopActive) {
                      setLoopActive(false);
                      setLoopA(null);
                      setLoopB(null);
                    } else if (loopA !== null && loopB !== null) {
                      setLoopActive(true);
                    }
                  }}
                  title="Loop between two selected markers"
                  className={`ml-1 p-1.5 rounded-lg transition-colors ${
                    loopActive
                      ? 'text-amber-400 bg-amber-400/20'
                      : 'text-slate-400 hover:text-white bg-white/5 hover:bg-white/10'
                  }`}
                >
                  <Repeat className="w-4 h-4" />
                </button>
              )}
            </div>

            {/* Clip trim row */}
            <div className="px-5 pb-4 flex items-center gap-2 shrink-0 flex-wrap border-t border-slate-700/40 pt-3">
              <Scissors className="w-3.5 h-3.5 text-cyan-400 shrink-0" />
              <span className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider mr-1">Trim Clip</span>
              <button
                onClick={() => { setTrimIn(currentTime); }}
                title="Set trim in point to current position"
                className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
                  trimIn !== null ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                [In {trimIn !== null ? fmtMs(trimIn * 1000) : '—'}
              </button>
              <button
                onClick={() => { setTrimOut(currentTime); }}
                title="Set trim out point to current position"
                className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1 rounded-lg transition-colors shrink-0 ${
                  trimOut !== null ? 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/40' : 'bg-white/5 text-slate-400 hover:text-white hover:bg-white/10'
                }`}
              >
                Out] {trimOut !== null ? fmtMs(trimOut * 1000) : '—'}
              </button>
              {(trimIn !== null || trimOut !== null) && (
                <button
                  onClick={() => { setTrimIn(null); setTrimOut(null); }}
                  title="Clear trim points"
                  className="text-xs text-slate-500 hover:text-slate-300 px-1.5 py-1 rounded-lg hover:bg-white/5 transition-colors shrink-0"
                >
                  ✕ Clear
                </button>
              )}
              {trimIn !== null && trimOut !== null && trimOut > trimIn && (
                <span className="text-[10px] text-slate-500 font-mono shrink-0">
                  {fmtMs((trimOut - trimIn) * 1000)}
                </span>
              )}
              <div className="flex-1" />
              <button
                onClick={exportClip}
                disabled={trimIn === null || trimOut === null || trimOut <= trimIn || exporting}
                title={trimIn === null || trimOut === null ? 'Set in and out points first' : 'Export clip to disk'}
                className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg transition-colors shrink-0 ${
                  trimIn !== null && trimOut !== null && trimOut > trimIn && !exporting
                    ? 'bg-cyan-600 hover:bg-cyan-500 text-white'
                    : 'bg-white/5 text-slate-600 cursor-not-allowed'
                }`}
              >
                <Scissors className="w-3.5 h-3.5" />
                {exporting ? 'Exporting…' : 'Export Clip'}
              </button>
            </div>

            {/* Markers legend + Save */}
            <div className="flex items-center gap-3">
              {markers.length > 0 && (
                <div className="flex items-center gap-1.5 flex-wrap">
                  {markers.map((ms, i) => (
                    <button
                      key={i}
                      title={`Jump to marker ${i + 1}: ${fmtMs(ms)}`}
                      onClick={() => seekTo(ms / 1000)}
                      className="flex items-center gap-1 bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/30 text-emerald-300 text-[10px] font-bold px-1.5 py-0.5 rounded-lg transition-colors"
                    >
                      M{i + 1} {fmtMs(ms)}
                    </button>
                  ))}
                </div>
              )}
              {readOnly ? (
                <button
                  onClick={onClose}
                  className="flex items-center gap-2 bg-slate-700 hover:bg-slate-600 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors shrink-0"
                >
                  <X className="w-4 h-4" /> Close
                </button>
              ) : (
                <button
                  onClick={onSave}
                  className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold px-4 py-2 rounded-xl text-sm transition-colors shrink-0"
                >
                  <Download className="w-4 h-4" /> Save Recording
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

// ─── Recording filename parser ────────────────────────────────────────────────
// Filename format: {SkierName}-{Division}-{N}m-{YYYY-MM-DDTHH-MM-SS}.{ext}
// or: slalom-{YYYY-MM-DDTHH-MM-SS}.{ext} when no skier/division/rope.
//
// Divisions (from DIVISIONS constant) are space-separated words stored with
// dashes in the filename, e.g. "Open Men" → "Open-Men". We try to match the
// last 1 or 2 dash-parts of the prefix against known division patterns.

const DIVISION_FILENAME_PATTERNS = new Set(
  DIVISIONS.map(d => d.replace(/\s+/g, '-')),
);

function splitPrefixNameDivision(prefix: string): { skierName: string; division: string | null } {
  const parts = prefix.split('-');
  // Try 2-word division last (e.g. "Open-Men")
  if (parts.length >= 3) {
    const div2 = `${parts[parts.length - 2]}-${parts[parts.length - 1]}`;
    if (DIVISION_FILENAME_PATTERNS.has(div2)) {
      return {
        skierName: parts.slice(0, -2).join(' ').trim() || prefix,
        division: div2.replace(/-/g, ' '),
      };
    }
  }
  // Try 1-word division last (e.g. "Amateur")
  if (parts.length >= 2) {
    const div1 = parts[parts.length - 1];
    if (DIVISION_FILENAME_PATTERNS.has(div1)) {
      return {
        skierName: parts.slice(0, -1).join(' ').trim() || prefix,
        division: div1,
      };
    }
  }
  return { skierName: parts.join(' ').trim() || prefix, division: null };
}

function parseRecordingFilename(filename: string): {
  skierName: string;
  division: string | null;
  rope: number | null;
  timestamp: Date | null;
} {
  const base = filename.replace(/\.(mp4|webm)$/i, '');
  // With rope: {prefix}-{N}m-{timestamp}
  // Rope segment may be integer (16m) or decimal (18.25m, 14.25m, 11.25m).
  const withRope = base.match(/^(.*)-([0-9]+(?:\.[0-9]+)?)m-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
  if (withRope) {
    const isoStr = withRope[3].replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
    const { skierName, division } = splitPrefixNameDivision(withRope[1]);
    return { skierName, division, rope: Number(withRope[2]), timestamp: new Date(isoStr) };
  }
  // Without rope: {prefix}-{timestamp}
  const noRope = base.match(/^(.*)-(\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2})$/);
  if (noRope) {
    const isoStr = noRope[2].replace(/T(\d{2})-(\d{2})-(\d{2})$/, 'T$1:$2:$3');
    const { skierName, division } = splitPrefixNameDivision(noRope[1]);
    return { skierName, division, rope: null, timestamp: new Date(isoStr) };
  }
  return { skierName: base, division: null, rope: null, timestamp: null };
}

// ─── Recording Library ────────────────────────────────────────────────────────

interface LibraryEntry {
  id: string;
  filename: string;
  path: string | null;
  hasMarkers: boolean;
  sizeBytes: number;
  modifiedMs: number;
  skierName: string;
  division: string | null;
  rope: number | null;
  timestamp: Date | null;
  fileHandle?: FileSystemFileHandle;
}

interface RecordingLibraryProps {
  open: boolean;
  onClose: () => void;
  primaryPath: string | null;
  backupPath: string | null;
  primaryHandle: FileSystemDirectoryHandle | null;
  backupHandle: FileSystemDirectoryHandle | null;
  onOpenReplay: (opts: {
    url: string;
    filename: string;
    markers: MarkerMs[];
    skierName: string | null;
  }) => void;
}

interface MarkerRecord { index: number; elapsed_ms: number; label: string }

function RecordingLibrary({
  open,
  onClose,
  primaryPath,
  backupPath,
  primaryHandle,
  backupHandle,
  onOpenReplay,
}: RecordingLibraryProps) {
  const [entries, setEntries] = useState<LibraryEntry[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [openingId, setOpeningId] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<LibraryEntry | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const fmtSize = (bytes: number) => {
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} GB`;
  };

  const loadEntries = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const all: LibraryEntry[] = [];
      const seen = new Set<string>();

      if (isTauri) {
        // Tauri: read from disk via Rust list_recordings command
        interface RawEntry { path: string; filename: string; has_markers: boolean; size_bytes: number; modified_secs: number }
        for (const folder of ([primaryPath, backupPath].filter(Boolean) as string[])) {
          try {
            const raw = await tauriInvoke<RawEntry[]>('list_recordings', { folder });
            for (const r of raw) {
              if (seen.has(r.filename)) continue;
              seen.add(r.filename);
              const parsed = parseRecordingFilename(r.filename);
              all.push({
                id: r.path,
                filename: r.filename,
                path: r.path,
                hasMarkers: r.has_markers,
                sizeBytes: r.size_bytes,
                modifiedMs: r.modified_secs * 1000,
                ...parsed,
              });
            }
          } catch { /* folder may not be accessible */ }
        }
      } else {
        // Browser: load from IndexedDB-bookmarked FileSystemFileHandles + marker data
        const [idbHandles, markerFilenames] = await Promise.all([
          idbGetAllRecordingHandles().catch(() => [] as RecordingHandleEntry[]),
          idbGetMarkerFilenames().catch(() => new Set<string>()),
        ]);

        for (const { filename, handle } of idbHandles) {
          if (seen.has(filename)) continue;
          try {
            const file = await handle.getFile();
            const ext = filename.split('.').pop()?.toLowerCase();
            if (ext !== 'mp4' && ext !== 'webm') continue;
            seen.add(filename);
            const parsed = parseRecordingFilename(filename);
            all.push({
              id: filename,
              filename,
              path: null,
              hasMarkers: markerFilenames.has(filename),
              sizeBytes: file.size,
              modifiedMs: file.lastModified,
              fileHandle: handle,
              ...parsed,
            });
          } catch { /* handle stale / access revoked */ }
        }

        // Fallback: scan configured directory handles for recordings not yet bookmarked
        interface FSDirHandleWithPermission extends FileSystemDirectoryHandle {
          requestPermission(descriptor?: { mode?: string }): Promise<PermissionState>;
        }
        for (const handle of ([primaryHandle, backupHandle].filter(Boolean) as FileSystemDirectoryHandle[])) {
          try {
            if ('requestPermission' in handle) {
              const perm = await (handle as FSDirHandleWithPermission).requestPermission({ mode: 'read' });
              if (perm !== 'granted') continue;
            }
            for await (const fh of handle.values()) {
              const name = fh.name;
              if (fh.kind !== 'file') continue;
              const ext = name.split('.').pop()?.toLowerCase();
              if (ext !== 'mp4' && ext !== 'webm') continue;
              if (seen.has(name)) continue;
              seen.add(name);
              const fileHandle = fh as FileSystemFileHandle;
              const file = await fileHandle.getFile();
              const parsed = parseRecordingFilename(name);
              // Check for .markers.json sidecar in directory when IDB doesn't have it
              let hasMarkersForFile = markerFilenames.has(name);
              if (!hasMarkersForFile) {
                try {
                  await handle.getFileHandle(name.replace(/\.[^.]+$/, '') + '.markers.json');
                  hasMarkersForFile = true;
                } catch { /* no sidecar */ }
              }
              all.push({
                id: name,
                filename: name,
                path: null,
                hasMarkers: hasMarkersForFile,
                sizeBytes: file.size,
                modifiedMs: file.lastModified,
                fileHandle,
                ...parsed,
              });
            }
          } catch { /* no access */ }
        }
      }

      all.sort((a, b) => b.modifiedMs - a.modifiedMs);
      setEntries(all);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to load recordings');
    } finally {
      setLoading(false);
    }
  }, [primaryPath, backupPath, primaryHandle, backupHandle]);

  useEffect(() => {
    if (open) { setSearch(''); loadEntries(); }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  const openEntry = async (entry: LibraryEntry) => {
    setOpeningId(entry.id);
    try {
      let url: string;
      let markers: MarkerMs[] = [];

      if (isTauri && entry.path) {
        url = tauriConvertFileSrc(entry.path);
        if (entry.hasMarkers) {
          const markerPath = entry.path.replace(/\.[^.]+$/, '') + '.markers.json';
          try {
            const json = await tauriInvoke<string>('read_text_file', { path: markerPath });
            const data = JSON.parse(json) as { markers?: MarkerRecord[] };
            markers = (data.markers ?? []).map(m => m.elapsed_ms);
          } catch { /* markers file not accessible — proceed without markers */ }
        }
      } else if (entry.fileHandle) {
        const file = await entry.fileHandle.getFile();
        url = URL.createObjectURL(file);
        if (entry.hasMarkers) {
          // Primary source: IDB marker store
          markers = await idbGetMarkerData(entry.filename);
          // Fallback: read .markers.json sidecar from configured directory handles
          if (markers.length === 0) {
            const markerFilename = entry.filename.replace(/\.[^.]+$/, '') + '.markers.json';
            for (const dir of ([primaryHandle, backupHandle].filter(Boolean) as FileSystemDirectoryHandle[])) {
              try {
                const mfh = await dir.getFileHandle(markerFilename);
                const mfile = await mfh.getFile();
                const json = await mfile.text();
                const data = JSON.parse(json) as { markers?: MarkerRecord[] };
                markers = (data.markers ?? []).map(m => m.elapsed_ms);
                if (markers.length > 0) break;
              } catch { /* sidecar not in this dir */ }
            }
          }
        }
      } else {
        return;
      }

      onOpenReplay({ url, filename: entry.filename, markers, skierName: entry.skierName });
      onClose();
    } catch (err: unknown) {
      setError(`Failed to open: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setOpeningId(null);
    }
  };

  const deleteEntry = async (entry: LibraryEntry) => {
    setDeletingId(entry.id);
    try {
      if (isTauri && entry.path) {
        await tauriInvoke('delete_recording', { path: entry.path });
      } else {
        // Browser mode: remove file from directory handle + clean up IDB
        const markerFilename = entry.filename.replace(/\.[^.]+$/, '') + '.markers.json';
        const dirs = ([primaryHandle, backupHandle].filter(Boolean) as FileSystemDirectoryHandle[]);
        let removedFromDisk = false;
        for (const dir of dirs) {
          try {
            await dir.removeEntry(entry.filename);
            // Also try to remove the sidecar
            try { await dir.removeEntry(markerFilename); } catch { /* no sidecar in this dir */ }
            removedFromDisk = true;
            break;
          } catch { /* not in this dir or no permission */ }
        }
        // Always purge from IDB (handle is stale regardless)
        await idbDeleteRecordingHandle(entry.filename);
        if (!removedFromDisk && dirs.length > 0) {
          // File couldn't be found in any directory — likely already gone or permission denied
          setError(`Could not delete "${entry.filename}" from disk. The file may have already been removed or the folder permission was lost. It has been removed from the library list.`);
        }
      }
      setEntries(prev => prev.filter(e => e.id !== entry.id));
    } catch (err: unknown) {
      setError(`Failed to delete: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setDeletingId(null);
      setConfirmDelete(null);
    }
  };

  // In Tauri mode we need at least one configured path to scan the filesystem.
  // In browser mode the IDB registry always works regardless of directory handle availability,
  // so we never hide the library; the directory-handle fallback scan is best-effort only.
  const noFolders = isTauri && !primaryPath && !backupPath;
  const filtered = entries.filter(e =>
    !search.trim() ||
    e.filename.toLowerCase().includes(search.toLowerCase()) ||
    e.skierName.toLowerCase().includes(search.toLowerCase()) ||
    (e.division ?? '').toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <>
      {/* Delete confirmation dialog */}
      {confirmDelete && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-slate-900 border border-slate-700 rounded-2xl shadow-2xl w-full max-w-sm p-5">
            <div className="flex items-start gap-3 mb-4">
              <div className="w-9 h-9 rounded-xl bg-red-500/15 border border-red-500/30 flex items-center justify-center shrink-0">
                <Trash2 className="w-4 h-4 text-red-400" />
              </div>
              <div>
                <p className="font-bold text-white text-sm">Delete recording?</p>
                <p className="text-slate-400 text-xs mt-0.5 break-all">{confirmDelete.filename}</p>
                {confirmDelete.hasMarkers && (
                  <p className="text-amber-400 text-xs mt-1">The markers file will also be deleted.</p>
                )}
              </div>
            </div>
            <p className="text-slate-400 text-xs mb-4">This action cannot be undone.</p>
            <div className="flex gap-2">
              <button
                onClick={() => setConfirmDelete(null)}
                disabled={!!deletingId}
                className="flex-1 py-2 rounded-xl border border-slate-700 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={() => deleteEntry(confirmDelete)}
                disabled={!!deletingId}
                className="flex-1 py-2 rounded-xl bg-red-600 hover:bg-red-500 text-white text-sm font-semibold transition-colors disabled:opacity-60 flex items-center justify-center gap-1.5"
              >
                {deletingId ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Trash2 className="w-3.5 h-3.5" />}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-sm" onClick={onClose} />
      )}
      <div
        className={`fixed bottom-0 left-0 right-0 z-50 transform transition-transform duration-300 ease-out ${open ? 'translate-y-0' : 'translate-y-full'}`}
        style={{ maxHeight: '90vh' }}
      >
        <div className="bg-slate-900 border-t border-slate-700 rounded-t-3xl shadow-2xl flex flex-col" style={{ maxHeight: '90vh' }}>
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700/60 shrink-0">
            <div className="flex items-center gap-3">
              <Film className="w-5 h-5 text-purple-400 shrink-0" />
              <div>
                <p className="font-bold text-white text-sm leading-tight">Recording Library</p>
                <p className="text-slate-400 text-xs">
                  {loading ? 'Loading…' : `${entries.length} recording${entries.length !== 1 ? 's' : ''}`}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={loadEntries}
                disabled={loading}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10 disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              </button>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-white transition-colors p-1.5 rounded-lg hover:bg-white/10"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto min-h-0">
            {noFolders ? (
              <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
                <FolderOpen className="w-10 h-10 text-slate-600 mb-3" />
                <p className="text-slate-300 font-semibold text-sm mb-1">No save folder configured</p>
                <p className="text-slate-500 text-xs">
                  Set up a Primary or Backup save folder in the Storage panel to browse recordings here.
                </p>
              </div>
            ) : loading && entries.length === 0 ? (
              <div className="flex items-center justify-center py-16">
                <RefreshCw className="w-6 h-6 text-slate-500 animate-spin" />
              </div>
            ) : (
              <>
                {/* Search */}
                <div className="px-4 py-3 border-b border-slate-800 shrink-0">
                  <div className="relative">
                    <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500 pointer-events-none" />
                    <input
                      type="text"
                      placeholder="Search by skier name or division…"
                      value={search}
                      onChange={e => setSearch(e.target.value)}
                      className="w-full bg-slate-800 border border-slate-700 rounded-lg pl-8 pr-3 py-1.5 text-sm text-white placeholder-slate-500 focus:outline-none focus:border-slate-500"
                    />
                  </div>
                </div>

                {error && (
                  <div className="mx-4 mt-3 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-400 text-xs flex items-start gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{error}</span>
                  </div>
                )}

                {filtered.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
                    <Film className="w-8 h-8 text-slate-600 mb-2" />
                    <p className="text-slate-400 text-sm">
                      {search ? 'No recordings match your search.' : 'No recordings found in the configured folder.'}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-slate-800/60">
                    {filtered.map(entry => {
                      const rc = entry.rope ? getRopeColour(entry.rope) : null;
                      const isOpening = openingId === entry.id;
                      const isDeleting = deletingId === entry.id;
                      return (
                        <div
                          key={entry.id}
                          className="w-full flex items-center gap-3 px-4 py-3 hover:bg-slate-800/60 transition-colors group"
                        >
                          {/* Play button */}
                          <button
                            onClick={() => openEntry(entry)}
                            disabled={!!openingId || !!deletingId}
                            className="w-8 h-8 rounded-lg bg-slate-800 group-hover:bg-slate-700 flex items-center justify-center shrink-0 transition-colors border border-slate-700/60 disabled:opacity-50"
                            title="Play recording"
                          >
                            {isOpening
                              ? <RefreshCw className="w-3.5 h-3.5 text-purple-400 animate-spin" />
                              : <Play className="w-3.5 h-3.5 text-slate-300 fill-slate-300 ml-0.5" />
                            }
                          </button>

                          {/* Metadata (clicking opens the recording) */}
                          <button
                            onClick={() => openEntry(entry)}
                            disabled={!!openingId || !!deletingId}
                            className="flex-1 min-w-0 text-left disabled:opacity-50"
                          >
                            {/* Skier name + division + rope badge */}
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="font-semibold text-sm text-white truncate">{entry.skierName}</span>
                              {entry.division && (
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-700 border border-slate-600 px-1.5 py-0.5 rounded shrink-0">
                                  {entry.division}
                                </span>
                              )}
                              {rc && entry.rope && (
                                <span
                                  className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold shrink-0"
                                  style={{ background: rc.bg, color: rc.text, borderColor: rc.border }}
                                >
                                  {entry.rope}m
                                </span>
                              )}
                              {entry.hasMarkers && (
                                <span className="text-[10px] font-bold text-emerald-400 bg-emerald-400/10 border border-emerald-400/20 px-1.5 py-0.5 rounded shrink-0">
                                  markers
                                </span>
                              )}
                            </div>
                            {/* Timestamp + size */}
                            <p className="text-slate-500 text-[11px] mt-0.5 truncate">
                              {entry.timestamp
                                ? entry.timestamp.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
                                : entry.filename}
                              {entry.sizeBytes > 0 && ` · ${fmtSize(entry.sizeBytes)}`}
                            </p>
                          </button>

                          <MonitorPlay className="w-4 h-4 text-slate-600 group-hover:text-purple-400 transition-colors shrink-0" />

                          {/* Delete button */}
                          <button
                            onClick={() => setConfirmDelete(entry)}
                            disabled={!!openingId || !!deletingId}
                            className="p-1.5 rounded-lg text-slate-600 hover:text-red-400 hover:bg-red-500/10 focus-visible:text-red-400 focus-visible:bg-red-500/10 active:text-red-400 transition-colors shrink-0 disabled:opacity-50 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 active:opacity-100"
                            title="Delete recording"
                          >
                            {isDeleting
                              ? <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              : <Trash2 className="w-3.5 h-3.5" />
                            }
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
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

  const isTunnel = appSettings?.connection_mode === 'tunnel' && !!appSettings?.public_url;
  const isCloud = isTunnel || (appSettings?.connection_mode === 'cloud' && !!appSettings?.public_url);

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
          {isTunnel ? (
            <p className="text-xs text-muted-foreground bg-green-50 dark:bg-green-950/30 border border-green-200 dark:border-green-800 rounded-lg p-3">
              <strong className="text-green-700 dark:text-green-400">Tunnel active:</strong> Judges and spectators can connect from any network — mobile data or any WiFi.
              All QR codes point to <code className="font-mono text-xs">{appSettings?.public_url}</code>.
              Turn off "Go Online" in Settings to return to local-only mode.
            </p>
          ) : isCloud ? (
            <p className="text-xs text-muted-foreground bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <strong>Cloud mode:</strong> Judges can scan from any network — mobile data or any WiFi.
              All QR codes point to <code className="font-mono text-xs">{appSettings?.public_url}</code>.
            </p>
          ) : network?.urls?.[0] ? (
            <p className="text-xs text-muted-foreground bg-muted/50 rounded-lg p-3">
              <strong>Local WiFi mode:</strong> All judge devices must connect to the same WiFi network as this server.
              QR codes point to <code className="font-mono text-xs">{network.urls[0]}</code>.
              To share publicly, enable "Go Online" in Settings.
            </p>
          ) : null}
        </div>
      )}
    </Card>
  );
}

// ─── Save Folder Bar ─────────────────────────────────────────────────────────
function formatBytes(bytes: number): string {
  if (bytes >= 1e9) return `${(bytes / 1e9).toFixed(1)} GB`;
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(0)} MB`;
  return `${(bytes / 1e3).toFixed(0)} KB`;
}

function SaveFolderBar({ folders }: { folders: SaveFolders }) {
  const { hasDirectoryPicker, primary, backup, choosePrimary, chooseBackup, clearPrimary, clearBackup } = folders;

  if (!hasDirectoryPicker) return null;

  const Row = ({
    label, entry, onChoose, onClear,
  }: {
    label: string;
    entry: FolderEntry | null;
    onChoose: () => void;
    onClear: () => void;
  }) => {
    const lowSpace = entry?.freeBytes !== null && entry?.freeBytes !== undefined && entry.freeBytes < FIVE_GB;
    const offline  = entry !== null && !entry.accessible;

    return (
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground w-14 shrink-0">{label}</span>
        {entry ? (
          <>
            {offline ? (
              <WifiOff className="w-3.5 h-3.5 text-red-500 shrink-0" title="Drive not found" />
            ) : (
              <FolderOpen className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
            )}
            <span className={`text-xs font-mono truncate max-w-[140px] ${offline ? 'text-red-500' : 'text-foreground'}`} title={entry.path}>
              {entry.name}
            </span>
            {offline && (
              <span className="text-[9px] font-bold text-red-500 bg-red-500/10 border border-red-500/30 px-1.5 py-0.5 rounded shrink-0">
                OFFLINE
              </span>
            )}
            {!offline && entry.freeBytes !== null && (
              <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded shrink-0 flex items-center gap-0.5 ${
                lowSpace
                  ? 'text-amber-600 bg-amber-500/10 border border-amber-500/30'
                  : 'text-muted-foreground bg-muted/60'
              }`}>
                {lowSpace && <AlertTriangle className="w-2.5 h-2.5" />}
                <HardDrive className="w-2.5 h-2.5" />
                {formatBytes(entry.freeBytes)} free
              </span>
            )}
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
          <button
            onClick={onChoose}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors border border-dashed border-border rounded px-2 py-0.5"
          >
            <FolderPlus className="w-3.5 h-3.5" /> Set folder…
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="border border-border rounded-xl px-3 py-2.5 space-y-1.5 bg-muted/30">
      <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground mb-1">Save Location</p>
      <Row label="Primary" entry={primary} onChoose={choosePrimary} onClear={clearPrimary} />
      <Row label="Backup"  entry={backup}  onChoose={chooseBackup}  onClear={clearBackup} />
      {!primary && !backup && (
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
  const [showAddSkier, setShowAddSkier] = useState(false);
  const [addSkierForm, setAddSkierForm] = useState({ first_name: '', surname: '', division: DIVISIONS[0] });
  const [addSkierError, setAddSkierError] = useState<string | null>(null);
  const [pbCallout, setPbCallout] = useState<{ skierName: string; score: number } | null>(null);
  const [showLibrary, setShowLibrary] = useState(false);
  const [libraryReplay, setLibraryReplay] = useState<{
    url: string; filename: string; markers: MarkerMs[]; skierName: string | null;
  } | null>(null);
  useEffect(() => {
    const url = libraryReplay?.url;
    return () => { if (url) URL.revokeObjectURL(url); };
  }, [libraryReplay?.url]);

  // 'initial' sentinel prevents a PB callout for passes that were already in the DB when the page loads
  const lastCheckedPassIdRef = useRef<number | 'initial' | null>('initial');

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

  // Wrapper that stops FFmpeg and immediately writes the .markers.json sidecar
  // to both primary and backup paths. This satisfies the requirement that markers
  // are persisted at recording-stop time, not only when the user clicks Save.
  const handleStopRecording = useCallback(async () => {
    const currentMarkers = video.markers;
    const outputPath = video.getFfmpegOutputPath();
    await video.stopRecording();

    if (!isTauri || !outputPath || currentMarkers.length === 0) return;

    const filename = outputPath.split(/[\\/]/).pop() ?? '';
    const markerData = JSON.stringify({
      filename,
      markers: currentMarkers.map((ms, i) => ({
        index: i, elapsed_ms: ms, label: `Marker ${i + 1}`,
      })),
    }, null, 2);
    const markersFilename = filename.replace(/\.[^.]+$/, '') + '.markers.json';
    const paths = [folders.primaryPath, folders.backupPath].filter(Boolean) as string[];
    for (const dir of paths) {
      const sep = dir.includes('\\') ? '\\' : '/';
      await tauriInvoke('write_text_file', {
        path: `${dir}${sep}${markersFilename}`,
        content: markerData,
      }).catch(() => {});
    }
  }, [video.markers, video.getFfmpegOutputPath, video.stopRecording, folders.primaryPath, folders.backupPath]);

  // Auto-start recording when pass starts, auto-stop when it ends
  useEffect(() => {
    const curr = activePass?.id ?? null;
    const prev = prevActivePassId.current;

    if (curr && !prev && video.mode === 'preview') {
      replaySkierName.current = activePass?.skier_name ?? undefined;
      const skierName = activePass?.skier_name;
      void video.startRecording({
        skierName,
        division: activePass?.division,
        rope: activePass?.rope_length,
        outputDir: folders.primaryPath,
      }).then(started => {
        if (started) toast({ title: "Recording started", description: skierName });
      });
    } else if (!curr && prev && video.mode === 'recording') {
      handleStopRecording();
    }

    // Clear PB callout when a new pass starts
    if (curr && !prev) setPbCallout(null);

    prevActivePassId.current = curr;
  }, [activePass?.id]);

  // PB detection: fires whenever the recent passes list changes.
  // Skips the first render (uses 'initial' sentinel) so historical passes
  // already in the DB when the page loads don't trigger a false PB callout.
  useEffect(() => {
    const latest = recentPasses[0];

    // On first load, just record the current top pass and skip checking
    if (lastCheckedPassIdRef.current === 'initial') {
      lastCheckedPassIdRef.current = latest?.id ?? null;
      return;
    }

    if (!latest) return;
    if (latest.buoys_scored === null || latest.buoys_scored === undefined) return;
    if (latest.id === lastCheckedPassIdRef.current) return; // already checked this pass

    lastCheckedPassIdRef.current = latest.id;

    (async () => {
      try {
        const params = new URLSearchParams({
          name: latest.skier_name,
          division: latest.division || 'Open',
          exclude_pass_id: String(latest.id),
        });
        const r = await fetch(`/api/passes/personal-best?${params}`);
        if (!r.ok) return;
        const data = await r.json();
        const historicalBest: number | null = data.best;
        // Strict > only; ties are NOT a new PB
        if (historicalBest === null || latest.buoys_scored > historicalBest) {
          setPbCallout({ skierName: latest.skier_name, score: latest.buoys_scored });
        }
      } catch { /* silently ignore network errors */ }
    })();
  }, [recentPasses]);

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

  const addSkierMutation = useCreateSkier({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments', activeTournamentId, 'skiers'] });
        setSkierId(String(data.id));
        setShowAddSkier(false);
        setAddSkierForm({ first_name: '', surname: '', division: DIVISIONS[0] });
        setAddSkierError(null);
        toast({ title: `${data.first_name} ${data.surname} added` });
      },
      onError: (err: any) => {
        setAddSkierError(err?.response?.data?.error ?? err?.message ?? 'Failed to add skier');
      },
    }
  });

  const handleAddSkier = (e: React.FormEvent) => {
    e.preventDefault();
    if (!addSkierForm.first_name.trim() || !addSkierForm.surname.trim()) return;
    addSkierMutation.mutate({
      id: activeTournamentId!,
      data: { first_name: addSkierForm.first_name.trim(), surname: addSkierForm.surname.trim(), division: addSkierForm.division, is_financial: false },
    });
  };

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

  const openCameraOnlyView = () => {
    const base = (import.meta.env.BASE_URL ?? '/').replace(/\/$/, '');
    const url = `${window.location.origin}${base}/live?t=${activeTournamentId}&camera=1`;
    window.open(url, 'slalom-camera', 'width=1920,height=1080,menubar=no,toolbar=no,location=no,status=no');
  };

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pass Recording"
        subtitle="Operator Control Panel"
        actions={
          <div className="flex items-center gap-2 flex-wrap justify-end">
            <SurePathDot />
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

            {/* Camera-only view — suitable for second monitor */}
            <button
              onClick={openCameraOnlyView}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title="Open camera-only view with score overlay — drag to second monitor or capture card output"
            >
              <Video className="w-3.5 h-3.5" /> Camera Only
            </button>

            {/* Pop-out live view */}
            <button
              onClick={openLiveView}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title="Open fullscreen live view in a new window — drag to a second monitor"
            >
              <Monitor className="w-3.5 h-3.5" /> Live View
            </button>

            {/* Recording library */}
            <button
              onClick={() => setShowLibrary(true)}
              className="flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-lg border border-border text-muted-foreground hover:text-foreground hover:border-foreground/30 transition-colors"
              title="Browse and replay saved recordings"
            >
              <Film className="w-3.5 h-3.5" /> Library
            </button>
          </div>
        }
      />

      {/* ── Personal Best callout ── */}
      {pbCallout && (
        <div className="flex items-center gap-3 bg-amber-500/15 border border-amber-500/40 rounded-2xl px-4 py-3 animate-in fade-in slide-in-from-top-2 duration-300">
          <Trophy className="w-5 h-5 text-amber-500 shrink-0" />
          <div className="flex-1 min-w-0">
            <span className="font-black text-amber-600 dark:text-amber-400 text-sm tracking-wide uppercase mr-2">New Personal Best!</span>
            <span className="text-sm font-semibold">
              {pbCallout.skierName} — {pbCallout.score % 1 === 0 ? pbCallout.score : pbCallout.score.toFixed(1)} buoys
            </span>
          </div>
          <button
            onClick={() => setPbCallout(null)}
            className="text-muted-foreground hover:text-foreground transition-colors p-1"
            aria-label="Dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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
                <Button variant="primary" size="sm" onClick={() => video.startRecording({
                  skierName: activePass?.skier_name,
                  division: activePass?.division,
                  rope: activePass?.rope_length,
                  outputDir: folders.primaryPath,
                })} className="flex items-center gap-2">
                  <Circle className="w-3.5 h-3.5 fill-current" /> {isTauri && folders.primaryPath ? 'Record MP4' : 'Record'}
                </Button>
              )}
              {video.mode === 'recording' && (
                <>
                  <Button variant="destructive" size="sm" onClick={handleStopRecording} className="flex items-center gap-2">
                    <Square className="w-3.5 h-3.5 fill-current" /> Stop Recording
                  </Button>
                  <button
                    onClick={video.addMarker}
                    disabled={video.markers.length >= MAX_MARKERS}
                    title={`Mark (M key) — ${video.markers.length}/${MAX_MARKERS}`}
                    className="flex items-center gap-1.5 bg-amber-500/15 hover:bg-amber-500/25 disabled:opacity-40 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs font-bold px-2.5 py-1.5 rounded-lg transition-colors"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" /> Mark ({video.markers.length})
                  </button>
                </>
              )}

              {/* Audio toggle + device picker */}
              <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                {/* Tauri: FFmpeg video device selector */}
                {isTauri && video.ffmpegVideoDevices.length > 1 && (
                  <select
                    value={video.selectedFfmpegVideoName}
                    onChange={e => video.setSelectedFfmpegVideoName(e.target.value)}
                    disabled={video.mode === 'recording'}
                    title="FFmpeg capture device (used when recording MP4)"
                    className="text-[11px] bg-muted border border-border text-foreground rounded px-1.5 py-1 focus:outline-none disabled:opacity-40 max-w-[160px] truncate"
                  >
                    {video.ffmpegVideoDevices.map(d => (
                      <option key={d.deviceId} value={d.native_name}>{d.label}</option>
                    ))}
                  </select>
                )}

                <button
                  onClick={() => {
                    video.setAudioEnabled(!video.audioEnabled);
                    if (!isTauri && video.mode !== 'idle') video.startCamera();
                  }}
                  disabled={video.mode === 'recording'}
                  title={video.audioEnabled ? 'Disable audio capture' : 'Enable audio capture'}
                  className={`flex items-center gap-1 text-xs font-bold px-2.5 py-1.5 rounded-lg border transition-colors disabled:opacity-40 ${
                    video.audioEnabled
                      ? 'bg-blue-500/15 border-blue-500/40 text-blue-600 dark:text-blue-400'
                      : 'border-border text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {video.audioEnabled ? <Mic className="w-3.5 h-3.5" /> : <MicOff className="w-3.5 h-3.5" />}
                  Audio
                </button>

                {/* Tauri: FFmpeg audio device selector */}
                {isTauri && video.audioEnabled && video.ffmpegAudioDevices.length > 1 && (
                  <select
                    value={video.selectedFfmpegAudioName ?? ''}
                    onChange={e => video.setSelectedFfmpegAudioName(e.target.value)}
                    disabled={video.mode === 'recording'}
                    className="text-[11px] bg-muted border border-border text-foreground rounded px-1.5 py-1 focus:outline-none disabled:opacity-40 max-w-[140px] truncate"
                  >
                    {video.ffmpegAudioDevices.map(d => (
                      <option key={d.deviceId} value={d.native_name}>{d.label}</option>
                    ))}
                  </select>
                )}

                {/* Browser: audio device selector */}
                {!isTauri && video.audioEnabled && video.audioDevices.length > 1 && (
                  <select
                    value={video.selectedAudioDeviceId}
                    onChange={e => { video.setSelectedAudioDeviceId(e.target.value); }}
                    disabled={video.mode === 'recording'}
                    className="text-[11px] bg-muted border border-border text-foreground rounded px-1.5 py-1 focus:outline-none disabled:opacity-40 max-w-[140px] truncate"
                  >
                    {video.audioDevices.map(d => (
                      <option key={d.deviceId} value={d.deviceId}>{d.label}</option>
                    ))}
                  </select>
                )}
              </div>

              <span className="text-xs text-muted-foreground w-full">
                {video.mode === 'preview' && 'Camera live — recording starts automatically when a pass begins'}
                {video.mode === 'recording' && `Recording… press M to mark · ${video.markers.length} marker${video.markers.length !== 1 ? 's' : ''}`}
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
                <div>
                  <Select
                    label="Skier"
                    value={skierId}
                    onChange={e => { setSkierId(e.target.value); setShowAddSkier(false); }}
                    options={[
                      { label: '-- Select Skier --', value: '' },
                      ...(skiers?.map(s => ({
                        label: `${s.first_name} ${s.surname} · ${s.division || '—'}`,
                        value: s.id,
                      })) || [])
                    ]}
                  />
                  <button
                    type="button"
                    onClick={() => { setShowAddSkier(v => !v); setAddSkierError(null); }}
                    className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <UserPlus className="w-3.5 h-3.5" />
                    {showAddSkier ? 'Cancel' : 'Add new skier'}
                  </button>
                  {showAddSkier && (
                    <form onSubmit={handleAddSkier} className="mt-3 p-3 rounded-xl border bg-muted/40 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <Input
                          label="First name"
                          value={addSkierForm.first_name}
                          onChange={e => setAddSkierForm(f => ({ ...f, first_name: e.target.value }))}
                          required
                          autoFocus
                        />
                        <Input
                          label="Surname"
                          value={addSkierForm.surname}
                          onChange={e => setAddSkierForm(f => ({ ...f, surname: e.target.value }))}
                          required
                        />
                      </div>
                      <Select
                        label="Division"
                        value={addSkierForm.division}
                        onChange={e => setAddSkierForm(f => ({ ...f, division: e.target.value }))}
                        options={DIVISIONS.map(d => ({ label: d, value: d }))}
                      />
                      {addSkierError && (
                        <p className="text-xs text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-2.5 py-1.5">{addSkierError}</p>
                      )}
                      <Button type="submit" variant="primary" size="sm" className="w-full" isLoading={addSkierMutation.isPending}>
                        <UserPlus className="w-3.5 h-3.5 mr-1.5" /> Add &amp; Select
                      </Button>
                    </form>
                  )}
                </div>
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

      {/* Recording library panel */}
      <RecordingLibrary
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        primaryPath={folders.primaryPath}
        backupPath={folders.backupPath}
        primaryHandle={folders.primaryHandle}
        backupHandle={folders.backupHandle}
        onOpenReplay={opts => setLibraryReplay(opts)}
      />

      {/* Library replay player */}
      <ReplayPlayer
        replayUrl={libraryReplay?.url ?? null}
        filename={libraryReplay?.filename ?? null}
        markers={libraryReplay?.markers ?? []}
        open={!!libraryReplay}
        onClose={() => setLibraryReplay(null)}
        onSave={async () => { /* already saved */ }}
        skierName={libraryReplay?.skierName ?? null}
        readOnly
      />

      {/* Enhanced replay player — portal-style, appears over everything */}
      <ReplayPlayer
        replayUrl={video.replayUrl}
        filename={video.replayFilename}
        ffmpegSavedPath={video.ffmpegSavedPath}
        markers={video.markers}
        open={video.showReplay}
        onClose={video.dismissReplay}
        onSave={async () => {
          // Tauri FFmpeg mode: file is already on disk — just persist markers + show path
          if (video.ffmpegSavedPath) {
            await video.saveRecording({
              primaryPath: folders.primaryPath,
              backupPath: folders.backupPath,
              markersToSave: video.markers,
            });
            const filename = video.ffmpegSavedPath.split(/[\\/]/).pop() ?? video.ffmpegSavedPath;
            toast({
              title: 'MP4 saved',
              description: `${filename}${video.markers.length > 0 ? ` + ${video.markers.length} marker${video.markers.length !== 1 ? 's' : ''}` : ''}`,
            });
            return;
          }

          // Browser MediaRecorder mode: save blob to folder or trigger download
          const hasFolders = !!(folders.primary || folders.backup);
          const { savedPrimary, savedBackup } = await video.saveRecording({
            folderSave: hasFolders ? folders.saveToFolders : null,
            primaryPath: folders.primaryPath,
            backupPath: folders.backupPath,
            primaryHandle: folders.primaryHandle,
            backupHandle: folders.backupHandle,
            markersToSave: video.markers,
          });
          if (savedPrimary || savedBackup) {
            const parts: string[] = [];
            if (savedPrimary && folders.primary) parts.push(folders.primary.name);
            if (savedBackup  && folders.backup)  parts.push(`backup: ${folders.backup.name}`);
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
      const res = await authedFetch(`/api/passes/${passId}/flag`, {
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
const ROLE_LABELS: Record<string, string> = {
  judge_a: 'Judge A', judge_b: 'Judge B', judge_c: 'Judge C',
  judge_d: 'Judge D', judge_e: 'Judge E', chief_judge: 'Chief Judge',
};

function formatScore(s: string) {
  return s === '6_no_gates' ? '6 (no gates)' : s;
}

function DisputeModal({ passId, onClose }: { passId: number; onClose: () => void }) {
  const { data: scores, refetch: refetchScores } = usePassJudgeScores(passId);
  const { data: passData } = useQuery({
    queryKey: ['/api/passes', passId],
    queryFn: async () => { const r = await fetch(`/api/passes/${passId}`); return r.json(); },
    refetchInterval: 2000,
  });
  const queryClient = useQueryClient();

  // CJ Override state
  const [overrideMode, setOverrideMode] = useState(false);
  const [selectedScoreId, setSelectedScoreId] = useState<number | null>(null);
  const [newScore, setNewScore] = useState<string>(VALID_IWWF_SCORES[10]); // default '6'
  const [overridePin, setOverridePin] = useState('');
  const [overrideError, setOverrideError] = useState<string | null>(null);
  const [overrideLoading, setOverrideLoading] = useState(false);
  const [overrideSuccess, setOverrideSuccess] = useState(false);

  const isPending = passData?.status === 'pending';
  const hasScores = scores && scores.length > 0;

  const resetOverride = () => {
    setOverrideMode(false);
    setSelectedScoreId(null);
    setNewScore(VALID_IWWF_SCORES[10]);
    setOverridePin('');
    setOverrideError(null);
    setOverrideSuccess(false);
  };

  const handleSelectScore = (id: number, currentScore: string) => {
    setSelectedScoreId(id);
    setNewScore(currentScore);
    setOverrideError(null);
  };

  const handleApplyOverride = async () => {
    if (!selectedScoreId) {
      setOverrideError('Select a judge score row to override.');
      return;
    }
    if (!overridePin.trim()) {
      setOverrideError('Enter your PIN to confirm the override.');
      return;
    }
    setOverrideLoading(true);
    setOverrideError(null);

    try {
      // Step 1 — verify PIN via judges/verify-pin (identity-based; requires exact DB match).
      // Authorised if is_admin=true or judge_role='chief_judge'.
      if (!passData?.tournament_id) {
        setOverrideError('Cannot verify PIN — tournament context missing.');
        setOverrideLoading(false);
        return;
      }
      const verifyRes = await fetch('/api/judges/verify-pin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tournament_id: passData.tournament_id, pin: overridePin.trim() }),
      });
      if (!verifyRes.ok) {
        setOverrideError('Invalid PIN — only the Chief Judge or an admin may override scores.');
        setOverrideLoading(false);
        return;
      }
      const verifyData = await verifyRes.json();
      const authorised = verifyData.is_admin === true || verifyData.judge_role === 'chief_judge';
      if (!authorised) {
        setOverrideError('PIN recognised but you are not authorised — only the Chief Judge or an admin may override scores.');
        setOverrideLoading(false);
        return;
      }

      // Step 2 — PATCH the judge score
      const patchRes = await fetch(`/api/passes/${passId}/judge-scores/${selectedScoreId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pass_score: newScore }),
      });

      if (!patchRes.ok) {
        const errBody = await patchRes.json().catch(() => ({}));
        setOverrideError(errBody.error || 'Failed to update score. Please try again.');
        setOverrideLoading(false);
        return;
      }

      // Step 3 — success, refresh caches
      setOverrideSuccess(true);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['pass-judge-scores', passId] }),
        queryClient.invalidateQueries({ queryKey: ['/api/passes', passId] }),
        queryClient.invalidateQueries({ queryKey: ['passes'] }),
      ]);
      await refetchScores();

      // Auto-return to dispute view after brief success display
      setTimeout(() => resetOverride(), 1500);
    } catch {
      setOverrideError('Network error. Please try again.');
    } finally {
      setOverrideLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={!overrideMode ? onClose : undefined}>
      <div className="bg-card rounded-2xl shadow-2xl max-w-sm w-full p-6 space-y-4" onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            {overrideMode ? (
              <>
                <h3 className="font-bold text-lg leading-none flex items-center gap-2">
                  <Flag className="w-4 h-4 text-amber-500" /> CJ Score Override
                </h3>
                <p className="text-sm text-muted-foreground mt-1">
                  {passData?.skier_name ?? '…'} · Rnd {passData?.round_number}
                </p>
              </>
            ) : (
              <>
                <h3 className="font-bold text-lg leading-none">{passData?.skier_name ?? '…'}</h3>
                <p className="text-sm text-muted-foreground mt-1">
                  Rnd {passData?.round_number} · {passData?.speed_kph}kph · {passData?.rope_length}m
                </p>
              </>
            )}
          </div>
          <button
            onClick={overrideMode ? resetOverride : onClose}
            className="p-2 rounded-xl hover:bg-muted transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Normal dispute view */}
        {!overrideMode && (
          <>
            <div className="border-t pt-4 space-y-2">
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">Judge Scores</p>
              {!scores || scores.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">No judge scores recorded</p>
              ) : (
                (scores as any[]).map(s => (
                  <div key={s.id} className="flex items-center justify-between p-3 bg-muted/50 rounded-xl">
                    <span className="font-semibold text-sm">{ROLE_LABELS[s.judge_role] ?? s.judge_role}</span>
                    <span className="font-display font-black text-xl text-primary">
                      {formatScore(s.pass_score)}
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

            {/* CJ Override button — only shown for pending passes with scores */}
            {isPending && hasScores && (
              <div className="border-t pt-4">
                <button
                  onClick={() => setOverrideMode(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-amber-500/40 bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm font-bold hover:bg-amber-500/20 transition-colors"
                >
                  <Flag className="w-4 h-4" /> CJ Override
                </button>
              </div>
            )}
          </>
        )}

        {/* CJ Override form */}
        {overrideMode && (
          <div className="border-t pt-4 space-y-4">
            {overrideSuccess ? (
              <div className="flex flex-col items-center gap-3 py-4">
                <CheckCircle2 className="w-10 h-10 text-emerald-500" />
                <p className="font-bold text-emerald-600 dark:text-emerald-400">Score updated successfully</p>
              </div>
            ) : (
              <>
                {/* Score selection */}
                <div className="space-y-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Select score to override
                  </p>
                  {(scores as any[]).map(s => {
                    const isSelected = selectedScoreId === s.id;
                    return (
                      <div key={s.id}>
                        <button
                          onClick={() => handleSelectScore(s.id, s.pass_score)}
                          className={`w-full flex items-center justify-between p-3 rounded-xl border transition-colors text-left ${
                            isSelected
                              ? 'border-amber-500 bg-amber-500/10'
                              : 'border-border bg-muted/50 hover:border-amber-500/50 hover:bg-amber-500/5'
                          }`}
                        >
                          <span className="font-semibold text-sm">{ROLE_LABELS[s.judge_role] ?? s.judge_role}</span>
                          <span className={`font-display font-black text-xl ${isSelected ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
                            {formatScore(s.pass_score)}
                          </span>
                        </button>

                        {/* New score picker — shown inline under selected row */}
                        {isSelected && (
                          <div className="mt-2 ml-3 flex items-center gap-3">
                            <span className="text-xs text-muted-foreground font-semibold shrink-0">New score:</span>
                            <select
                              value={newScore}
                              onChange={e => setNewScore(e.target.value)}
                              className="flex-1 text-sm rounded-lg border border-amber-500/40 bg-card px-3 py-1.5 font-bold text-amber-700 dark:text-amber-300 focus:outline-none focus:ring-2 focus:ring-amber-500/30"
                            >
                              {VALID_IWWF_SCORES.map(v => (
                                <option key={v} value={v}>{formatScore(v)}</option>
                              ))}
                            </select>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* PIN input */}
                <div className="space-y-1.5">
                  <label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                    Chief Judge / Admin PIN
                  </label>
                  <input
                    type="password"
                    inputMode="numeric"
                    maxLength={8}
                    value={overridePin}
                    onChange={e => { setOverridePin(e.target.value); setOverrideError(null); }}
                    onKeyDown={e => e.key === 'Enter' && handleApplyOverride()}
                    placeholder="Enter PIN"
                    className="w-full text-sm rounded-xl border border-border bg-muted/50 px-3 py-2.5 font-mono tracking-widest focus:outline-none focus:ring-2 focus:ring-amber-500/30 focus:border-amber-500"
                  />
                </div>

                {/* Error */}
                {overrideError && (
                  <div className="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/30 rounded-xl text-red-600 dark:text-red-400 text-sm">
                    <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{overrideError}</span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <button
                    onClick={resetOverride}
                    disabled={overrideLoading}
                    className="flex-1 px-4 py-2.5 rounded-xl border border-border text-sm font-bold hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleApplyOverride}
                    disabled={overrideLoading || !selectedScoreId || !overridePin.trim()}
                    className="flex-1 px-4 py-2.5 rounded-xl bg-amber-500 text-white text-sm font-bold hover:bg-amber-600 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    {overrideLoading ? (
                      <><RefreshCw className="w-3.5 h-3.5 animate-spin" /> Checking…</>
                    ) : (
                      <><Flag className="w-3.5 h-3.5" /> Apply Override</>
                    )}
                  </button>
                </div>
              </>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
