import { createContext, useContext, useState, useEffect, useCallback } from 'react';
import type { ReactNode } from 'react';
import type { Team } from '../types';
import { api } from '../api/client';
import { useAuth } from './AuthContext';

interface TeamContextType {
  teams: Team[];
  activeTeam: Team | null;
  loading: boolean;
  setActiveTeam: (team: Team | null) => void;
  refreshTeams: () => Promise<void>;
}

const TeamContext = createContext<TeamContextType | null>(null);

const ACTIVE_TEAM_KEY = 'fieldscout_active_team_id';

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [teams, setTeams] = useState<Team[]>([]);
  const [activeTeam, setActiveTeamState] = useState<Team | null>(null);
  const [loading, setLoading] = useState(true);

  const refreshTeams = useCallback(async () => {
    if (!user) {
      setTeams([]);
      setActiveTeamState(null);
      setLoading(false);
      return;
    }
    try {
      const fetched = await api.getTeams();
      setTeams(fetched);

      const savedId = localStorage.getItem(ACTIVE_TEAM_KEY);
      if (savedId) {
        const saved = fetched.find(t => t.id === Number(savedId));
        if (saved) {
          setActiveTeamState(saved);
        } else {
          localStorage.removeItem(ACTIVE_TEAM_KEY);
          setActiveTeamState(null);
        }
      }
    } catch {
      // Offline or error — keep existing state
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    refreshTeams();
  }, [refreshTeams]);

  const setActiveTeam = useCallback((team: Team | null) => {
    setActiveTeamState(team);
    if (team) {
      localStorage.setItem(ACTIVE_TEAM_KEY, String(team.id));
    } else {
      localStorage.removeItem(ACTIVE_TEAM_KEY);
    }
  }, []);

  return (
    <TeamContext.Provider value={{ teams, activeTeam, loading, setActiveTeam, refreshTeams }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam(): TeamContextType {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used within TeamProvider');
  return ctx;
}
