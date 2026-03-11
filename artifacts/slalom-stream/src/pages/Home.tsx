import React, { useState } from 'react';
import { useListTournaments, useCreateTournament } from '@workspace/api-client-react';
import { useAppStore } from '@/lib/store';
import { useLocation } from 'wouter';
import { Card, Button, Badge, PageHeader, Dialog, Input, Select } from '@/components/ui/shared';
import { Trophy, CalendarPlus, ChevronRight, Activity, Calendar } from 'lucide-react';
import { TOURNAMENT_CLASSES } from '@/lib/utils';
import { useQueryClient } from '@tanstack/react-query';

export default function Home() {
  const [, setLocation] = useLocation();
  const { activeTournamentId, setActiveTournamentId } = useAppStore();
  const queryClient = useQueryClient();
  const { data: tournaments, isLoading } = useListTournaments();
  
  const [createOpen, setCreateOpen] = useState(false);
  const [formData, setFormData] = useState({ name: '', class: 'L', judges: 3, rounds: 2 });
  
  const createMutation = useCreateTournament({
    mutation: {
      onSuccess: (data) => {
        queryClient.invalidateQueries({ queryKey: ['/api/tournaments'] });
        setActiveTournamentId(data.id);
        setCreateOpen(false);
      }
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
      }
    });
  };

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
          title="Recent Tournaments" 
          subtitle="Select a tournament to enter scoring mode or view live results."
        />

        {isLoading ? (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => (
              <div key={i} className="h-48 bg-muted animate-pulse rounded-2xl"></div>
            ))}
          </div>
        ) : !tournaments || tournaments.length === 0 ? (
          <Card className="p-12 text-center flex flex-col items-center justify-center border-dashed border-2">
            <Trophy className="w-16 h-16 text-muted-foreground mb-4 opacity-50" />
            <h3 className="text-xl font-bold mb-2">No Tournaments Yet</h3>
            <p className="text-muted-foreground mb-6 max-w-sm">Create your first tournament to start recording passes and judging skiers.</p>
            <Button onClick={() => setCreateOpen(true)}>Create Tournament</Button>
          </Card>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {tournaments.map(t => {
              const isActive = t.id === activeTournamentId;
              return (
                <Card 
                  key={t.id} 
                  className={`p-6 cursor-pointer transition-all duration-300 hover:shadow-xl hover:-translate-y-1 group ${isActive ? 'ring-2 ring-primary border-primary/50' : 'hover:border-primary/30'}`}
                  onClick={() => handleSelect(t.id)}
                >
                  <div className="flex justify-between items-start mb-4">
                    <div className="p-3 bg-primary/10 rounded-xl group-hover:bg-primary group-hover:text-white transition-colors">
                      <Trophy className={`w-6 h-6 ${isActive ? 'text-primary group-hover:text-white' : 'text-primary'}`} />
                    </div>
                    {t.status === 'active' && <Badge variant="success" className="animate-pulse">Active</Badge>}
                    {t.status === 'completed' && <Badge variant="outline">Completed</Badge>}
                    {t.status === 'upcoming' && <Badge variant="warning">Upcoming</Badge>}
                  </div>
                  
                  <h3 className="text-xl font-bold mb-1 truncate">{t.name}</h3>
                  <div className="flex items-center text-sm text-muted-foreground mb-6 gap-4">
                    <span className="flex items-center gap-1"><Activity className="w-4 h-4" /> Class {t.tournament_class}</span>
                    <span className="flex items-center gap-1"><Calendar className="w-4 h-4" /> {t.num_rounds} Rounds</span>
                  </div>
                  
                  <div className="flex items-center justify-between mt-auto pt-4 border-t">
                    <span className="text-sm font-semibold text-foreground/70">{t.judge_count} Judges</span>
                    <div className="flex items-center text-primary font-bold text-sm">
                      {isActive ? 'Continue' : 'Select'} <ChevronRight className="w-4 h-4 ml-1 group-hover:translate-x-1 transition-transform" />
                    </div>
                  </div>
                </Card>
              );
            })}
          </div>
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
          <div className="pt-4 flex justify-end gap-3">
            <Button type="button" variant="ghost" onClick={() => setCreateOpen(false)}>Cancel</Button>
            <Button type="submit" variant="primary" isLoading={createMutation.isPending}>Create Tournament</Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
