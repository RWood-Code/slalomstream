import React, { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, Badge, Input, Select, PageHeader, Button } from '@/components/ui/shared';
import { Users, Search, CheckCircle2, XCircle, ChevronDown, ChevronUp, KeyRound, Trash2, Save } from 'lucide-react';

type Official = {
  id: number;
  first_name: string;
  surname: string;
  region: string;
  financial: boolean;
  slalom_grade: string | null;
  slalom_notes: string | null;
  is_active: boolean;
  pin: string | null;
  judge_role: string | null;
};

const REGIONS = ['All', 'Auckland', 'BOP', 'Canterbury', 'Central', 'Northland', 'Southern', 'Waikato'];
const GRADES  = ['All', 'J1', 'J2', 'J2*', 'J3', 'J3*'];
const JUDGE_ROLES_OPTIONS = [
  { label: '— auto from grade —', value: '' },
  { label: 'Judge A',    value: 'judge_a' },
  { label: 'Judge B',    value: 'judge_b' },
  { label: 'Judge C',    value: 'judge_c' },
  { label: 'Boat Judge', value: 'boat_judge' },
  { label: 'Chief Judge',value: 'chief_judge' },
];

const GRADE_COLOURS: Record<string, string> = {
  J1:  'bg-amber-100 text-amber-800 border-amber-300',
  J2:  'bg-blue-100 text-blue-800 border-blue-300',
  'J2*': 'bg-sky-100 text-sky-800 border-sky-300',
  J3:  'bg-purple-100 text-purple-800 border-purple-300',
  'J3*': 'bg-violet-100 text-violet-800 border-violet-300',
};

function GradeBadge({ grade }: { grade: string | null }) {
  if (!grade) return <span className="text-muted-foreground text-xs">—</span>;
  const base = grade.startsWith('J1') ? 'J1'
    : grade === 'J2' ? 'J2'
    : grade === 'J2*' ? 'J2*'
    : grade.startsWith('J3*') ? 'J3*'
    : grade.startsWith('J3') ? 'J3'
    : null;
  const cls = base ? GRADE_COLOURS[base] : 'bg-muted text-muted-foreground border-border';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded border text-xs font-bold ${cls}`}>
      {grade.startsWith('J1') ? 'J1' : grade}
    </span>
  );
}

function SetPinPanel({ official, onClose, onSaved }: {
  official: Official;
  onClose: () => void;
  onSaved: (updated: Official) => void;
}) {
  const [pinVal, setPinVal] = useState(official.pin ?? '');
  const [roleVal, setRoleVal] = useState(official.judge_role ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/officials/${official.id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: pinVal, judge_role: roleVal }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const clear = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/officials/${official.id}/pin`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pin: '', judge_role: '' }),
      });
      if (!res.ok) throw new Error(await res.text());
      const updated = await res.json();
      onSaved(updated);
      onClose();
    } catch (e: any) {
      setError(e.message || 'Clear failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <tr className="bg-primary/5 border-t-0">
      <td colSpan={6} className="px-4 pb-3 pt-1">
        <div className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Judge PIN</label>
            <input
              type="text"
              inputMode="numeric"
              maxLength={6}
              autoComplete="new-password"
              name="official-pin-field"
              className="h-9 w-24 border border-input rounded-lg px-3 text-sm font-mono bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              placeholder="1234"
              value={pinVal}
              onChange={e => setPinVal(e.target.value)}
            />
          </div>
          <div>
            <label className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground block mb-1">Default Role</label>
            <select
              className="h-9 border border-input rounded-lg px-2 text-sm bg-background focus:outline-none focus:ring-2 focus:ring-primary/30"
              value={roleVal}
              onChange={e => setRoleVal(e.target.value)}
            >
              {JUDGE_ROLES_OPTIONS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <Button size="sm" variant="primary" onClick={save} isLoading={saving} className="flex items-center gap-1.5 h-9">
            <Save className="w-3.5 h-3.5" /> Save PIN
          </Button>
          {official.pin && (
            <Button size="sm" variant="outline" onClick={clear} isLoading={saving} className="flex items-center gap-1.5 h-9 text-destructive border-destructive/30 hover:bg-destructive/5">
              <Trash2 className="w-3.5 h-3.5" /> Clear PIN
            </Button>
          )}
          <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground ml-2">Cancel</button>
          {error && <span className="text-xs text-destructive">{error}</span>}
        </div>
        <p className="text-[10px] text-muted-foreground mt-2">
          When a PIN is set this official appears automatically in the judge login for any tournament.
          Their role defaults to their grade unless overridden here.
        </p>
      </td>
    </tr>
  );
}

type SortKey = 'surname' | 'region' | 'slalom_grade';

export default function Officials() {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState('All');
  const [grade, setGrade] = useState('All');
  const [financialOnly, setFinancialOnly] = useState(false);
  const [sort, setSort] = useState<SortKey>('surname');
  const [sortAsc, setSortAsc] = useState(true);
  const [expandedPinId, setExpandedPinId] = useState<number | null>(null);
  const queryClient = useQueryClient();

  const { data: officials = [], isLoading } = useQuery<Official[]>({
    queryKey: ['officials'],
    queryFn: async () => {
      const res = await fetch('/api/officials');
      if (!res.ok) throw new Error('Failed to load officials');
      return res.json();
    },
  });

  const handlePinSaved = (updated: Official) => {
    queryClient.setQueryData<Official[]>(['officials'], prev =>
      prev ? prev.map(o => o.id === updated.id ? updated : o) : prev
    );
  };

  const filtered = useMemo(() => {
    let list = officials.filter(o => o.is_active);

    if (search) {
      const q = search.toLowerCase();
      list = list.filter(o =>
        o.first_name.toLowerCase().includes(q) ||
        o.surname.toLowerCase().includes(q)
      );
    }
    if (region !== 'All') list = list.filter(o => o.region === region);
    if (financialOnly) list = list.filter(o => o.financial);
    if (grade !== 'All') {
      list = list.filter(o => {
        if (!o.slalom_grade) return false;
        if (grade === 'J1') return o.slalom_grade.startsWith('J1');
        if (grade === 'J3*') return o.slalom_grade.includes('J3*');
        if (grade === 'J3') return o.slalom_grade.startsWith('J3') && !o.slalom_grade.includes('J3*');
        return o.slalom_grade === grade;
      });
    }

    list = [...list].sort((a, b) => {
      let av: string, bv: string;
      if (sort === 'surname') { av = a.surname; bv = b.surname; }
      else if (sort === 'region') { av = a.region; bv = b.region; }
      else { av = a.slalom_grade ?? 'ZZZ'; bv = b.slalom_grade ?? 'ZZZ'; }
      return sortAsc ? av.localeCompare(bv) : bv.localeCompare(av);
    });

    return list;
  }, [officials, search, region, grade, financialOnly, sort, sortAsc]);

  const byRegion = useMemo(() => {
    const m: Record<string, number> = {};
    officials.forEach(o => { if (o.is_active) m[o.region] = (m[o.region] || 0) + 1; });
    return m;
  }, [officials]);

  const toggleSort = (key: SortKey) => {
    if (sort === key) setSortAsc(v => !v);
    else { setSort(key); setSortAsc(true); }
  };

  const SortIcon = ({ k }: { k: SortKey }) => (
    sort === k
      ? (sortAsc ? <ChevronUp className="w-3 h-3 inline ml-1" /> : <ChevronDown className="w-3 h-3 inline ml-1" />)
      : null
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title="NZTWSA Officials Register"
        subtitle="Accredited waterski judges — as at 13 February 2026"
      />

      {/* Summary chips */}
      <div className="flex flex-wrap gap-2">
        {REGIONS.slice(1).map(r => (
          <button
            key={r}
            onClick={() => setRegion(r === region ? 'All' : r)}
            className={`px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${
              region === r
                ? 'bg-primary text-primary-foreground border-primary'
                : 'bg-card border-border text-muted-foreground hover:border-primary/50'
            }`}
          >
            {r} <span className="opacity-60">·</span> {byRegion[r] ?? 0}
          </button>
        ))}
      </div>

      {/* Filters */}
      <Card className="p-4">
        <div className="flex flex-wrap gap-3 items-end">
          <div className="flex-1 min-w-[180px]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                className="w-full pl-9 pr-4 py-2 h-10 bg-muted/50 border border-input rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                placeholder="Search by name…"
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
            </div>
          </div>
          <Select
            label="Region"
            value={region}
            onChange={e => setRegion(e.target.value)}
            options={REGIONS.map(r => ({ label: r, value: r }))}
            className="h-10 w-40"
          />
          <Select
            label="Slalom Grade"
            value={grade}
            onChange={e => setGrade(e.target.value)}
            options={GRADES.map(g => ({ label: g, value: g }))}
            className="h-10 w-32"
          />
          <label className="flex items-center gap-2 cursor-pointer select-none mb-0.5">
            <input
              type="checkbox"
              checked={financialOnly}
              onChange={e => setFinancialOnly(e.target.checked)}
              className="w-4 h-4 accent-primary"
            />
            <span className="text-sm font-medium">Financial 2025/26</span>
          </label>
        </div>
        <p className="text-xs text-muted-foreground mt-3">
          Showing <strong>{filtered.length}</strong> of <strong>{officials.filter(o => o.is_active).length}</strong> officials.
          {' '}Financial members may judge at NZTWSA sanctioned tournaments.
        </p>
      </Card>

      {/* Table */}
      <Card className="overflow-hidden">
        {isLoading ? (
          <div className="p-16 text-center text-muted-foreground">Loading officials register…</div>
        ) : filtered.length === 0 ? (
          <div className="p-16 text-center text-muted-foreground">
            <Users className="w-12 h-12 mx-auto mb-4 opacity-20" />
            <p>No officials match your filters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-muted text-muted-foreground uppercase text-[10px] font-bold tracking-wider sticky top-0">
                <tr>
                  <th className="px-4 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('surname')}>
                    Name <SortIcon k="surname" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('region')}>
                    Region <SortIcon k="region" />
                  </th>
                  <th className="px-4 py-3 cursor-pointer hover:text-foreground" onClick={() => toggleSort('slalom_grade')}>
                    Slalom Grade <SortIcon k="slalom_grade" />
                  </th>
                  <th className="px-4 py-3 text-center">Financial</th>
                  <th className="px-4 py-3 text-center">Judge PIN</th>
                  <th className="px-4 py-3">Notes</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {filtered.map(o => (
                  <React.Fragment key={o.id}>
                    <tr className="hover:bg-muted/40 transition-colors">
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        {o.first_name} {o.surname}
                      </td>
                      <td className="px-4 py-3">
                        <span className="text-muted-foreground text-xs font-medium">{o.region}</span>
                      </td>
                      <td className="px-4 py-3">
                        <GradeBadge grade={o.slalom_grade} />
                      </td>
                      <td className="px-4 py-3 text-center">
                        {o.financial
                          ? <CheckCircle2 className="w-4 h-4 text-emerald-500 mx-auto" />
                          : <XCircle className="w-4 h-4 text-muted-foreground/40 mx-auto" />
                        }
                      </td>
                      <td className="px-4 py-3 text-center">
                        <button
                          onClick={() => setExpandedPinId(expandedPinId === o.id ? null : o.id)}
                          className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold border transition-colors ${
                            o.pin
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:border-emerald-800'
                              : 'bg-muted text-muted-foreground border-border hover:border-primary/40'
                          }`}
                        >
                          <KeyRound className="w-3 h-3" />
                          {o.pin ? 'PIN set' : 'Set PIN'}
                        </button>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">{o.slalom_notes ?? ''}</td>
                    </tr>
                    {expandedPinId === o.id && (
                      <SetPinPanel
                        official={o}
                        onClose={() => setExpandedPinId(null)}
                        onSaved={handlePinSaved}
                      />
                    )}
                  </React.Fragment>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Grade legend */}
      <Card className="p-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-3">IWWF Slalom Grade Key</h4>
        <div className="flex flex-wrap gap-3 text-xs">
          {[
            { grade: 'J1', desc: 'IWWF Level 1 — highest international grade. Required for World Championships.' },
            { grade: 'J2', desc: 'IWWF Level 2 — national level. Can judge sanctioned events.' },
            { grade: 'J2*', desc: 'IWWF Level 2 (EMS) — qualified in 1 or 2 events only.' },
            { grade: 'J3', desc: 'IWWF Level 3 — regional / club events.' },
            { grade: 'J3*', desc: 'IWWF Level 3 (EMS) — limited events.' },
          ].map(({ grade, desc }) => (
            <div key={grade} className="flex items-start gap-2 min-w-[200px] flex-1">
              <GradeBadge grade={grade} />
              <span className="text-muted-foreground leading-tight">{desc}</span>
            </div>
          ))}
        </div>
        <p className="text-xs text-muted-foreground mt-4 border-t pt-3">
          Source: NZTWSA Judges Register, 13 February 2026.
          Updates: <a href="mailto:anne@arani.nz" className="text-primary hover:underline">anne@arani.nz</a>
        </p>
      </Card>
    </div>
  );
}
