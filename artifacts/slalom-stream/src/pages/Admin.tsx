import React, { useState } from 'react';
import { useAppStore } from '@/lib/store';
import { useListSkiers, useCreateSkier, useListJudges, useCreateJudge, useVerifyAdminPin } from '@workspace/api-client-react';
import { Card, Button, PageHeader, Input, Select, Badge } from '@/components/ui/shared';
import { Settings, Shield, UserPlus } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { DIVISIONS, JUDGE_ROLES } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';

export default function Admin() {
  const { adminPinValid, setAdminPinValid, activeTournamentId } = useAppStore();
  const [pinInput, setPinInput] = useState('');
  const { toast } = useToast();
  const verifyMutation = useVerifyAdminPin();

  if (!adminPinValid) {
    const handleLogin = (e: React.FormEvent) => {
      e.preventDefault();
      verifyMutation.mutate({ data: { pin: pinInput } }, {
        onSuccess: (res) => {
          if (res.valid) {
            setAdminPinValid(true);
            toast({ title: "Admin Access Granted" });
          } else {
            toast({ title: "Invalid PIN", variant: "destructive" });
          }
        }
      });
    };

    return (
      <div className="max-w-md mx-auto mt-20">
        <Card className="p-8 text-center border-t-4 border-t-primary shadow-2xl">
          <Shield className="w-16 h-16 text-primary mx-auto mb-6" />
          <h2 className="text-2xl font-display font-bold mb-2">Admin Access Required</h2>
          <p className="text-muted-foreground mb-8">Enter the master admin PIN to manage tournament settings.</p>
          <form onSubmit={handleLogin} className="space-y-4">
            <Input 
              type="password" 
              className="text-center tracking-widest text-2xl h-14 font-mono" 
              placeholder="••••" 
              value={pinInput} 
              onChange={e => setPinInput(e.target.value)} 
            />
            <Button variant="primary" className="w-full h-12" isLoading={verifyMutation.isPending}>Authenticate</Button>
          </form>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <PageHeader 
        title="Admin Control Panel" 
        actions={<Button variant="outline" onClick={() => setAdminPinValid(false)}>Lock Admin</Button>} 
      />
      
      {!activeTournamentId ? (
        <Card className="p-8 text-center text-muted-foreground">Select an active tournament from the Home page to manage its roster and judges.</Card>
      ) : (
        <div className="grid lg:grid-cols-2 gap-8">
          <SkierManagement tournamentId={activeTournamentId} />
          <JudgeManagement tournamentId={activeTournamentId} />
        </div>
      )}
    </div>
  );
}

function SkierManagement({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { data: skiers } = useListSkiers(tournamentId);
  const createMutation = useCreateSkier({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'skiers'] }) }
  });

  const [form, setForm] = useState({ first_name: '', surname: '', division: DIVISIONS[0] });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      id: tournamentId,
      data: { ...form, is_financial: true }
    }, {
      onSuccess: () => setForm({ first_name: '', surname: '', division: DIVISIONS[0] })
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-6 border-b bg-muted/30">
        <h3 className="font-bold text-lg flex items-center gap-2"><UserPlus className="w-5 h-5 text-primary" /> Roster Management</h3>
      </div>
      <div className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 items-end mb-8">
          <Input label="First Name" required value={form.first_name} onChange={e => setForm({...form, first_name: e.target.value})} className="h-10" />
          <Input label="Last Name" required value={form.surname} onChange={e => setForm({...form, surname: e.target.value})} className="h-10" />
          <Select label="Div" value={form.division} onChange={e => setForm({...form, division: e.target.value})} options={DIVISIONS.map(d => ({ label: d, value: d }))} className="h-10" />
          <Button variant="primary" type="submit" isLoading={createMutation.isPending} className="h-10 px-6 shrink-0">Add</Button>
        </form>

        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Division</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {skiers?.map(s => (
                <tr key={s.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-semibold">{s.first_name} {s.surname}</td>
                  <td className="px-4 py-3"><Badge variant="outline">{s.division}</Badge></td>
                </tr>
              ))}
              {skiers?.length === 0 && <tr><td colSpan={2} className="px-4 py-8 text-center text-muted-foreground">No skiers added yet.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}

function JudgeManagement({ tournamentId }: { tournamentId: number }) {
  const queryClient = useQueryClient();
  const { data: judges } = useListJudges(tournamentId);
  const createMutation = useCreateJudge({
    mutation: { onSuccess: () => queryClient.invalidateQueries({ queryKey: ['/api/tournaments', tournamentId, 'judges'] }) }
  });

  const [form, setForm] = useState({ name: '', judge_role: JUDGE_ROLES[0], pin: '' });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate({
      id: tournamentId,
      data: { ...form, is_active: true }
    }, {
      onSuccess: () => setForm({ name: '', judge_role: JUDGE_ROLES[0], pin: '' })
    });
  };

  return (
    <Card className="overflow-hidden">
      <div className="p-6 border-b bg-muted/30">
        <h3 className="font-bold text-lg flex items-center gap-2"><Settings className="w-5 h-5 text-primary" /> Judge Accounts</h3>
      </div>
      <div className="p-6">
        <form onSubmit={onSubmit} className="flex flex-col sm:flex-row gap-3 items-end mb-8">
          <Input label="Name" required value={form.name} onChange={e => setForm({...form, name: e.target.value})} className="h-10" />
          <Select label="Role" value={form.judge_role} onChange={e => setForm({...form, judge_role: e.target.value})} options={JUDGE_ROLES.map(r => ({ label: r.replace('_', ' ').toUpperCase(), value: r }))} className="h-10" />
          <Input label="PIN" type="password" maxLength={4} required value={form.pin} onChange={e => setForm({...form, pin: e.target.value})} className="h-10 w-24" placeholder="1234" />
          <Button variant="primary" type="submit" isLoading={createMutation.isPending} className="h-10 px-6 shrink-0">Create</Button>
        </form>

        <div className="border rounded-xl overflow-hidden">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider">
              <tr>
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Role</th>
                <th className="px-4 py-3 text-right">PIN Setup</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {judges?.map(j => (
                <tr key={j.id} className="hover:bg-muted/50">
                  <td className="px-4 py-3 font-semibold">{j.name}</td>
                  <td className="px-4 py-3"><Badge className="uppercase">{j.judge_role.replace('_', ' ')}</Badge></td>
                  <td className="px-4 py-3 text-right text-muted-foreground text-xs">{j.pin ? 'Yes' : 'No'}</td>
                </tr>
              ))}
              {judges?.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-muted-foreground">No judges configured.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </Card>
  );
}
