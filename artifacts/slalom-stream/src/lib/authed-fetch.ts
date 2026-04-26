import { useAppStore } from "@/lib/store";

const WRITE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/**
 * Drop-in replacement for fetch() that injects X-Admin-Token on write requests
 * so they are allowed through when the Cloudflare tunnel is active.
 */
export function authedFetch(
  input: string,
  init?: RequestInit,
): Promise<Response> {
  const method = (init?.method ?? "GET").toUpperCase();
  if (WRITE_METHODS.has(method)) {
    const token = useAppStore.getState().adminToken;
    if (token) {
      return fetch(input, {
        ...init,
        headers: {
          ...(init?.headers as Record<string, string> | undefined),
          "X-Admin-Token": token,
        },
      });
    }
  }
  return fetch(input, init);
}
