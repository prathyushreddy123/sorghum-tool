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
  team_id: number | null;
  team_name: string | null;
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

// ─── Pending images (offline upload queue) ────────────────────────────────────

export interface PendingImage {
  id?: number;
  plotId: number;
  imageType: 'panicle' | 'full_plant';
  compressedBlob: Blob;
  originalName: string;
  capturedAt: number;
  sizeBytes: number;
}

export interface CachedImage {
  id: number;       // matches server Image.id
  plotId: number;
  filename: string;
  thumbnailBlob: Blob | null;
  _cachedAt: number;
}

// ─── Sync queue ──────────────────────────────────────────────────────────────

export type SyncAction =
  | { type: 'saveObservations'; plotId: number; data: unknown }
  | { type: 'updatePlotStatus'; trialId: number; plotId: number; status: string }
  | { type: 'createTrait'; data: unknown; tempId: number }
  | { type: 'createTrial'; data: unknown; tempId: number }
  | { type: 'uploadImage'; plotId: number; pendingImageId: number; imageType: string };

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
  pendingImages!: EntityTable<PendingImage, 'id'>;
  cachedImages!: EntityTable<CachedImage, 'id'>;

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
    this.version(2).stores({
      trials: 'id, team_id, _cachedAt',
      plots: 'id, trial_id, _cachedAt',
      traits: 'id, _cachedAt',
      trialTraits: 'id, trial_id, trait_id, _cachedAt',
      scoringRounds: 'id, trial_id, _cachedAt',
      observations: 'id, plot_id, [plot_id+scoring_round_id], _cachedAt',
      pendingSync: '++id, createdAt',
    });
    this.version(3).stores({
      trials: 'id, team_id, _cachedAt',
      plots: 'id, trial_id, _cachedAt',
      traits: 'id, _cachedAt',
      trialTraits: 'id, trial_id, trait_id, _cachedAt',
      scoringRounds: 'id, trial_id, _cachedAt',
      observations: 'id, plot_id, [plot_id+scoring_round_id], _cachedAt',
      pendingSync: '++id, createdAt',
      pendingImages: '++id, plotId, capturedAt',
      cachedImages: 'id, plotId, _cachedAt',
    });
  }
}

export const db = new FieldScoutDB();
