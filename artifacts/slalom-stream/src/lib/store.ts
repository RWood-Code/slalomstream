import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface AppState {
  activeTournamentId: number | null;
  setActiveTournamentId: (id: number | null) => void;
  
  adminPinValid: boolean;
  setAdminPinValid: (valid: boolean) => void;

  adminToken: string | null;
  setAdminToken: (token: string | null) => void;
  
  activeJudgeId: number | null;
  activeJudgeRole: string | null;
  activeJudgeName: string | null;
  setJudgeSession: (id: number | null, role: string | null, name: string | null) => void;
  
  logout: () => void;
}

export const useAppStore = create<AppState>()(
  persist(
    (set) => ({
      activeTournamentId: null,
      setActiveTournamentId: (id) => set({ activeTournamentId: id }),
      
      adminPinValid: false,
      setAdminPinValid: (valid) => set({ adminPinValid: valid }),

      adminToken: null,
      setAdminToken: (token) => set({ adminToken: token }),
      
      activeJudgeId: null,
      activeJudgeRole: null,
      activeJudgeName: null,
      setJudgeSession: (id, role, name) => set({ activeJudgeId: id, activeJudgeRole: role, activeJudgeName: name }),
      
      logout: () => set({ adminPinValid: false, adminToken: null, activeJudgeId: null, activeJudgeRole: null, activeJudgeName: null }),
    }),
    {
      name: 'slalom-stream-storage',
    }
  )
);
