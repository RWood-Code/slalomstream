import React, { useState } from 'react';
import { Card, PageHeader, Badge } from '@/components/ui/shared';
import {
  BookOpen, Wifi, Server, Smartphone, Users, Zap, Download,
  ChevronDown, ChevronUp, Radio, Shield, HelpCircle, Globe, GitBranch
} from 'lucide-react';

const VERSION = '1.5.0';
const RELEASE_DATE = 'March 2026';

interface SectionProps {
  icon: React.ElementType;
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}

function Section({ icon: Icon, title, defaultOpen = false, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <Card className="overflow-hidden">
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between p-5 hover:bg-muted/40 transition-colors text-left"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
            <Icon className="w-5 h-5 text-primary" />
          </div>
          <span className="font-bold text-base">{title}</span>
        </div>
        {open ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
      </button>
      {open && <div className="border-t px-5 pb-5 pt-4 space-y-3 text-sm text-foreground/80 leading-relaxed">{children}</div>}
    </Card>
  );
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <div className="flex gap-3 items-start">
      <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground text-xs font-black flex items-center justify-center shrink-0 mt-0.5">{n}</div>
      <div className="flex-1">{children}</div>
    </div>
  );
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="bg-muted px-2 py-0.5 rounded text-[11px] font-mono">{children}</code>;
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return <pre className="bg-muted text-foreground rounded-lg p-4 text-[11px] font-mono overflow-x-auto whitespace-pre">{children}</pre>;
}

interface ReleaseEntry {
  version: string;
  date: string;
  current?: boolean;
  items: string[];
}

const RELEASES: ReleaseEntry[] = [
  {
    version: '1.5.0',
    date: 'March 2026',
    current: true,
    items: [
      'ZIP-based updates — upload a new-version ZIP through the Admin panel; the server validates and previews the version before applying; restarts automatically with no command-line access needed',
      'Configurable update download location — admin can save a URL (Google Drive, Dropbox, etc.) so operators see a direct "Open download location" link in the update panel',
      'Apply Update button appears after ZIP scan — upload a ZIP, review the version preview (current vs ZIP), then click Apply Update to confirm; no accidental overwrites',
      'EMS Import redesign — guided 3-step flow with "Open EMS Calendar" button (pre-filtered to NZL waterski), collapsible step-by-step instructions, and results card',
    ],
  },
  {
    version: '1.4.0',
    date: 'March 2026',
    items: [
      'Persistent Save Folders — set a primary and optional backup folder once; every recording saves there automatically with no per-file prompt (Chrome/Edge); both writes run in parallel; falls back to browser download if no folders are configured',
      'Save folders survive browser restarts — folder handles stored in IndexedDB with automatic permission re-request on next session',
      'Admin session security — PIN verification now issues a time-limited UUID token (8 h); all privileged API calls require the token',
    ],
  },
  {
    version: '1.3.0',
    date: 'March 2026',
    items: [
      'Lite Mode — operator enters all scores directly on the Recording page; judge navigation hidden; no judge devices required for single-operator events',
      'Instant Replay Slide Panel — slide-up panel with independent video player after recording stops; main camera stays live; playback speed controls (0.25×–2×)',
      'Pop-out Live View — fullscreen /live route with score/pass/tournament overlays; auto-starts camera from saved device ID; controls auto-hide after 3 seconds',
      'Camera & Cam Link selector — device picker on Recording page; selected device persisted across sessions; hot-plug support; works with Elgato Cam Link 4K and similar capture devices',
      'QR codes now embed tournament ID — judges landing on a fresh device go directly into the correct tournament without manual selection',
      'Tournament Archive — admin can close out completed events; archived tournaments are hidden from the Home page tournament list',
      'Score Corrections — admin panel to override collated pass scores and correct individual judge scores with automatic re-collation',
    ],
  },
  {
    version: '1.2.0',
    date: 'March 2026',
    items: [
      'Connection Mode — toggle between Local WiFi and Cloud/Online in Admin; QR codes on the Recording page automatically use the correct address for each mode',
      'Cloud mode: judges connect via any network (mobile data, any WiFi) when the app is deployed online — no shared network required',
      'Admin sections are now all collapsible — click any section header to expand or collapse it for easier navigation',
      'Officials register auto-seeds on first boot — any fresh install or deployed instance automatically populates the full NZTWSA register',
      'Schema self-heal on startup — new database columns are added automatically so upgrades never break a running installation',
    ],
  },
  {
    version: '1.1.0',
    date: 'March 2026',
    items: [
      'Chief Judge redesigned — dedicated real-time panel showing all judge scores with inline correction via PATCH; no longer uses a scoring pad',
      'Judge panel logic rebuilt — panel configuration is driven entirely by the tournament\'s judge_count (1, 3, or 5); boat judge is always the last numbered judge',
      '1-judge (Grade G): Judge A fills all roles (chief, boat, scoring). 3-judge: A·B·C/Boat + Chief. 5-judge: A·B·C·D·E/Boat + Chief',
      'Collation fixed — only the numbered scoring-panel judges count toward median; chief_judge score is excluded from collation',
      'Chief judge score correction — selecting a corrected score immediately re-collates the pass result',
      'Recording QR panel — shows only the relevant stations for the tournament\'s panel size; labels boat judge clearly',
      'Officials PINs panel — Reveal PINs and Auto-assign buttons visible in header even when section is collapsed',
    ],
  },
  {
    version: '1.0.0',
    date: 'March 2026',
    items: [
      'Initial release — full IWWF slalom scoring system',
      'Multi-judge support with PIN-protected logins (Grade G, L, R/E)',
      'Live scoreboard with automatic IWWF score collation (median)',
      'PWA installable — works offline after first load',
      'QR code on Recording page for instant judge device connection',
      'Single Node.js server for local/venue deployment — no internet required',
      'WaterskiConnect inbound webhook integration',
      'SurePath Live integration via WaterskiConnect observer',
      'IWWF EMS participant import using sanction code',
      'NZTWSA officials register with PIN and admin management',
      'Admin panel: roster, judge accounts, integration settings',
    ],
  },
];

export default function Help() {
  return (
    <div className="space-y-6 max-w-3xl">
      <PageHeader
        title="Help & Release Notes"
        subtitle={`SlalomStream v${VERSION} · ${RELEASE_DATE}`}
        actions={<Badge variant="outline" className="font-mono">v{VERSION}</Badge>}
      />

      {/* Release Notes */}
      <Section icon={BookOpen} title="Release Notes" defaultOpen>
        <div className="space-y-6">
          {RELEASES.map(release => (
            <div key={release.version} className="border-l-2 border-primary pl-4 space-y-1.5">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-bold">v{release.version}</span>
                {release.current && <Badge variant="success" className="text-[10px]">Current</Badge>}
                <span className="text-muted-foreground text-xs">{release.date}</span>
              </div>
              <ul className="space-y-1 text-muted-foreground list-disc list-inside">
                {release.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      </Section>

      {/* Local Install */}
      <Section icon={Download} title="Getting SlalomStream — Local Installation">
        <p className="text-muted-foreground">
          SlalomStream is an open-source project — there is no packaged installer download.
          You run it directly from the source code. Here's how to set it up on a local laptop for venue use.
        </p>

        <div className="p-3 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-xl text-sm">
          <p className="font-bold mb-1">Prerequisites</p>
          <ul className="list-disc list-inside text-muted-foreground space-y-0.5">
            <li>Node.js 20 or later</li>
            <li>pnpm package manager (<Code>npm install -g pnpm</Code>)</li>
            <li>A PostgreSQL database (local install or cloud-hosted)</li>
          </ul>
        </div>

        <div className="space-y-3">
          <Step n={1}>
            <strong>Get the code</strong> — Fork or clone this project from Replit, or download it as a ZIP from the Replit editor (<em>⋮ menu → Download as ZIP</em>). Extract it to a folder on your laptop.
          </Step>
          <Step n={2}>
            <strong>Install dependencies</strong> from inside the project folder:
            <CodeBlock>{`pnpm install`}</CodeBlock>
          </Step>
          <Step n={3}>
            <strong>Set your database URL</strong>. Create a <Code>.env</Code> file (or set the environment variable):
            <CodeBlock>{`DATABASE_URL=postgresql://localhost/slalomstream`}</CodeBlock>
          </Step>
          <Step n={4}>
            <strong>Push the schema</strong> (creates all tables):
            <CodeBlock>{`pnpm --filter @workspace/db run push`}</CodeBlock>
            The NZTWSA officials register is seeded automatically when the server first starts — no extra step needed.
          </Step>
          <Step n={5}>
            <strong>Build and start</strong>:
            <CodeBlock>{`pnpm --filter @workspace/api-server run build\npnpm --filter @workspace/slalom-stream run build\nPORT=3000 node artifacts/api-server/dist/index.js`}</CodeBlock>
            The server serves both the API and the frontend from a single process. Open <Code>http://localhost:3000</Code> in a browser.
          </Step>
          <Step n={6}>
            On the <strong>Recording page</strong>, expand "Judge Station QR Codes". Judges scan the QR code for their station — all devices must be on the same WiFi network as the laptop (or use Cloud mode if deployed online).
          </Step>
        </div>

        <div className="p-3 bg-muted/50 rounded-xl text-xs text-muted-foreground mt-2">
          <strong>Tip:</strong> For reliable venue WiFi, connect the laptop to a portable hotspot or router and connect all judge phones to that same network. The server prints its local IP on startup.
        </div>
      </Section>

      {/* Local / Venue Setup */}
      <Section icon={Server} title="Local Venue Setup (Offline / Local WiFi Mode)">
        <p className="text-muted-foreground">
          Run the entire system locally at the venue with no internet required. One laptop acts as the server; all other devices connect over the same WiFi network.
        </p>
        <div className="space-y-3 mt-2">
          <Step n={1}>
            In <strong>Admin → Connection Mode</strong>, select <strong>Local WiFi</strong>. The panel shows the server's detected local IP addresses.
          </Step>
          <Step n={2}>
            Create a WiFi hotspot on the laptop (or use an existing venue router) and connect all judge devices to it.
          </Step>
          <Step n={3}>
            On the <strong>Recording page</strong>, expand "Judge Station QR Codes". QR codes point to the local IP — judges scan and log in.
          </Step>
        </div>
      </Section>

      {/* Cloud / Online Mode */}
      <Section icon={Globe} title="Cloud / Online Mode">
        <p className="text-muted-foreground">
          When the app is deployed to the internet (e.g. via Replit Deployments), judges can connect from any network — mobile data, hotel WiFi, or home broadband. No shared local network is needed.
        </p>
        <div className="space-y-3 mt-2">
          <Step n={1}>
            Deploy the app using Replit's Deploy button (or any cloud host). You'll receive a public URL.
          </Step>
          <Step n={2}>
            In <strong>Admin → Connection Mode</strong>, select <strong>Cloud / Online</strong> and enter your public URL (e.g. <Code>https://your-app.replit.app</Code>).
          </Step>
          <Step n={3}>
            QR codes on the Recording page now point to the public URL. Judges can scan from anywhere with internet access.
          </Step>
        </div>
        <p className="text-xs text-muted-foreground mt-2 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
          <strong>Note:</strong> In cloud mode, all devices need a working internet connection. For remote venues with poor mobile coverage, local WiFi mode is more reliable.
        </p>
      </Section>

      {/* Judge Setup */}
      <Section icon={Users} title="Setting Up Judges">
        <div className="space-y-3">
          <Step n={1}>
            Go to <strong>Admin → Officials PINs</strong> and use <strong>Auto-assign PINs</strong> to give every NZTWSA official a 4-digit PIN automatically. Or set them manually. Hand out PINs before the tournament.
          </Step>
          <Step n={2}>
            Each judge scans their station QR code on the Recording page, then enters their personal PIN. The system identifies them from the officials register.
          </Step>
          <Step n={3}>
            When the operator starts a pass, it appears on all connected judge devices. Judges tap a buoy count to submit their score.
          </Step>
          <Step n={4}>
            Scores are automatically collated per IWWF rules (median of submitted scoring-panel scores) when all judges submit or the operator ends the pass manually.
          </Step>
        </div>

        <div className="mt-4 p-4 bg-muted rounded-xl space-y-2">
          <p className="font-bold text-sm">IWWF Judge Panel Sizes</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Grade G', judges: '1 judge', roles: 'Judge A only (also Chief & Boat)' },
              { label: 'Grade L', judges: '3 judges', roles: 'A · B · C/Boat + Chief' },
              { label: 'Grade R/E', judges: '5 judges', roles: 'A · B · C · D · E/Boat + Chief' },
            ].map(g => (
              <div key={g.label} className="bg-card rounded-lg p-3 border">
                <p className="font-bold text-xs text-primary">{g.label}</p>
                <p className="font-semibold text-sm">{g.judges}</p>
                <p className="text-[10px] text-muted-foreground">{g.roles}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted-foreground">The Chief Judge has a dedicated review screen — real-time panel scores, projected collation, and inline score correction.</p>
        </div>
      </Section>

      {/* Installing as PWA */}
      <Section icon={Smartphone} title="Installing as a PWA (Add to Home Screen)">
        <p className="text-muted-foreground">
          SlalomStream can be installed as an app on any phone or tablet — no app store required. Once installed it works fully offline.
        </p>
        <div className="space-y-3 mt-2">
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-bold text-sm mb-1">iPhone / iPad (Safari)</p>
            <p>Tap the Share icon → "Add to Home Screen" → "Add".</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-bold text-sm mb-1">Android (Chrome)</p>
            <p>Tap the three-dot menu → "Add to Home Screen" → "Install".</p>
          </div>
          <div className="p-3 bg-muted rounded-lg">
            <p className="font-bold text-sm mb-1">Desktop (Chrome / Edge)</p>
            <p>Click the install icon in the address bar, or Menu → "Install SlalomStream".</p>
          </div>
        </div>
      </Section>

      {/* WaterskiConnect */}
      <Section icon={Radio} title="WaterskiConnect Integration">
        <p className="text-muted-foreground">
          When online, SlalomStream can receive pass data directly from boat-side scoring software via a webhook. The boat computer POSTs the skier and pass details and SlalomStream automatically creates the pending pass — no manual entry needed.
        </p>

        <div className="space-y-3 mt-2">
          <Step n={1}>In <strong>Admin → WaterskiConnect</strong>, enable the integration and copy the inbound webhook URL.</Step>
          <Step n={2}>Configure your boat/scoring software to POST to that URL whenever a new pass begins. Optionally set a shared secret token for security.</Step>
          <Step n={3}>Ensure there is an <strong>active tournament selected</strong> in SlalomStream (Home page). Incoming passes are created in that tournament.</Step>
        </div>

        <div className="mt-4">
          <p className="font-bold text-sm mb-2">Webhook — Expected JSON payload</p>
          <CodeBlock>{`POST /api/waterskiconnect/inbound
Content-Type: application/json

{
  "skier_name":   "Jane Smith",       // required
  "rope_length":  13,                 // required — metres
  "speed_kph":    55,                 // required
  "division":     "Open Women",       // optional
  "round_number": 1,                  // optional (default 1)
  "token":        "your-secret-token" // optional auth
}`}</CodeBlock>
        </div>

        <div className="mt-3">
          <p className="font-bold text-sm mb-2">Status endpoint</p>
          <CodeBlock>{`GET /api/waterskiconnect/status
→ { enabled, last_inbound, inbound_count }`}</CodeBlock>
        </div>

        <p className="text-muted-foreground mt-3 text-xs">
          The inbound webhook also accepts the token via the <Code>X-WaterskiConnect-Token</Code> header as an alternative to the body field.
        </p>
      </Section>

      {/* Admin PIN */}
      <Section icon={Shield} title="Admin PIN & Security">
        <div className="space-y-2">
          <p>The Admin area is protected by a master PIN set in <strong>Admin → Admin PIN</strong>.</p>
          <p>Officials marked as Admin in the Officials PINs panel can also log into Admin using their judge PIN — useful so designated officials can manage the system without knowing the master PIN.</p>
          <p>If no PIN is set, the Admin area is open to anyone who navigates to it — set a PIN before deploying at a venue.</p>
          <p className="text-muted-foreground text-xs mt-2">
            PINs are stored as plain text in the database. This is intentional — the system is designed for a closed local/venue network. If deploying to the internet (cloud mode), set a strong Admin PIN.
          </p>
        </div>
      </Section>

      {/* Troubleshooting */}
      <Section icon={HelpCircle} title="Troubleshooting">
        <div className="space-y-4">
          {[
            {
              q: 'Judge devices cannot connect — Local WiFi mode',
              a: 'Make sure all devices are on the same WiFi network as the server laptop. Use the QR code on the Recording page — it shows the correct local IP automatically. Do not type "localhost" as it won\'t work from other devices.',
            },
            {
              q: 'Judge devices cannot connect — Cloud mode',
              a: 'Check that the Public URL in Admin → Connection Mode is correctly set and that the deployed app is running. Each judge device needs an active internet connection.',
            },
            {
              q: 'The Officials page shows no judges after a fresh install',
              a: 'The NZTWSA officials register is seeded automatically on first server startup. If the list is still empty, try restarting the server once. If still empty, go to Admin → Officials PINs — if officials appear there, the judging page just needs a PIN assigned before they can log in.',
            },
            {
              q: 'The app shows stale/no scores after a pass',
              a: 'Scores refresh automatically every 3–5 seconds. If a judge submitted after the operator ended the pass, scores can still be viewed in the pass history on the Scoreboard page.',
            },
            {
              q: 'WaterskiConnect inbound webhook returns 409',
              a: 'No active tournament is selected. Go to the Home page and select or create a tournament before the boat software starts sending data.',
            },
            {
              q: 'PWA does not install on iOS',
              a: 'SlalomStream must be opened in Safari (not Chrome or Firefox) on iOS for the "Add to Home Screen" option to appear.',
            },
            {
              q: 'Scores are not being collated automatically',
              a: 'Collation runs when all registered scoring-panel judges for the tournament have submitted. If a judge did not submit, end the pass manually with the "End Pass" button — scores from judges who did submit will be used.',
            },
          ].map(({ q, a }) => (
            <div key={q} className="p-4 bg-muted/50 rounded-xl border">
              <p className="font-bold text-sm mb-1">{q}</p>
              <p className="text-muted-foreground text-sm">{a}</p>
            </div>
          ))}
        </div>
      </Section>

      {/* Quick Reference */}
      <Section icon={Zap} title="Quick Reference — IWWF Scoring">
        <div className="space-y-2">
          <p className="font-bold text-sm">Valid buoy scores</p>
          <div className="flex flex-wrap gap-2">
            {['1', '1.5', '2', '2.5', '3', '3.5', '4', '4.5', '5', '5.5', '6', '6 No Gates'].map(s => (
              <span key={s} className="font-mono bg-primary/10 text-primary px-2 py-1 rounded text-xs font-bold">{s}</span>
            ))}
          </div>
          <p className="text-muted-foreground text-xs mt-2">
            "6 No Gates" means the skier completed all 6 buoys but missed a gate. Collation treats it as 6.0 for score calculation.
          </p>

          <p className="font-bold text-sm mt-4">Collation method</p>
          <p className="text-muted-foreground text-sm">
            Scores are sorted and the median is taken. With an even number of judges the two middle scores are averaged. Chief Judge scores are excluded from collation — they are oversight only. This matches the IWWF Technical Judges' manual.
          </p>
        </div>
      </Section>

      <p className="text-center text-xs text-muted-foreground pb-4">
        SlalomStream v{VERSION} · Built for IWWF-affiliated slalom competitions · Not an official IWWF product
      </p>
    </div>
  );
}
