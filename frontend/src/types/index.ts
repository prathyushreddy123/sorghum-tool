export interface User {
  id: number;
  email: string;
  name: string;
  created_at: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: User;
}

export interface Trial {
  id: number;
  name: string;
  crop: string;
  location: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  plot_count: number;
  scored_count: number;
}

export interface TrialCreate {
  name: string;
  crop?: string;
  location: string;
  start_date: string;
  end_date?: string;
}

export interface Plot {
  id: number;
  trial_id: number;
  plot_id: string;
  genotype: string;
  rep: number;
  row: number;
  column: number;
  notes: string | null;
  has_observations: boolean;
}

export interface Observation {
  id: number;
  plot_id: number;
  trait_name: 'ergot_severity' | 'flowering_date' | 'plant_height';
  value: string;
  recorded_at: string;
  notes: string | null;
  latitude: number | null;
  longitude: number | null;
  temperature: number | null;
  humidity: number | null;
}

export interface ObservationBulkItem {
  trait_name: 'ergot_severity' | 'flowering_date' | 'plant_height';
  value: string;
  notes?: string;
  latitude?: number;
  longitude?: number;
  temperature?: number;
  humidity?: number;
}

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

export interface PlotImage {
  id: number;
  plot_id: number;
  filename: string;
  original_name: string;
  image_type: 'panicle' | 'full_plant';
  uploaded_at: string;
}

export interface NumericStats {
  count: number;
  mean: number | null;
  sd: number | null;
  min: number | null;
  max: number | null;
}

export interface DateStats {
  count: number;
  earliest: string | null;
  latest: string | null;
}

export interface SeverityDistributionItem {
  score: number;
  count: number;
}

export interface TrialStats {
  total_plots: number;
  scored_plots: number;
  traits: {
    ergot_severity: NumericStats;
    plant_height: NumericStats;
    flowering_date: DateStats;
  };
  ergot_distribution: SeverityDistributionItem[];
}

export interface HeatmapCell {
  plot_id: string;
  plot_pk: number;
  row: number;
  column: number;
  genotype: string;
  ergot_severity: number | null;
}

export interface HeatmapData {
  rows: number;
  columns: number;
  cells: HeatmapCell[];
}

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
