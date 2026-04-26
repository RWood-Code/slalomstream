declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T>;
        convertFileSrc(path: string, protocol?: string): string;
      };
    };
  }
}

export const isTauri: boolean = typeof window !== 'undefined' && !!window.__TAURI__?.core;

export async function tauriInvoke<T>(
  cmd: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri) throw new Error(`Not running in Tauri — cannot invoke '${cmd}'`);
  return window.__TAURI__!.core!.invoke<T>(cmd, args);
}

/**
 * Convert a native filesystem path to a tauri:// asset URL for playback in the WebView.
 * Throws explicitly (with a user-visible message) if the API is unavailable so callers
 * can surface the error rather than silently opening an empty video element.
 */
export function tauriConvertFileSrc(path: string): string {
  const fn = window.__TAURI__?.core?.convertFileSrc;
  if (!fn) {
    throw new Error(
      'Tauri asset URL conversion is unavailable. ' +
      'Ensure withGlobalTauri: true is set in tauri.conf.json and the app is running in Tauri.',
    );
  }
  return fn(path);
}
