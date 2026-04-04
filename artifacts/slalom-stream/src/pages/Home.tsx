import React, { useState } from 'react';
import { useListTournaments, useCreateTournament } from '@workspace/api-client-react';
import { useAppStore } from '@/lib/store';
import { useLocation } from 'wouter';
import { Card, Button, Badge, PageHeader, Dialog, Input, Select } from '@/components/ui/shared';
import { Trophy, CalendarPlus, ChevronRight, Activity, Calendar, FlaskConical, Eye, EyeOff, Search, User } from 'lucide-react';
import { TOURNAMENT_CLASSES, formatRope, getRopeColour } from '@/lib/utils';
import { useQueryClient, useQuery } from '@tanstack/react-query';

export default function Home() {
  const [, setLocation] = useLocation();
  const { activeTournamentId, setActiveTournamentId } = useAppStore();
  const queryClient = useQueryClient();

  const [showTest, setShowTest] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', class: 'L', judges: 3, rounds: 2, is_test: false });
  const [skierSearch, setSkierSearch] = useState('');
  const [skierSearchInput, setSkierSearchInput] = useState('');

  const { data: skierResults, isFetching: skierFetching } = useQuery({
    queryKey: ['/api/passes/search', skierSearch],
    queryFn: async () => {
      if (!skierSearch || skierSearch.length < 2) return [];
      const r = await fetch(`/api/passes/search?q=${encodeURIComponent(skierSearch)}`);
      return r.json() as Promise<any[]>;
    },
    enabled: skierSearch.length >= 2,
  });

  const { data: tournaments, isLoading } = useQuery({
    queryKey: ['/api/tournaments', showTest],
    queryFn: async () => {
      const res = await fetch(`/api/tournaments${showTest ? '?include_test=true' : ''}`);
      return res.json() as Promise<any[]>;
    },
  });

  const [createError, setCreateError] = useState<string | null>(null);

  const createMutation = useCreateTournament({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] });
        setActiveTournamentId(data.id);
        setCreateOpen(false);
        setCreateError(null);
      },
      onError: (err: any) => {
        setCreateError(err?.response?.data?.error ?? err?.message ?? 'Failed to create tournament. Please try again.');
      },
    }
  });

  const handleSelect = (id: number) => {
    setActiveTournamentId(id);
    setLocation('/recording');
  };

  const handleCreate = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      data: {
        name: formData.name,
        tournament_class: formData.class,
        judge_count: Number(formData.judges),
        num_rounds: Number(formData.rounds),
        is_test: formData.is_test,
      }
    });
  };

  const liveTournaments = tournaments?.filter(t => !t.is_test && t.status !== 'archived') ?? [];
  const testTournaments = tournaments?.filter(t => t.is_test) ?? [];
  const displayed = showTest ? tournaments ?? [] : liveTournaments;

  return (
    <div className="space-y-8">
      <div className="relative rounded-3xl overflow-hidden bg-emerald-950 p-8 sm:p-12 shadow-2xl">
        <div className="absolute inset-0 opacity-20 bg-[url('https://pixabay.com/get/gd2d9f26171f6a87a6055d16823d510c3e5eb22aec0d05861de45aae444756c1f2f94c6ba5487b5918facb09f8bea72a030293fad69838470eff6836a9667fba3_1280.jpg')] bg-cover bg-center mix-blend-overlay"></div>
        <div className="absolute inset-0 bg-gradient-to-r from-emerald-900/90 to-transparent"></div>

        <div className="relative z-10 max-w-2xl">
          <Badge className="bg-emerald-500/20 text-emerald-300 border-emerald-500/30 mb-4 px-3 py-1">
            Professional Waterski Scoring
          </Badge>
          <h1 className="text-4xl sm:text-5xl font-display font-bold text-white mb-4">
            SlalomStream System
          </h1>
          <p className="text-emerald-100/80 text-lg mb-8 max-w-xl">
            Digital scorecard and live results platform for professional slalom waterski tournaments. Select an active event or create a new one to begin.
          </p>
          <Button variant="primary" size="lg" onClick={() => setCreateOpen(true)} className="gap-2">
            <CalendarPlus className="w-5 h-5" />
            Create New Tournament
          </Button>
        </div>
      </div>

      <div>
        <PageHeader
          title="Tournaments"
          subtitle="Select a tournament to enter scoring mode or view live results."
          actions={
            <button
              onClick={() => setShowTest(v => !v)}
              className={`flex items-center gap-2 text-xs font-semibold px-3 py-1.5 rounded-lg border transition-colors ${
                showTest
                  ? 'bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 dark:border-amber-700'
                  : 'text-muted-foreground border-border hover:bg-muted'
              }`}
            >
              {showTest ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              {showTest ? `Test data visible (${testTournaments.length})` : 'Show test data'}
            </button>
          }
        />

        {showTest && testTournaments.length > 0 && (
          <div className="mb-4 p-3 bg-amber-50 border border-amber-200 rounded-xl flex items-center gap-2 text-amber-800 dark:bg-amber-900/20 dark:border-amber-700 dark:text-amber-300">
            <FlaskConical className="w-4 h-4 shrink-0" />
            <span className="text-sm font-medium">
              Test tournaments are visible. They are hidden from live scoring and the scoreboard when this toggle is off.
            </span>
          </div>
        )}

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl"></div>
            ))}
          </div>
        ) : !displayed || displayed.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center justify-center border-dashed border-2">
            <Trophy className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">No Tournaments Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">Create your first tournament to start recording passes and judging skiers.</p>
            <Button onClick={() => setCreateOpen(true)}>Create Tournament</Button>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {displayed.map(t => {
              const isActive = t.id === activeTournamentId;
              const isTest = t.is_test;
              return (
                <Card
                  key={t.id}
                  className={`p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group ${
                    isTest
                      ? 'border-amber-300 bg-amber-50/50 dark:bg-amber-900/10 dark:border-amber-700/50'
                      : isActive
                      ? 'ring-2 ring-primary border-primary/50'
                      : 'hover:border-primary/30'
                  }`}
                  onClick={() => handleSelect(t.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className={`p-3 rounded-xl transition-colors ${isTest ? 'bg-amber-100 dark:bg-amber-900/30' : 'bg-primary/10 group-hover:bg-primary group-hover:text-white'}`}>
                      {isTest
                        ? <FlaskConical className="w-6 h-6 text-amber-600 dark:text-amber-400" />
                        : <Trophy className="w-6 h-6 text-primary group-hover:text-white transition-colors" />
                      }
                    </div>
                    <div className="flex items-center gap-2">
                      {isTest && <Badge className="bg-amber-100 text-amber-700 border-amber-300 dark:bg-amber-900/30 dark:text-amber-400 text-[10px] uppercase font-bold">TEST</Badge>}
                      {!isTest && t.status === 'active' && <Badge variant="success" className="animate-pulse">Active</Badge>}
                      {!isTest && t.status === 'completed' && <Badge variant="outline">Completed</Badge>}
                      {!isTest && t.status === 'upcoming' && <Badge variant="warning">Upcoming</Badge>}
                    </div>
                  </div>

                  <h3 className="text-xl font-bold mb-1 truncate">{t.name}</h3>
                  <div className="flex items-center text-sm text-muted-foreground mb-6 gap-4">
                    <span className="flex items-center gap-1"><Activity className="w-4 h-4" /> Class {t.tournament_class}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {t.num_rounds} Rounds</span>
                  </div>

                  <div className="flex items-center justify-between mt-auto pt-4 border-t">
                    <span className="text-sm font-semibold text-foreground/70">{t.judge_count} Judges</span>
                    <div className={`flex items-center font-bold text-sm ${isTest ? 'text-amber-600 dark:text-amber-400' : 'text-primary'}`}>
                      {isActive ? 'Continue' : 'Select'} <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Skier History Search ── */}
      <div>
        <PageHeader title="Skier History" subtitle="Search for a skier's pass history across all tournaments." />
        <form
          onSubmit={e => { e.preventDefault(); setSkierSearch(skierSearchInput); }}
          className="flex gap-2 mb-4"
        >
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
            <input
              type="text"
              placeholder="Skier name…"
              value={skierSearchInput}
              onChange={e => setSkierSearchInput(e.target.value)}
              className="w-full h-10 pl-9 pr-3 rounded-xl border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
            />
          </div>
          <Button type="submit" variant="primary" size="sm">Search</Button>
        </form>

        {skierSearch.length >= 2 && (
          skierFetching ? (
            <div className="space-y-2">
              {[1, 2, 3].map(i => <div key={i} className="h-14 bg-muted animate-pulse rounded-xl" />)}
            </div>
          ) : !skierResults || skierResults.length === 0 ? (
            <Card className="p-8 text-center border-dashed">
              <User className="w-10 h-10 mx-auto text-muted-foreground opacity-30 mb-3" />
              <p className="font-semibold text-muted-foreground">No passes found for "{skierSearch}"</p>
            </Card>
          ) : (
            <div className="space-y-2">
              {skierResults.map((p: any) => {
                const rc = p.rope_length ? getRopeColour(p.rope_length) : null;
                return (
                  <Card key={p.id} className="p-3 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm leading-none">{p.skier_name}</p>
                      <p className="text-[11px] text-muted-foreground font-semibold mt-0.5 flex items-center gap-1.5 flex-wrap">
                        R{p.round_number}
                        {p.speed_kph && <span>· {p.speed_kph}kph</span>}
                        {rc && p.rope_length && (
                          <span
                            className="inline-flex items-center px-1.5 py-0.5 rounded border text-[10px] font-bold"
                            style={{ background: rc.bg, color: rc.text, borderColor: rc.border }}
                          >
                            {formatRope(p.rope_length)}
                          </span>
                        )}
                        {p.tournament_id && <span className="text-muted-foreground">· T#{p.tournament_id}</span>}
                      </p>
                    </div>
                    {p.buoys_scored !== null && (
                      <div className="bg-primary/10 text-primary px-3 py-1.5 rounded-xl text-center shrink-0">
                        <p className="font-display font-black text-xl leading-none">{p.buoys_scored}</p>
                        <p className="text-[9px] uppercase font-bold tracking-wider opacity-70">buoys</p>
                      </div>
                    )}
                  </Card>
                );
              })}
            </div>
          )
        )}
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen} title="Create Tournament">
        <form onSubmit={handleCreate} className="space-y-4">
          <Input
            label="Tournament Name"
            required
            value={formData.name}
            onChange={e => setFormData({...formData, name: e.target.value})}
            placeholder="e.g. 2025 Summer Slalom Open"
          />
          <Select
            label="Tournament Class"
            value={formData.class}
            onChange={e => setFormData({...formData, class: e.target.value})}
            options={TOURNAMENT_CLASSES.map(c => ({ label: `Class ${c}`, value: c }))}
          />
          <Select
            label="Number of Judges"
            value={formData.judges}
            onChange={e => setFormData({...formData, judges: Number(e.target.value)})}
            options={[
              { label: '1 Judge (G Class / Practice)', value: 1 },
              { label: '3 Judges (L Class)', value: 3 },
              { label: '5 Judges (R/E Class)', value: 5 },
            ]}
          />
          <Input
            label="Number of Rounds"
            type="number"
            min="1" max="10"
            required
            value={formData.rounds}
            onChange={e => setFormData({...formData, rounds: Number(e.target.value)})}
          />
          <label className="flex items-center gap-3 cursor-pointer select-none p-3 rounded-xl border hover:bg-muted/50 transition-colors">
            <input
              type="checkbox"
              checked={formData.is_test}
              onChange={e => setFormData({...formData, is_test: e.target.checked})}
              className="w-4 h-4 rounded accent-amber-500"
            />
            <div>
              <p className="font-semibold text-sm">Mark as test tournament</p>
              <p className="text-xs text-muted-foreground">Hidden from live views; only visible when "Show test data" is toggled on.</p>
            </div>
          </label>
          {createError && (
            <p className="text-sm text-red-500 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{createError}</p>
          )}
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending}>Create Tournament</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
