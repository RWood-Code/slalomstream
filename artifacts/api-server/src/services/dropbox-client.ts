/**
 * Dropbox client — Replit integration snippet.
 * WARNING: Never cache this client. Access tokens expire.
 * Always call getUncachableDropboxClient() fresh per request.
 */

import { Dropbox } from "dropbox";

// Module-level cache for the connection settings (access token + expiry only)
let connectionSettings: any;

async function getAccessToken(): Promise<string> {
  if (
    connectionSettings &&
    connectionSettings.settings.expires_at &&
    new Date(connectionSettings.settings.expires_at).getTime() > Date.now()
  ) {
    return connectionSettings.settings.access_token;
  }

  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY
    ? "repl " + process.env.REPL_IDENTITY
    : process.env.WEB_REPL_RENEWAL
    ? "depl " + process.env.WEB_REPL_RENEWAL
    : null;

  if (!xReplitToken) {
    throw new Error("Replit identity token not found — Dropbox integration not available.");
  }

  connectionSettings = await fetch(
    "https://" + hostname + "/api/v2/connection?include_secrets=true&connector_names=dropbox",
    {
      headers: {
        Accept: "application/json",
        "X-Replit-Token": xReplitToken,
      },
    }
  )
    .then((res) => res.json())
    .then((data) => data.items?.[0]);

  const accessToken =
    connectionSettings?.settings?.access_token ||
    connectionSettings?.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error("Dropbox not connected. Ensure the Dropbox integration is authorised in Replit.");
  }

  return accessToken;
}

export async function getUncachableDropboxClient(): Promise<Dropbox> {
  const accessToken = await getAccessToken();
  return new Dropbox({ accessToken });
}
