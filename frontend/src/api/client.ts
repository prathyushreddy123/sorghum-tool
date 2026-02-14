import type {
  Trial,
  TrialCreate,
  TrialStats,
  Plot,
  PlotImage,
  APIKey,
  APIKeyCreateResponse,
  Observation,
  ObservationBulkItem,
  PlotImportResponse,
  NextUnscoredResponse,
  HeatmapData,
  SeverityPrediction,
  HeightPrediction,
  AuthResponse,
  User,
} from '../types';

const API_BASE = import.meta.env.VITE_API_BASE || 'http://localhost:8000';

function getToken(): string | null {
  return localStorage.getItem('auth_token');
}

async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options?.headers as Record<string, string> || {}),
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  const res = await fetch(`${API_BASE}${url}`, { ...options, headers });
  if (res.status === 401) {
    localStorage.removeItem('auth_token');
    window.dispatchEvent(new Event('auth:logout'));
  }
  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(body.detail || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  // Auth
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

  // Trials
  getTrials: () => request<Trial[]>('/trials'),

  createTrial: (data: TrialCreate) =>
    request<Trial>('/trials', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),

  getTrial: (id: number) => request<Trial>(`/trials/${id}`),

  deleteTrial: (id: number) =>
    request<{ success: boolean }>(`/trials/${id}`, { method: 'DELETE' }),

  // Plots
  getPlots: (trialId: number, params?: { search?: string; scored?: string }) => {
    const query = params ? `?${new URLSearchParams(params)}` : '';
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

  getNextUnscored: (trialId: number, plotId: number) =>
    request<NextUnscoredResponse>(`/trials/${trialId}/plots/${plotId}/next-unscored`),

  // Observations
  getObservations: (plotId: number) =>
    request<Observation[]>(`/plots/${plotId}/observations`),

  saveObservations: (plotId: number, observations: ObservationBulkItem[]) =>
    request<Observation[]>(`/plots/${plotId}/observations/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observations }),
    }),

  // Images
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

  // API Keys
  getAPIKeys: () => request<APIKey[]>('/auth/api-keys'),

  createAPIKey: (label: string) =>
    request<APIKeyCreateResponse>('/auth/api-keys', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ user_label: label }),
    }),

  revokeAPIKey: (keyId: number) =>
    request<{ success: boolean }>(`/auth/api-keys/${keyId}`, { method: 'DELETE' }),

  // Stats, Heatmap & Export
  getStats: (trialId: number) => request<TrialStats>(`/trials/${trialId}/stats`),

  getHeatmap: (trialId: number) => request<HeatmapData>(`/trials/${trialId}/heatmap`),

  exportCsv: async (trialId: number): Promise<Blob> => {
    const headers: Record<string, string> = {};
    const token = getToken();
    if (token) headers['Authorization'] = `Bearer ${token}`;
    const res = await fetch(`${API_BASE}/trials/${trialId}/export`, { headers });
    if (!res.ok) throw new Error('Export failed');
    return res.blob();
  },
};
