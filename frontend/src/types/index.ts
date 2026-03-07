export interface User {
  id: number;
  email: string;
  name: string;
  role: string;
  email_verified: boolean;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

// ─── Teams ───────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: number;
  user_id: number;
  user_name: string;
  user_email: string;
  joined_at: string;
}

export interface Team {
  id: number;
  name: string;
  invite_code: string;
  created_by: number;
  created_at: string;
  member_count: number;
  members: TeamMember[];
}

export interface TeamCreate {
  name: string;
}

// ─── Traits ──────────────────────────────────────────────────────────────────

export type TraitDataType = 'integer' | 'float' | 'date' | 'categorical' | 'text';

export interface Trait {
  id: number;
  name: string;
  label: string;
  data_type: TraitDataType;
  unit: string | null;
  min_value: number | null;
  max_value: number | null;
  categories: string | null;       // JSON array string e.g. '["1","2","3"]'
  category_labels: string | null;  // JSON array string e.g. '["None","Low","Moderate"]'
  description: string | null;
  crop_hint: string | null;
  is_system: boolean;
}

export interface TraitCreate {
  name: string;
  label: string;
  data_type: TraitDataType;
  unit?: string;
  min_value?: number;
  max_value?: number;
  categories?: string;
  category_labels?: string;
  description?: string;
  crop_hint?: string;
}

export interface TrialTrait {
  id: number;
  trial_id: number;
  trait_id: number;
  display_order: number;
  trait: Trait;
}

// Parsed version with arrays instead of JSON strings
export interface ParsedTrait extends Omit<Trait, 'categories' | 'category_labels'> {
  categoriesArr: string[];
  categoryLabelsArr: string[];
}

export function parseTrait(trait: Trait): ParsedTrait {
  return {
    ...trait,
    categoriesArr: trait.categories ? JSON.parse(trait.categories) : [],
    categoryLabelsArr: trait.category_labels ? JSON.parse(trait.category_labels) : [],
  };
}

// ─── Scoring Rounds ───────────────────────────────────────────────────────────

export interface ScoringRound {
  id: number;
  trial_id: number;
  name: string;
  scored_at: string | null;
  notes: string | null;
  created_at: string;
  scored_plots: number;
  total_plots: number;
}

export interface ScoringRoundCreate {
  name: string;
  scored_at?: string;
  notes?: string;
}

// ─── Trial ───────────────────────────────────────────────────────────────────

export type WalkMode = 'row_by_row' | 'serpentine' | 'column_by_column' | 'free';

export interface Trial {
  id: number;
  name: string;
  crop: string;
  location: string;
  start_date: string;
  end_date: string | null;
  walk_mode: WalkMode;
  created_at: string;
  plot_count: number;
  scored_count: number;
  team_id: number | null;
  team_name: string | null;
}

export interface TrialCreate {
  name: string;
  crop?: string;
  location: string;
  start_date: string;
  end_date?: string;
  walk_mode?: WalkMode;
  trait_ids?: number[];
  first_round_name?: string;
  team_id?: number;
}

export interface TrialCloneRequest {
  name: string;
  location: string;
  start_date: string;
  end_date?: string;
  first_round_name?: string;
}

// ─── Plot ─────────────────────────────────────────────────────────────────────

export type PlotStatus = 'active' | 'skipped' | 'flagged' | 'border';

export interface Plot {
  id: number;
  trial_id: number;
  plot_id: string;
  genotype: string;
  rep: number;
  row: number;
  column: number;
  notes: string | null;
  plot_status: PlotStatus;
  has_observations: boolean;
}

export interface PlotAttribute {
  key: string;
  value: string;
}

// ─── Observation ──────────────────────────────────────────────────────────────

export interface Observation {
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
}

export interface ObservationBulkItem {
  trait_id?: number;
  trait_name?: string;
  value: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  temperature?: number;
  humidity?: number;
}

export interface ObservationBulkCreate {
  scoring_round_id?: number;
  observations: ObservationBulkItem[];
}

// ─── API Key ──────────────────────────────────────────────────────────────────

export interface APIKey {
  id: number;
  user_label: string;
  created_at: string;
  last_used_at: string | null;
  is_active: boolean;
}

export interface APIKeyCreateResponse extends APIKey {
  raw_key: string;
}

// ─── Image ────────────────────────────────────────────────────────────────────

export interface PlotImage {
  id: number;
  plot_id: number;
  filename: string;
  original_name: string;
  image_type: 'panicle' | 'full_plant';
  uploaded_at: string;
}

// ─── Stats ────────────────────────────────────────────────────────────────────

export interface DistributionItem {
  value: string;
  label: string | null;
  count: number;
}

export interface TraitStatItem {
  trait_id: number;
  trait_name: string;
  trait_label: string;
  data_type: TraitDataType;
  unit: string | null;
  count: number;
  total_plots: number;
  mean?: number;
  sd?: number;
  min_value?: number;
  max_value?: number;
  distribution?: DistributionItem[];
  earliest?: string;
  latest?: string;
}

export interface TrialStats {
  trial_id: number;
  round_id: number | null;
  total_plots: number;
  scored_plots: number;
  traits: TraitStatItem[];
}

// ─── Heatmap ──────────────────────────────────────────────────────────────────

export interface HeatmapCell {
  plot_id: string;
  plot_pk: number;
  row: number;
  column: number;
  genotype: string;
  plot_status: PlotStatus;
  value: string | null;
  numeric_value: number | null;
}

export interface HeatmapData {
  rows: number;
  columns: number;
  cells: HeatmapCell[];
  trait: Trait | null;
  round_id: number | null;
}

// ─── Misc ─────────────────────────────────────────────────────────────────────

export interface PlotImportResponse {
  imported: number;
  errors: string[];
}

export interface NextUnscoredResponse {
  next_plot_id: number | null;
}

export interface SeverityPrediction {
  severity: number;
  confidence: number;
  reasoning: string;
  provider: string;
}

export interface HeightPrediction {
  height_cm: number;
  confidence: number;
  reasoning: string;
  provider: string;
}

export type ClinometerStep = 'distance' | 'base' | 'top' | 'result';

// ─── Training ─────────────────────────────────────────────────────────────────

export type TrainingJobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface TrainingJob {
  id: number;
  trait_name: string;
  status: TrainingJobStatus;
  created_at: string;
  started_at: string | null;
  completed_at: string | null;
  config: string | null;      // JSON string
  metrics: string | null;     // JSON string
  model_path: string | null;
  error_message: string | null;
  sample_count: number | null;
}

export interface TrainingSampleStats {
  total: number;
  by_value: Record<string, number>;
  by_trait: Record<string, number>;
  by_source: Record<string, number>;
}

export interface ReferenceImage {
  filename: string;
  value: string;
  path: string;
}

export interface ReviewQueueItem {
  id: number;
  image_id: number;
  trait_name: string;
  value: string;            // user's corrected value
  ai_predicted_value: string | null;
  ai_confidence: number | null;
  source: string;
  labeled_at: string;
  image_filename: string;
  plot_id: number;
}

export interface TrainingMetrics {
  trait_name: string;
  num_classes: number;
  total_samples: number;
  train_samples: number;
  val_samples: number;
  val_accuracy: number;
  best_val_accuracy: number;
  confusion_matrix: number[][];
  class_distribution: Record<string, number>;
  model_path: string;
  model_size_mb: number;
}
