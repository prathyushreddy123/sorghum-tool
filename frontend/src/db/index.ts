import Dexie, { type EntityTable } from 'dexie';

// ─── Cached data tables (mirrors of server data) ─────────────────────────────

export interface CachedTrial {
  id: number;
  name: string;
  crop: string;
  location: string;
  start_date: string;
  end_date: string | null;
  walk_mode: string;
  created_at: string;
  plot_count: number;
  scored_count: number;
  _cachedAt: number;
}

export interface CachedPlot {
  id: number;
  trial_id: number;
  plot_id: string;
  genotype: string;
  rep: number;
  row: number;
  column: number;
  notes: string | null;
  plot_status: string;
  has_observations: boolean;
  _cachedAt: number;
}

export interface CachedTrait {
  id: number;
  name: string;
  label: string;
  data_type: string;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  categories: string | null;
  category_labels: string | null;
  description: string | null;
  crop_hint: string | null;
  is_system: boolean;
  _cachedAt: number;
}

export interface CachedTrialTrait {
  id: number;
  trial_id: number;
  trait_id: number;
  display_order: number;
  _cachedAt: number;
}

export interface CachedScoringRound {
  id: number;
  trial_id: number;
  name: string;
  scored_at: string | null;
  notes: string | null;
  created_at: string;
  scored_plots: number;
  total_plots: number;
  _cachedAt: number;
}

export interface CachedObservation {
  id: number;
  plot_id: number;
  trait_id: number | null;
  scoring_round_id: number | null;
  trait_name: string;
  value: string;
  recorded_at: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  temperature: number | null;
  humidity: number | null;
  _cachedAt: number;
}

// ─── Sync queue ──────────────────────────────────────────────────────────────

export type SyncAction =
  | { type: 'saveObservations'; plotId: number; data: unknown }
  | { type: 'updatePlotStatus'; trialId: number; plotId: number; status: string };

export interface PendingSync {
  id?: number;
  action: SyncAction;
  createdAt: number;
  retries: number;
}

// ─── Database ────────────────────────────────────────────────────────────────

class FieldScoutDB extends Dexie {
  trials!: EntityTable<CachedTrial, 'id'>;
  plots!: EntityTable<CachedPlot, 'id'>;
  traits!: EntityTable<CachedTrait, 'id'>;
  trialTraits!: EntityTable<CachedTrialTrait, 'id'>;
  scoringRounds!: EntityTable<CachedScoringRound, 'id'>;
  observations!: EntityTable<CachedObservation, 'id'>;
  pendingSync!: EntityTable<PendingSync, 'id'>;

  constructor() {
    super('fieldscout');
    this.version(1).stores({
      trials: 'id, _cachedAt',
      plots: 'id, trial_id, _cachedAt',
      traits: 'id, _cachedAt',
      trialTraits: 'id, trial_id, trait_id, _cachedAt',
      scoringRounds: 'id, trial_id, _cachedAt',
      observations: 'id, plot_id, [plot_id+scoring_round_id], _cachedAt',
      pendingSync: '++id, createdAt',
    });
  }
}

export const db = new FieldScoutDB();
