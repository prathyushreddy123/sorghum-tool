import type {
  Trial,
  TrialCreate,
  TrialCloneRequest,
  TrialStats,
  TrialTrait,
  Trait,
  TraitCreate,
  ScoringRound,
  ScoringRoundCreate,
  Plot,
  PlotAttribute,
  PlotImage,
  APIKey,
  APIKeyCreateResponse,
  Observation,
  ObservationBulkCreate,
  PlotImportResponse,
  NextUnscoredResponse,
  HeatmapData,
  SeverityPrediction,
  HeightPrediction,
  AuthResponse,
  User,
  Team,
  TeamCreate,
  TrainingJob,
  TrainingSampleStats,
  ReferenceImage,
  ReviewQueueItem,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://127.0.0.1:8000';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

// Threshold (ms) above which API calls are flagged as slow in the console
const SLOW_API_THRESHOLD_MS = 500;

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const t0 = performance.now();
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  const duration = performance.now() - t0;

  if (duration > SLOW_API_THRESHOLD_MS) {
    console.warn(
      `[SLOW API] ${options?.method ?? 'GET'} ${url} — ${duration.toFixed(0)}ms`,
    );
  }

  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (res.status === 403) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    if (body.detail === 'Email verification required') {
      window.dispatchEvent(new Event('auth:verification-required'));
    }
    throw new Error(body.detail || `Access denied: ${res.status}`);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // ─── Auth ────────────────────────────────────────────────────────────────
  register: (email: string, password: string, name: string) =>
    request<AuthResponse>('/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, name }),
    }),

  login: (email: string, password: string) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    }),

  getMe: () => request<User>('/auth/me'),

  forgotPassword: (email: string) =>
    request<{ message: string }>('/auth/forgot-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    }),

  resetPassword: (token: string, password: string) =>
    request<{ message: string }>('/auth/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, password }),
    }),

  verifyEmail: (token: string) =>
    request<{ message: string; user: User }>(`/auth/verify-email?token=${encodeURIComponent(token)}`, {
      method: 'POST',
    }),

  resendVerification: () =>
    request<{ message: string }>('/auth/resend-verification', {
      method: 'POST',
    }),

  // ─── Teams ────────────────────────────────────────────────────────────────
  getTeams: () => request<Team[]>('/teams'),

  createTeam: (data: TeamCreate) =>
    request<Team>('/teams', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getTeam: (id: number) => request<Team>(`/teams/${id}`),

  joinTeam: (inviteCode: string) =>
    request<Team>('/teams/join', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ invite_code: inviteCode }),
    }),

  leaveTeam: (id: number) =>
    request<{ success: boolean }>(`/teams/${id}/leave`, { method: 'POST' }),

  removeTeamMember: (teamId: number, userId: number) =>
    request<{ success: boolean }>(`/teams/${teamId}/members/${userId}`, { method: 'DELETE' }),

  deleteTeam: (id: number) =>
    request<{ success: boolean }>(`/teams/${id}`, { method: 'DELETE' }),

  regenerateInviteCode: (id: number) =>
    request<Team>(`/teams/${id}/regenerate-code`, { method: 'POST' }),

  // ─── Trials ───────────────────────────────────────────────────────────────
  getTrials: (teamId?: number) => {
    const query = teamId ? `?team_id=${teamId}` : '';
    return request<Trial[]>(`/trials${query}`);
  },

  createTrial: (data: TrialCreate) =>
    request<Trial>('/trials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getTrial: (id: number) => request<Trial>(`/trials/${id}`),

  getPersonalTrials: () => request<Trial[]>('/trials/personal'),

  shareTrial: (trialId: number, teamId: number | null) =>
    request<Trial>(`/trials/${trialId}/share`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ team_id: teamId }),
    }),

  updateTrial: (id: number, data: { walk_mode?: string }) =>
    request<Trial>(`/trials/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteTrial: (id: number) =>
    request<{ success: boolean }>(`/trials/${id}`, { method: 'DELETE' }),

  cloneTrial: (id: number, data: TrialCloneRequest) =>
    request<Trial>(`/trials/${id}/clone`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // ─── Traits ───────────────────────────────────────────────────────────────
  getTraits: (cropHint?: string) => {
    const query = cropHint ? `?crop_hint=${encodeURIComponent(cropHint)}` : '';
    return request<Trait[]>(`/traits${query}`);
  },

  createTrait: (data: TraitCreate) =>
    request<Trait>('/traits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateTrait: (traitId: number, data: TraitCreate) =>
    request<Trait>(`/traits/${traitId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteTrait: (traitId: number) =>
    request<{ success: boolean }>(`/traits/${traitId}`, { method: 'DELETE' }),

  getTrialTraits: (trialId: number) =>
    request<TrialTrait[]>(`/trials/${trialId}/traits`),

  addTraitToTrial: (trialId: number, traitId: number, displayOrder = 0) =>
    request<TrialTrait>(`/trials/${trialId}/traits`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trait_id: traitId, display_order: displayOrder }),
    }),

  bulkAddTraitsToTrial: (trialId: number, traitIds: number[]) =>
    request<TrialTrait[]>(`/trials/${trialId}/traits/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trait_ids: traitIds }),
    }),

  removeTraitFromTrial: (trialId: number, traitId: number) =>
    request<{ success: boolean }>(`/trials/${trialId}/traits/${traitId}`, { method: 'DELETE' }),

  reorderTrialTraits: (trialId: number, orderedTraitIds: number[]) =>
    request<TrialTrait[]>(`/trials/${trialId}/traits/reorder`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ordered_trait_ids: orderedTraitIds }),
    }),

  // ─── Scoring Rounds ────────────────────────────────────────────────────────
  getScoringRounds: (trialId: number) =>
    request<ScoringRound[]>(`/trials/${trialId}/rounds`),

  createScoringRound: (trialId: number, data: ScoringRoundCreate) =>
    request<ScoringRound>(`/trials/${trialId}/rounds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  updateScoringRound: (trialId: number, roundId: number, data: Partial<ScoringRoundCreate>) =>
    request<ScoringRound>(`/trials/${trialId}/rounds/${roundId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  deleteScoringRound: (trialId: number, roundId: number) =>
    request<{ success: boolean }>(`/trials/${trialId}/rounds/${roundId}`, { method: 'DELETE' }),

  // ─── Plots ────────────────────────────────────────────────────────────────
  getPlots: (trialId: number, params?: { search?: string; scored?: string; round_id?: string; status?: string; walk_mode?: string }) => {
    const query = params ? `?${new URLSearchParams(params as Record<string, string>)}` : '';
    return request<Plot[]>(`/trials/${trialId}/plots${query}`);
  },

  importPlots: async (trialId: number, file: File): Promise<PlotImportResponse> => {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/trials/${trialId}/plots/import`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `Import failed: ${res.status}`);
    }
    return res.json();
  },

  deletePlot: (trialId: number, plotId: number) =>
    request<{ success: boolean }>(`/trials/${trialId}/plots/${plotId}`, { method: 'DELETE' }),

  updatePlotStatus: (trialId: number, plotId: number, plotStatus: string) =>
    request<Plot>(`/trials/${trialId}/plots/${plotId}/status`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ plot_status: plotStatus }),
    }),

  getNextUnscored: (trialId: number, plotId: number, roundId?: number) => {
    const query = roundId ? `?round_id=${roundId}` : '';
    return request<NextUnscoredResponse>(`/trials/${trialId}/plots/${plotId}/next-unscored${query}`);
  },

  // ─── Plot Attributes ──────────────────────────────────────────────────────
  getPlotAttributes: (plotId: number) =>
    request<PlotAttribute[]>(`/plots/${plotId}/attributes`),

  setPlotAttribute: (plotId: number, key: string, value: string) =>
    request<PlotAttribute>(`/plots/${plotId}/attributes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key, value }),
    }),

  deletePlotAttribute: (plotId: number, key: string) =>
    request<{ success: boolean }>(`/plots/${plotId}/attributes/${key}`, { method: 'DELETE' }),

  // ─── Observations ─────────────────────────────────────────────────────────
  getObservations: (plotId: number, roundId?: number) => {
    const query = roundId ? `?round_id=${roundId}` : '';
    return request<Observation[]>(`/plots/${plotId}/observations${query}`);
  },

  getTrialObservations: (trialId: number, roundId?: number) => {
    const query = roundId ? `?round_id=${roundId}` : '';
    return request<Observation[]>(`/trials/${trialId}/observations${query}`);
  },

  saveObservations: (plotId: number, data: ObservationBulkCreate) =>
    request<Observation[]>(`/plots/${plotId}/observations/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  // ─── Images ───────────────────────────────────────────────────────────────
  getImages: (plotId: number, imageType?: 'panicle' | 'full_plant') => {
    const query = imageType ? `?image_type=${imageType}` : '';
    return request<PlotImage[]>(`/plots/${plotId}/images${query}`);
  },

  uploadImage: async (plotId: number, file: File, imageType: 'panicle' | 'full_plant' = 'panicle'): Promise<PlotImage> => {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/plots/${plotId}/images?image_type=${imageType}`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  deleteImage: (imageId: number) =>
    request<{ success: boolean }>(`/images/${imageId}`, { method: 'DELETE' }),

  predictSeverity: (imageId: number) =>
    request<SeverityPrediction>(`/images/${imageId}/predict-severity`, { method: 'POST' }),

  predictHeight: (imageId: number) =>
    request<HeightPrediction>(`/images/${imageId}/predict-height`, { method: 'POST' }),

  getImageUrl: (filename: string) => `${API_BASE}/images/${filename}`,

  submitTrainingSample: (imageId: number, traitName: string, value: string, source: string, aiPredictedValue?: string, aiConfidence?: number) =>
    request<{ id: number }>('/training/samples', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        image_id: imageId,
        trait_name: traitName,
        value,
        source,
        ...(aiPredictedValue !== undefined && { ai_predicted_value: aiPredictedValue }),
        ...(aiConfidence !== undefined && { ai_confidence: aiConfidence }),
      }),
    }),

  getReviewQueue: (traitName?: string, limit = 50, offset = 0) => {
    const params = new URLSearchParams();
    if (traitName) params.set('trait_name', traitName);
    params.set('limit', String(limit));
    params.set('offset', String(offset));
    return request<ReviewQueueItem[]>(`/training/review-queue?${params}`);
  },

  // ─── Training Jobs ──────────────────────────────────────────────────────────
  getTrainingJobs: (traitName?: string) => {
    const query = traitName ? `?trait_name=${encodeURIComponent(traitName)}` : '';
    return request<TrainingJob[]>(`/training/jobs${query}`);
  },

  createTrainingJob: (traitName: string, config?: Record<string, unknown>) =>
    request<TrainingJob>('/training/jobs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ trait_name: traitName, config }),
    }),

  cancelTrainingJob: (jobId: number) =>
    request<TrainingJob>(`/training/jobs/${jobId}/cancel`, { method: 'POST' }),

  getTrainingSampleStats: (traitName?: string) => {
    const query = traitName ? `?trait_name=${encodeURIComponent(traitName)}` : '';
    return request<TrainingSampleStats>(`/training/samples/stats${query}`);
  },

  getReferenceImages: (traitName: string) =>
    request<ReferenceImage[]>(`/training/reference-images/${encodeURIComponent(traitName)}`),

  uploadReferenceImage: async (traitName: string, value: string, file: File): Promise<ReferenceImage> => {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/training/reference-images/${encodeURIComponent(traitName)}/${encodeURIComponent(value)}`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `Upload failed: ${res.status}`);
    }
    return res.json();
  },

  deleteReferenceImage: (traitName: string, filename: string) =>
    request<{ success: boolean }>(`/training/reference-images/${encodeURIComponent(traitName)}/${encodeURIComponent(filename)}`, { method: 'DELETE' }),

  // ─── API Keys ─────────────────────────────────────────────────────────────
  getAPIKeys: () => request<APIKey[]>('/auth/api-keys'),

  createAPIKey: (label: string) =>
    request<APIKeyCreateResponse>('/auth/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_label: label }),
    }),

  revokeAPIKey: (keyId: number) =>
    request<{ success: boolean }>(`/auth/api-keys/${keyId}`, { method: 'DELETE' }),

  // ─── Stats, Heatmap & Export ──────────────────────────────────────────────
  getStats: (trialId: number, roundId?: number) => {
    const query = roundId ? `?round_id=${roundId}` : '';
    return request<TrialStats>(`/trials/${trialId}/stats${query}`);
  },

  getHeatmap: (trialId: number, traitId?: number, roundId?: number) => {
    const params = new URLSearchParams();
    if (traitId) params.set('trait_id', String(traitId));
    if (roundId) params.set('round_id', String(roundId));
    const query = params.toString() ? `?${params}` : '';
    return request<HeatmapData>(`/trials/${trialId}/heatmap${query}`);
  },

  previewImport: async (trialId: number, file: File): Promise<{ columns: string[]; sample_rows: Record<string, string>[]; suggested_mapping: Record<string, string> }> => {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/trials/${trialId}/plots/import/preview`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `Preview failed: ${res.status}`);
    }
    return res.json();
  },

  importMapped: async (trialId: number, file: File, mapping: Record<string, string>): Promise<PlotImportResponse> => {
    const form = new FormData();
    form.append('file', file);
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const params = new URLSearchParams({
      mapping_plot_id: mapping.plot_id,
      mapping_genotype: mapping.genotype,
      mapping_rep: mapping.rep,
      mapping_row: mapping.row,
      mapping_column: mapping.column,
    });
    const res = await fetch(`${API_BASE}/trials/${trialId}/plots/import/mapped?${params}`, {
      method: 'POST',
      headers,
      body: form,
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || `Import failed: ${res.status}`);
    }
    return res.json();
  },

  saveGridObservations: (trialId: number, data: { scoring_round_id?: number; observations: { plot_id: number; trait_id: number; value: string }[] }) =>
    request<Observation[]>(`/trials/${trialId}/observations/bulk-grid`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  downloadTrialImages: async (trialId: number, roundId?: number): Promise<void> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const query = roundId ? `?round_id=${roundId}` : '';
    const res = await fetch(`${API_BASE}/trials/${trialId}/download-images${query}`, { headers });
    if (!res.ok) {
      const body = await res.json().catch(() => ({ detail: res.statusText }));
      throw new Error(body.detail || 'Download failed');
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.headers.get('content-disposition')?.match(/filename="(.+)"/)?.[1] || 'images.zip';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },

  exportCsv: async (trialId: number, roundId?: number): Promise<Blob> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const query = roundId ? `?round_id=${roundId}` : '';
    const res = await fetch(`${API_BASE}/trials/${trialId}/export${query}`, { headers });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },
};
