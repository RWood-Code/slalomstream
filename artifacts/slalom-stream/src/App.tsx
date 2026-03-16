import { Switch, Route, Router as WouterRouter } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";

import { AppLayout } from "@/components/layout/AppLayout";
import Home from "@/pages/Home";
import Recording from "@/pages/Recording";
import Judging from "@/pages/Judging";
import Scoreboard from "@/pages/Scoreboard";
import Admin from "@/pages/Admin";
import Help from "@/pages/Help";
import Officials from "@/pages/Officials";
import Live from "@/pages/Live";
import NotFound from "@/pages/not-found";

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
      {/* Fullscreen live view — no nav, no layout wrapper */}
      <Route path="/live" component={Live} />

      {/* All other routes inside AppLayout */}
      <Route>
        <AppLayout>
          <Switch>
            <Route path="/" component={Home} />
            <Route path="/recording" component={Recording} />
            <Route path="/judging" component={Judging} />
            <Route path="/scoreboard" component={Scoreboard} />
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
