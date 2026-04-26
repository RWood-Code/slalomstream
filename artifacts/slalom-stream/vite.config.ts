import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";

// TAURI_ENV_PLATFORM is injected automatically by the Tauri CLI into both
// beforeDevCommand and beforeBuildCommand subshells — no manual env prefix needed.
const isTauri = process.env.TAURI_ENV_PLATFORM !== undefined;

const rawPort = process.env.PORT;
const port = Number(rawPort);

if (!isTauri) {
  if (!rawPort) {
    throw new Error(
      "PORT environment variable is required but was not provided.",
    );
  }

  if (Number.isNaN(port) || port <= 0) {
    throw new Error(`Invalid PORT value: "${rawPort}"`);
  }
}

const basePath = isTauri ? "/" : process.env.BASE_PATH;

if (!basePath) {
  throw new Error(
    "BASE_PATH environment variable is required but was not provided.",
  );
}

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    ...(!isTauri ? [runtimeErrorOverlay()] : []),
    ...(!isTauri
      ? [
          VitePWA({
            registerType: "autoUpdate",
            includeAssets: ["images/logo-mark.png"],
            manifest: {
              name: "SlalomStream",
              short_name: "SlalomStream",
              description: "Digital scorecard for professional slalom waterski tournaments",
              theme_color: "#059669",
              background_color: "#f8fafc",
              display: "standalone",
              orientation: "portrait-primary",
              start_url: basePath,
              scope: basePath,
              icons: [
                {
                  src: "images/logo-mark.png",
                  sizes: "192x192",
                  type: "image/png",
                },
                {
                  src: "images/logo-mark.png",
                  sizes: "512x512",
                  type: "image/png",
                },
                {
                  src: "images/logo-mark.png",
                  sizes: "512x512",
                  type: "image/png",
                  purpose: "any maskable",
                },
              ],
            },
            workbox: {
              globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
              runtimeCaching: [
                {
                  urlPattern: /^\/api\//,
                  handler: "NetworkFirst",
                  options: {
                    cacheName: "api-cache",
                    networkTimeoutSeconds: 10,
                    expiration: {
                      maxEntries: 200,
                      maxAgeSeconds: 60 * 60 * 24,
                    },
                    cacheableResponse: {
                      statuses: [0, 200],
                    },
                  },
                },
                {
                  urlPattern: /^https:\/\/fonts\.(googleapis|gstatic)\.com\/.*/i,
                  handler: "CacheFirst",
                  options: {
                    cacheName: "google-fonts",
                    expiration: {
                      maxEntries: 10,
                      maxAgeSeconds: 60 * 60 * 24 * 365,
                    },
                  },
                },
              ],
            },
            devOptions: {
              enabled: false,
            },
          }),
        ]
      : []),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port: isTauri ? 5173 : port,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
    // In Tauri dev mode, proxy /api/* requests to the Express sidecar (localhost:3000)
    // so relative fetch('/api/...') calls work without cross-origin issues
    ...(isTauri
      ? {
          proxy: {
            "/api": {
              target: "http://localhost:3000",
              changeOrigin: true,
            },
          },
        }
      : {}),
  },
  preview: {
    port: isTauri ? 5173 : port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
