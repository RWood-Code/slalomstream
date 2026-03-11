import React, { useState } from 'react';
import { Card, PageHeader, Badge } from '@/components/ui/shared';
import {
  BookOpen, Wifi, Server, Smartphone, Users, Zap, Download,
  ChevronDown, ChevronUp, Radio, Shield, HelpCircle
} from 'lucide-react';

const VERSION = '1.0.0';
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
        <div className="space-y-4">
          <div className="border-l-2 border-primary pl-4 space-y-1">
            <div className="flex items-center gap-2">
              <span className="font-bold">v1.0.0</span>
              <Badge variant="success" className="text-[10px]">Current</Badge>
              <span className="text-muted-foreground text-xs">{RELEASE_DATE}</span>
            </div>
            <ul className="space-y-1 text-muted-foreground list-disc list-inside">
              <li>Initial release — full IWWF slalom scoring system</li>
              <li>Multi-judge support with PIN-protected logins (Grade G, L, R/E)</li>
              <li>Live scoreboard with automatic score collation</li>
              <li>PWA installable — works offline after first load</li>
              <li>QR code on Recording page for instant judge connection</li>
              <li>Single Node.js server for local/venue deployment</li>
              <li>WaterskiConnect inbound webhook integration</li>
              <li>Admin panel: roster, judge accounts, settings</li>
            </ul>
          </div>
        </div>
      </Section>

      {/* Local / Venue Setup */}
      <Section icon={Server} title="Local Venue Setup (Offline Mode)">
        <p className="text-muted-foreground">
          Run the entire system locally at the venue with no internet required. One laptop acts as the server; all other devices connect over WiFi.
        </p>
        <div className="space-y-3 mt-2">
          <Step n={1}>
            <strong>Prerequisites:</strong> Node.js 20+ and pnpm installed on the server laptop. A PostgreSQL database (local or cloud).
          </Step>
          <Step n={2}>
            Set your database connection string:
            <CodeBlock>{`export DATABASE_URL=postgresql://localhost/slalomstream`}</CodeBlock>
          </Step>
          <Step n={3}>
            Run the startup script (builds everything and starts the server):
            <CodeBlock>{`chmod +x scripts/start-local.sh\n./scripts/start-local.sh`}</CodeBlock>
            The script will print the local IP address and port when ready.
          </Step>
          <Step n={4}>
            Create a WiFi hotspot on the laptop (or use existing venue WiFi) and connect all judge devices to it.
          </Step>
          <Step n={5}>
            On the <strong>Recording page</strong>, tap "Judge Connect" to reveal the QR code. Judges scan it on their phones — that's it.
          </Step>
        </div>
      </Section>

      {/* Judge Setup */}
      <Section icon={Users} title="Setting Up Judges">
        <div className="space-y-3">
          <Step n={1}>
            Go to <strong>Admin → Judge Accounts</strong> and create an account for each judge. Assign their role (Judge A, Judge B, Boat Judge, etc.) and set a 4-digit PIN.
          </Step>
          <Step n={2}>
            Each judge opens the app on their phone, taps the <strong>Judge</strong> tab, selects their name, and enters their PIN.
          </Step>
          <Step n={3}>
            When the operator starts a pass on the Recording page, the pass automatically appears on all judge devices. Judges tap a buoy count to submit.
          </Step>
          <Step n={4}>
            Scores are automatically collated per IWWF rules (median of all submitted scores) when the operator ends the pass.
          </Step>
        </div>

        <div className="mt-4 p-4 bg-muted rounded-xl space-y-2">
          <p className="font-bold text-sm">IWWF Judge Panel Sizes</p>
          <div className="grid grid-cols-3 gap-2 text-center">
            {[
              { label: 'Grade G', judges: '1 judge', roles: 'Judge A only' },
              { label: 'Grade L', judges: '3 judges', roles: 'A · B · Boat' },
              { label: 'Grade R/E', judges: '5 judges', roles: 'A · B · Boat · D · E' },
            ].map(g => (
              <div key={g.label} className="bg-card rounded-lg p-3 border">
                <p className="font-bold text-xs text-primary">{g.label}</p>
                <p className="font-semibold text-sm">{g.judges}</p>
                <p className="text-[10px] text-muted-foreground">{g.roles}</p>
              </div>
            ))}
          </div>
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
          <Step n={1}>
            In <strong>Admin → WaterskiConnect</strong>, enable the integration and copy the inbound webhook URL.
          </Step>
          <Step n={2}>
            Configure your boat/scoring software to POST to that URL whenever a new pass begins. Optionally set a shared secret token for security.
          </Step>
          <Step n={3}>
            Ensure there is an <strong>active tournament selected</strong> in SlalomStream (Home page). Incoming passes are created in that tournament.
          </Step>
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
          <p>The Admin area is protected by a master PIN set in <strong>Admin → Settings</strong>.</p>
          <p>If no PIN is set, the Admin area is open to anyone who navigates to it — secure the PIN before deploying at a venue.</p>
          <p>Judge PINs are per-judge 4-digit codes set when creating the judge account. They can be changed by deleting and re-creating the judge.</p>
          <p className="text-muted-foreground text-xs mt-2">
            PINs are stored as plain text in the database. This is intentional — the system is designed for a closed local network, not internet-facing deployment.
          </p>
        </div>
      </Section>

      {/* Troubleshooting */}
      <Section icon={HelpCircle} title="Troubleshooting">
        <div className="space-y-4">
          {[
            {
              q: 'Judge devices cannot connect to the server',
              a: 'Make sure all devices are on the same WiFi network. The server address must use the laptop\'s local IP (e.g. 192.168.1.5:3000), not "localhost". Use the QR code on the Recording page — it shows the correct address automatically.'
            },
            {
              q: 'The app shows stale/no scores after a pass',
              a: 'Scores refresh automatically every 3–5 seconds. If a judge submitted after the operator ended the pass, scores can still be viewed in the pass history on the Scoreboard page.'
            },
            {
              q: 'WaterskiConnect inbound webhook returns 409',
              a: 'No active tournament is selected. Go to the Home page and select or create a tournament before the boat software starts sending data.'
            },
            {
              q: 'PWA does not install on iOS',
              a: 'SlalomStream must be opened in Safari (not Chrome or Firefox) on iOS for the "Add to Home Screen" option to appear.'
            },
            {
              q: 'Scores are not being collated automatically',
              a: 'Collation runs when all registered judges for the tournament have submitted. If a judge did not submit, end the pass manually with the "End Pass" button and scores from judges who did submit will be used.'
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
            Scores are sorted and the median is taken. With an even number of judges the two middle scores are averaged. This matches the IWWF Technical Judges' manual.
          </p>
        </div>
      </Section>

      <p className="text-center text-xs text-muted-foreground pb-4">
        SlalomStream v{VERSION} · Built for IWWF-affiliated slalom competitions · Not an official IWWF product
      </p>
    </div>
  );
}
