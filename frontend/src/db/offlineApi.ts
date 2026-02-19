import { db } from './index';
import type { PendingSync } from './index';
import { api } from '../api/client';
import type {
  Trial, Plot, Trait, TraitCreate, TrialCreate, TrialTrait, ScoringRound,
  Observation, ObservationBulkCreate,
} from '../types';

function isOnline(): boolean {
  return navigator.onLine;
}

const CACHE_TTL = 1000 * 60 * 30; // 30 min

function isFresh(cachedAt: number): boolean {
  return Date.now() - cachedAt < CACHE_TTL;
}

// ─── Trials ──────────────────────────────────────────────────────────────────

async function _fetchAndCacheTrials(teamId?: number): Promise<Trial[]> {
  const trials = await api.getTrials(teamId);
  const now = Date.now();
  // Replace cache: clear old entries then put fresh data.
  // This ensures deleted/unowned trials don't persist in IndexedDB.
  await db.trials.clear();
  if (trials.length > 0) {
    await db.trials.bulkPut(trials.map(t => ({ ...t, _cachedAt: now })));
  }
  return trials;
}

export async function getTrials(teamId?: number): Promise<Trial[]> {
  // Read any cached trials first (fast, synchronous IndexedDB read)
  const cached = teamId
    ? await db.trials.where('team_id').equals(teamId).toArray()
    : await db.trials.toArray();

  if (!navigator.onLine) {
    if (cached.length > 0) return cached as unknown as Trial[];
    throw new Error('Offline — no cached trials');
  }

  // Stale-while-revalidate: if we have any cached data, return it instantly
  // and refresh from the API in the background so the UI is never blocked.
  if (cached.length > 0) {
    _fetchAndCacheTrials(teamId).catch(() => {});   // background refresh
    return cached as unknown as Trial[];
  }

  // No cache at all — must wait for the API (first-ever load)
  return _fetchAndCacheTrials(teamId);
}

export async function getTrial(id: number): Promise<Trial> {
  try {
    const trial = await api.getTrial(id);
    await db.trials.put({ ...trial, _cachedAt: Date.now() });
    return trial;
  } catch {
    const cached = await db.trials.get(id);
    if (cached) return cached as unknown as Trial;
    throw new Error('Offline — trial not cached');
  }
}

// ─── Plots ───────────────────────────────────────────────────────────────────

async function _fetchAndCachePlots(trialId: number, params?: Record<string, string>): Promise<Plot[]> {
  const plots = await api.getPlots(trialId, params);
  const now = Date.now();
  // Replace cached plots for this trial (removes stale entries from deleted trials)
  await db.plots.where('trial_id').equals(trialId).delete();
  if (plots.length > 0) {
    await db.plots.bulkPut(plots.map(p => ({ ...p, _cachedAt: now })));
  }
  return plots;
}

function _filterPlotsLocally(plots: Plot[], params: Record<string, string>): Plot[] {
  let result = plots;
  if (params.search) {
    const s = params.search.toLowerCase();
    result = result.filter(p =>
      p.plot_id.toLowerCase().includes(s) || p.genotype.toLowerCase().includes(s),
    );
  }
  if (params.scored === 'true') {
    result = result.filter(p => p.has_observations);
  } else if (params.scored === 'false') {
    result = result.filter(p => !p.has_observations);
  }
  if (params.status) {
    result = result.filter(p => p.plot_status === params.status);
  }
  return result;
}

export async function getPlots(
  trialId: number,
  params?: Record<string, string>,
): Promise<Plot[]> {
  const cached = await db.plots.where('trial_id').equals(trialId).toArray();

  if (!navigator.onLine) {
    if (cached.length > 0) {
      const plots = cached as unknown as Plot[];
      return params ? _filterPlotsLocally(plots, params) : plots;
    }
    throw new Error('Offline — no cached plots');
  }

  // Stale-while-revalidate: return cache instantly, refresh in background
  if (cached.length > 0) {
    _fetchAndCachePlots(trialId, params).catch(() => {});
    const plots = cached as unknown as Plot[];
    return params ? _filterPlotsLocally(plots, params) : plots;
  }

  // No cache — must wait for API (first load)
  return _fetchAndCachePlots(trialId, params);
}

// ─── Traits ──────────────────────────────────────────────────────────────────

export async function getTraits(cropHint?: string): Promise<Trait[]> {
  try {
    const traits = await api.getTraits(cropHint);
    const now = Date.now();
    await db.traits.bulkPut(traits.map(t => ({ ...t, _cachedAt: now })));
    return traits;
  } catch {
    const cached = await db.traits.toArray();
    if (cached.length > 0) {
      if (cropHint) {
        return cached.filter(t => t.crop_hint?.toLowerCase().includes(cropHint.toLowerCase())) as Trait[];
      }
      return cached as Trait[];
    }
    throw new Error('Offline — no cached traits');
  }
}

// ─── Trial Traits ────────────────────────────────────────────────────────────

export async function getTrialTraits(trialId: number): Promise<TrialTrait[]> {
  try {
    const tts = await api.getTrialTraits(trialId);
    const now = Date.now();
    await db.trialTraits.bulkPut(tts.map(tt => ({
      id: tt.id, trial_id: tt.trial_id, trait_id: tt.trait_id,
      display_order: tt.display_order, _cachedAt: now,
    })));
    for (const tt of tts) {
      await db.traits.put({ ...tt.trait, _cachedAt: now });
    }
    return tts;
  } catch {
    const cachedTTs = await db.trialTraits.where('trial_id').equals(trialId).toArray();
    if (cachedTTs.length === 0) throw new Error('Offline — no cached trial traits');

    const result: TrialTrait[] = [];
    for (const ct of cachedTTs) {
      const trait = await db.traits.get(ct.trait_id);
      if (trait) {
        result.push({
          id: ct.id,
          trial_id: ct.trial_id,
          trait_id: ct.trait_id,
          display_order: ct.display_order,
          trait: trait as Trait,
        });
      }
    }
    return result.sort((a, b) => a.display_order - b.display_order);
  }
}

// ─── Scoring Rounds ──────────────────────────────────────────────────────────

export async function getScoringRounds(trialId: number): Promise<ScoringRound[]> {
  try {
    const rounds = await api.getScoringRounds(trialId);
    const now = Date.now();
    await db.scoringRounds.bulkPut(rounds.map(r => ({ ...r, _cachedAt: now })));
    return rounds;
  } catch {
    const cached = await db.scoringRounds.where('trial_id').equals(trialId).toArray();
    if (cached.length > 0) return cached as ScoringRound[];
    throw new Error('Offline — no cached scoring rounds');
  }
}

// ─── Observations ────────────────────────────────────────────────────────────

export async function getObservations(plotId: number, roundId?: number): Promise<Observation[]> {
  try {
    const obs = await api.getObservations(plotId, roundId);
    const now = Date.now();
    await db.observations.bulkPut(obs.map(o => ({ ...o, _cachedAt: now })));
    return obs;
  } catch {
    let cached;
    if (roundId) {
      cached = await db.observations
        .where('[plot_id+scoring_round_id]')
        .equals([plotId, roundId])
        .toArray();
    } else {
      cached = await db.observations.where('plot_id').equals(plotId).toArray();
    }
    return cached as Observation[];
  }
}

export async function saveObservations(
  plotId: number,
  data: ObservationBulkCreate,
): Promise<Observation[]> {
  if (isOnline()) {
    try {
      const result = await api.saveObservations(plotId, data);
      const now = Date.now();
      await db.observations.bulkPut(result.map(o => ({ ...o, _cachedAt: now })));
      return result;
    } catch {
      // Network failed even though navigator.onLine — queue it
    }
  }

  // Offline: save locally and queue for sync
  const now = Date.now();
  const localObs: Observation[] = (data.observations || []).map((o, i) => ({
    id: -(now + i), // negative ID = local-only
    plot_id: plotId,
    trait_id: o.trait_id ?? null,
    scoring_round_id: data.scoring_round_id ?? null,
    trait_name: o.trait_name ?? '',
    value: o.value,
    recorded_at: new Date().toISOString(),
    notes: o.notes ?? null,
    latitude: o.latitude ?? null,
    longitude: o.longitude ?? null,
    temperature: o.temperature ?? null,
    humidity: o.humidity ?? null,
  }));

  await db.observations.bulkPut(localObs.map(o => ({ ...o, _cachedAt: now })));

  await db.pendingSync.add({
    action: { type: 'saveObservations', plotId, data },
    createdAt: now,
    retries: 0,
  });

  return localObs;
}

export async function updatePlotStatus(
  trialId: number,
  plotId: number,
  status: string,
): Promise<Plot> {
  if (isOnline()) {
    try {
      const result = await api.updatePlotStatus(trialId, plotId, status);
      await db.plots.update(plotId, { plot_status: status, _cachedAt: Date.now() });
      return result;
    } catch {
      // Fall through to offline queue
    }
  }

  await db.plots.update(plotId, { plot_status: status });
  await db.pendingSync.add({
    action: { type: 'updatePlotStatus', trialId, plotId, status },
    createdAt: Date.now(),
    retries: 0,
  });

  const cached = await db.plots.get(plotId);
  return cached as Plot;
}

// ─── Trait creation (offline-capable) ────────────────────────────────────────

export async function createTrait(data: TraitCreate): Promise<Trait> {
  if (isOnline()) {
    try {
      const trait = await api.createTrait(data);
      await db.traits.put({ ...trait, _cachedAt: Date.now() });
      return trait;
    } catch { /* fall through to offline queue */ }
  }

  const tempId = -(Date.now());
  const localTrait: Trait = {
    id: tempId,
    name: data.name,
    label: data.label,
    data_type: data.data_type,
    unit: data.unit ?? null,
    min_value: data.min_value ?? null,
    max_value: data.max_value ?? null,
    categories: data.categories ?? null,
    category_labels: data.category_labels ?? null,
    description: data.description ?? null,
    crop_hint: data.crop_hint ?? null,
    is_system: false,
  };

  await db.traits.put({ ...localTrait, _cachedAt: Date.now() });
  await db.pendingSync.add({
    action: { type: 'createTrait', data, tempId },
    createdAt: Date.now(),
    retries: 0,
  });

  return localTrait;
}

// ─── Trial creation (offline-capable) ────────────────────────────────────────

export async function createTrial(data: TrialCreate): Promise<Trial> {
  if (isOnline()) {
    try {
      const trial = await api.createTrial(data);
      await db.trials.put({ ...trial, _cachedAt: Date.now() });
      return trial;
    } catch { /* fall through to offline queue */ }
  }

  const now = Date.now();
  const tempId = -now;

  const localTrial: Trial = {
    id: tempId,
    name: data.name,
    crop: data.crop ?? 'custom',
    location: data.location,
    start_date: data.start_date,
    end_date: data.end_date ?? null,
    walk_mode: data.walk_mode ?? 'serpentine',
    created_at: new Date().toISOString(),
    plot_count: 0,
    scored_count: 0,
    team_id: data.team_id ?? null,
    team_name: null,
  };

  await db.trials.put({ ...localTrial, _cachedAt: now });

  // Local scoring round
  const localRound: ScoringRound = {
    id: -(now + 1),
    trial_id: tempId,
    name: data.first_round_name ?? 'Round 1',
    scored_at: null,
    notes: null,
    created_at: new Date().toISOString(),
    scored_plots: 0,
    total_plots: 0,
  };
  await db.scoringRounds.put({ ...localRound, _cachedAt: now });

  // Local trial-trait associations
  if (data.trait_ids?.length) {
    for (let i = 0; i < data.trait_ids.length; i++) {
      await db.trialTraits.put({
        id: -(now + i + 2),
        trial_id: tempId,
        trait_id: data.trait_ids[i],
        display_order: i,
        _cachedAt: now,
      });
    }
  }

  await db.pendingSync.add({
    action: { type: 'createTrial', data, tempId },
    createdAt: now,
    retries: 0,
  });

  return localTrial;
}

// ─── Trial deletion (cache cleanup) ──────────────────────────────────────────

export async function deleteTrial(trialId: number): Promise<void> {
  // Cascade-delete observations for all plots in this trial
  const plotKeys = await db.plots.where('trial_id').equals(trialId).primaryKeys();
  if (plotKeys.length > 0) {
    const obsKeys = await db.observations
      .where('plot_id').anyOf(plotKeys)
      .primaryKeys();
    await db.observations.bulkDelete(obsKeys);
  }

  // Delete plots, scoring rounds, trial traits, and the trial itself
  await db.plots.where('trial_id').equals(trialId).delete();
  await db.scoringRounds.where('trial_id').equals(trialId).delete();
  await db.trialTraits.where('trial_id').equals(trialId).delete();
  await db.trials.delete(trialId);
}

// ─── Sync engine ─────────────────────────────────────────────────────────────

export async function getPendingCount(): Promise<number> {
  return db.pendingSync.count();
}

export async function syncPending(): Promise<{ synced: number; failed: number }> {
  const pending = await db.pendingSync.orderBy('createdAt').toArray();
  let synced = 0;
  let failed = 0;

  for (const item of pending) {
    try {
      await replayAction(item);
      await db.pendingSync.delete(item.id!);
      synced++;
    } catch {
      failed++;
      await db.pendingSync.update(item.id!, { retries: item.retries + 1 });
    }
  }

  return { synced, failed };
}

async function replayAction(item: PendingSync): Promise<void> {
  const { action } = item;
  switch (action.type) {
    case 'saveObservations': {
      const result = await api.saveObservations(action.plotId, action.data as ObservationBulkCreate);
      const now = Date.now();
      await db.observations.bulkPut(result.map(o => ({ ...o, _cachedAt: now })));
      // Clean up local-only observations (negative IDs)
      const localIds = await db.observations
        .where('plot_id').equals(action.plotId)
        .filter(o => o.id < 0)
        .primaryKeys();
      await db.observations.bulkDelete(localIds);
      break;
    }
    case 'updatePlotStatus': {
      await api.updatePlotStatus(action.trialId, action.plotId, action.status);
      break;
    }
    case 'createTrait': {
      const realTrait = await api.createTrait(action.data as TraitCreate);
      await db.traits.put({ ...realTrait, _cachedAt: Date.now() });
      await db.traits.delete(action.tempId);

      // Patch any pending createTrial actions that reference this temp trait ID
      const pending = await db.pendingSync.toArray();
      for (const p of pending) {
        if (p.action.type === 'createTrial') {
          const trialData = p.action.data as TrialCreate;
          if (trialData.trait_ids?.includes(action.tempId)) {
            const updatedTraitIds = trialData.trait_ids.map(id =>
              id === action.tempId ? realTrait.id : id
            );
            await db.pendingSync.update(p.id!, {
              action: { ...p.action, data: { ...trialData, trait_ids: updatedTraitIds } },
            });
          }
        }
      }

      // Also update cached trialTrait entries that reference the temp trait ID
      const tempTTs = await db.trialTraits.where('trait_id').equals(action.tempId).toArray();
      for (const tt of tempTTs) {
        await db.trialTraits.update(tt.id, { trait_id: realTrait.id });
      }
      break;
    }
    case 'createTrial': {
      const realTrial = await api.createTrial(action.data as TrialCreate);
      const now = Date.now();
      await db.trials.put({ ...realTrial, _cachedAt: now });
      await db.trials.delete(action.tempId);

      // Clean up temp local cache entries
      const tempRoundKeys = await db.scoringRounds
        .where('trial_id').equals(action.tempId).primaryKeys();
      await db.scoringRounds.bulkDelete(tempRoundKeys);

      const tempTTKeys = await db.trialTraits
        .where('trial_id').equals(action.tempId).primaryKeys();
      await db.trialTraits.bulkDelete(tempTTKeys);

      // Populate cache with real data from server
      const [rounds, trialTraits] = await Promise.all([
        api.getScoringRounds(realTrial.id),
        api.getTrialTraits(realTrial.id),
      ]);
      await db.scoringRounds.bulkPut(rounds.map(r => ({ ...r, _cachedAt: now })));
      for (const tt of trialTraits) {
        await db.trialTraits.put({
          id: tt.id, trial_id: tt.trial_id, trait_id: tt.trait_id,
          display_order: tt.display_order, _cachedAt: now,
        });
        await db.traits.put({ ...tt.trait, _cachedAt: now });
      }
      break;
    }
  }
}

// ─── Pre-cache a trial for offline use ───────────────────────────────────────

export async function prefetchTrialForOffline(trialId: number): Promise<void> {
  const results = await Promise.allSettled([
    api.getTrial(trialId),
    api.getPlots(trialId),
    api.getTrialTraits(trialId),
    api.getScoringRounds(trialId),
  ]);

  const now = Date.now();

  // Cache whatever succeeded — partial failures are OK
  const trial = results[0].status === 'fulfilled' ? results[0].value : null;
  const plots = results[1].status === 'fulfilled' ? results[1].value : null;
  const traits = results[2].status === 'fulfilled' ? results[2].value : null;
  const rounds = results[3].status === 'fulfilled' ? results[3].value : null;

  if (trial) await db.trials.put({ ...trial, _cachedAt: now });
  if (plots) await db.plots.bulkPut(plots.map(p => ({ ...p, _cachedAt: now })));
  if (rounds) await db.scoringRounds.bulkPut(rounds.map(r => ({ ...r, _cachedAt: now })));

  if (traits) {
    for (const tt of traits) {
      await db.trialTraits.put({
        id: tt.id, trial_id: tt.trial_id, trait_id: tt.trait_id,
        display_order: tt.display_order, _cachedAt: now,
      });
      await db.traits.put({ ...tt.trait, _cachedAt: now });
    }
  }

  // Pre-fetch observations for all plots in the latest round
  if (plots && rounds && rounds.length > 0) {
    const latestRound = rounds[rounds.length - 1];
    await Promise.all(
      plots.map(async (p) => {
        try {
          const obs = await api.getObservations(p.id, latestRound.id);
          await db.observations.bulkPut(obs.map(o => ({ ...o, _cachedAt: now })));
        } catch { /* skip individual plot failures */ }
      })
    );
  }
}

// Cache freshness check
export async function isTrialCached(trialId: number): Promise<boolean> {
  const trial = await db.trials.get(trialId);
  if (!trial) return false;
  const plots = await db.plots.where('trial_id').equals(trialId).count();
  return plots > 0 && isFresh(trial._cachedAt);
}
