import { db } from './index';
import type { PendingSync } from './index';
import { api } from '../api/client';
import type {
  Trial, Plot, Trait, TrialTrait, ScoringRound,
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

export async function getTrials(): Promise<Trial[]> {
  try {
    const trials = await api.getTrials();
    const now = Date.now();
    await db.trials.bulkPut(trials.map(t => ({ ...t, _cachedAt: now })));
    return trials;
  } catch {
    const cached = await db.trials.toArray();
    if (cached.length > 0) return cached as unknown as Trial[];
    throw new Error('Offline — no cached trials');
  }
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

export async function getPlots(
  trialId: number,
  params?: Record<string, string>,
): Promise<Plot[]> {
  try {
    const plots = await api.getPlots(trialId, params);
    const now = Date.now();
    await db.plots.bulkPut(plots.map(p => ({ ...p, _cachedAt: now })));
    return plots;
  } catch {
    const cached = await db.plots.where('trial_id').equals(trialId).toArray();
    if (cached.length > 0) return cached as Plot[];
    throw new Error('Offline — no cached plots');
  }
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
  }
}

// ─── Pre-cache a trial for offline use ───────────────────────────────────────

export async function prefetchTrialForOffline(trialId: number): Promise<void> {
  const [trial, plots, traits, rounds] = await Promise.all([
    api.getTrial(trialId),
    api.getPlots(trialId),
    api.getTrialTraits(trialId),
    api.getScoringRounds(trialId),
  ]);

  const now = Date.now();
  await db.trials.put({ ...trial, _cachedAt: now });
  await db.plots.bulkPut(plots.map(p => ({ ...p, _cachedAt: now })));
  await db.scoringRounds.bulkPut(rounds.map(r => ({ ...r, _cachedAt: now })));

  for (const tt of traits) {
    await db.trialTraits.put({
      id: tt.id, trial_id: tt.trial_id, trait_id: tt.trait_id,
      display_order: tt.display_order, _cachedAt: now,
    });
    await db.traits.put({ ...tt.trait, _cachedAt: now });
  }

  // Pre-fetch observations for all plots in the latest round
  if (rounds.length > 0) {
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
