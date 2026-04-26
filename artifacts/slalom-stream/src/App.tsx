import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppLayout } from "@/components/layout/AppLayout";
import { PublicLayout } from "@/components/layout/PublicLayout";
import Home from "@/pages/Home";
import Recording from "@/pages/Recording";
import Judging from "@/pages/Judging";
import Scoreboard from "@/pages/Scoreboard";
import Admin from "@/pages/Admin";
import Help from "@/pages/Help";
import Officials from "@/pages/Officials";
import Live from "@/pages/Live";
import NotFound from "@/pages/not-found";
import { setAdminTokenProvider } from "@workspace/api-client-react";
import { useAppStore } from "@/lib/store";

// Register admin token injection for write requests (used by requireAdminIfPublic
// middleware when the Cloudflare tunnel is active). The token is read from the
// Zustand store on each request — no re-registration needed on token change.
setAdminTokenProvider(() => useAppStore.getState().adminToken);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function Router() {
  return (
    <Switch>
      {/* ── Public pages — no nav, safe to share with spectators ── */}
      {/* Fullscreen TV view */}
      <Route path="/live" component={Live} />
      {/* Live scoreboard with minimal branded header */}
      <Route path="/scoreboard">
        <PublicLayout>
          <Scoreboard />
        </PublicLayout>
      </Route>

      {/* ── Operator pages — full nav sidebar ── */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/recording" component={Recording} />
            <Route path="/judging" component={Judging} />
            <Route path="/officials" component={Officials} />
            <Route path="/admin" component={Admin} />
            <Route path="/help" component={Help} />
            <Route component={NotFound} />
          </Switch>
        </AppLayout>
      </Route>
    </Switch>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <WouterRouter base={import.meta.env.BASE_URL.replace(/\/$/, "")}>
          <Router />
        </WouterRouter>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
