import { useEffect, useState, useCallback, useRef } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import type { TrainingJob, TrainingSampleStats, ReferenceImage, TrainingMetrics, ReviewQueueItem } from '../types';

interface ManifestModel {
  tier1: { url: string; version: string; accuracy: number | null; classes: string[]; class_labels?: string[] } | null;
  tier2_labels: Record<string, string> | null;
  tier3: string | null;
  photo_type?: string;
}

interface Manifest {
  models: Record<string, ManifestModel>;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    queued: 'bg-yellow-100 text-yellow-800',
    running: 'bg-blue-100 text-blue-800',
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    cancelled: 'bg-gray-100 text-gray-500',
  };
  return (
    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${colors[status] || 'bg-gray-100 text-gray-500'}`}>
      {status}
    </span>
  );
}

function TierBadge({ model }: { model: ManifestModel }) {
  if (model.tier1) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Trained</span>;
  }
  if (model.tier2_labels) {
    return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">CLIP Only</span>;
  }
  return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">No AI</span>;
}

function ConfusionMatrix({ matrix, classes }: { matrix: number[][]; classes: string[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse">
        <thead>
          <tr>
            <th className="p-1 border border-gray-200 bg-gray-50"></th>
            {classes.map(c => (
              <th key={c} className="p-1 border border-gray-200 bg-gray-50 text-center min-w-[32px]">P:{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {matrix.map((row, i) => (
            <tr key={i}>
              <td className="p-1 border border-gray-200 bg-gray-50 font-medium">T:{classes[i]}</td>
              {row.map((val, j) => (
                <td
                  key={j}
                  className={`p-1 border border-gray-200 text-center ${i === j ? 'bg-green-50 font-semibold' : ''}`}
                >
                  {val}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TraitCard({
  traitName,
  model,
  stats,
  refImages,
  onTrain,
  onUploadRef,
  onDeleteRef,
  trainingActive,
  isAdmin,
}: {
  traitName: string;
  model: ManifestModel;
  stats: TrainingSampleStats | null;
  refImages: ReferenceImage[];
  onTrain: () => void;
  onUploadRef: (value: string, file: File) => void;
  onDeleteRef: (filename: string) => void;
  trainingActive: boolean;
  isAdmin: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadValue, setUploadValue] = useState('1');

  const classes = model.tier1?.classes || Object.keys(model.tier2_labels || {});
  const traitStats = stats?.by_trait?.[traitName] || 0;

  return (
    <div className="bg-card rounded-lg border border-gray-100 shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-4 text-left"
      >
        <div className="flex items-center gap-3 min-w-0">
          <span className="text-sm font-semibold text-neutral">{traitName}</span>
          <TierBadge model={model} />
          {traitStats > 0 && (
            <span className="text-xs text-gray-400">{traitStats} samples</span>
          )}
        </div>
        <span className="text-gray-400 text-sm flex-shrink-0">{expanded ? '▲' : '▼'}</span>
      </button>

      {expanded && (
        <div className="px-4 pb-4 space-y-4 border-t border-gray-100 pt-3">
          {/* Training data stats */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Training Data by Class</h4>
            {classes.length > 0 ? (
              <div className="flex gap-2 flex-wrap">
                {classes.map(cls => (
                  <div key={cls} className="bg-gray-50 rounded px-2 py-1 text-xs">
                    <span className="font-medium">{cls}</span>
                    <span className="text-gray-400 ml-1">{stats?.by_value?.[cls] || 0}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No classes defined</p>
            )}
          </div>

          {/* Reference images */}
          <div>
            <h4 className="text-xs font-semibold text-gray-500 uppercase mb-2">Reference Images</h4>
            {refImages.length > 0 ? (
              <div className="grid grid-cols-4 gap-2">
                {refImages.map(img => (
                  <div key={img.filename} className="relative group">
                    <div className="aspect-square bg-gray-100 rounded overflow-hidden flex items-center justify-center">
                      <span className="text-xs text-gray-400 text-center px-1 break-all">{img.filename}</span>
                    </div>
                    <div className="absolute top-0 right-0">
                      <span className="bg-primary text-white text-[10px] px-1 rounded-bl">{img.value}</span>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => onDeleteRef(img.filename)}
                        className="absolute bottom-0 right-0 bg-red-500 text-white text-[10px] px-1 rounded-tl opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-gray-400">No reference images</p>
            )}

            {/* Upload reference image (admin only) */}
            {isAdmin && (
              <div className="flex items-center gap-2 mt-2">
                <select
                  value={uploadValue}
                  onChange={e => setUploadValue(e.target.value)}
                  className="text-xs border border-gray-200 rounded px-2 py-1"
                >
                  {classes.map(c => (
                    <option key={c} value={c}>Value: {c}</option>
                  ))}
                </select>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={e => {
                    const file = e.target.files?.[0];
                    if (file) {
                      onUploadRef(uploadValue, file);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
                >
                  Upload Image
                </button>
              </div>
            )}
          </div>

          {/* Train button (admin only) */}
          {isAdmin ? (
            <button
              onClick={onTrain}
              disabled={trainingActive}
              className="w-full py-2.5 bg-primary text-white rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-50 hover:bg-primary-dark transition-colors"
            >
              {trainingActive ? 'Training in Progress...' : 'Train Model'}
            </button>
          ) : (
            <p className="text-xs text-gray-400 text-center">Only admins can trigger training</p>
          )}
        </div>
      )}
    </div>
  );
}

export default function TrainingDashboard() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [jobs, setJobs] = useState<TrainingJob[]>([]);
  const [stats, setStats] = useState<TrainingSampleStats | null>(null);
  const [refImages, setRefImages] = useState<Record<string, ReferenceImage[]>>({});
  const [reviewQueue, setReviewQueue] = useState<ReviewQueueItem[]>([]);
  const [reviewFilter, setReviewFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedJob, setExpandedJob] = useState<number | null>(null);

  const loadData = useCallback(async () => {
    try {
      const promises: [Promise<TrainingJob[]>, Promise<TrainingSampleStats>] = [
        api.getTrainingJobs(),
        api.getTrainingSampleStats(),
      ];
      const [jobsData, statsData] = await Promise.all(promises);
      setJobs(jobsData);
      setStats(statsData);

      // Load review queue (admin only)
      if (isAdmin) {
        try {
          const queue = await api.getReviewQueue(reviewFilter || undefined);
          setReviewQueue(queue);
        } catch {
          // non-critical
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load data');
    }
  }, [isAdmin, reviewFilter]);

  // Load manifest
  useEffect(() => {
    fetch('/models/manifest.json')
      .then(r => r.json())
      .then(setManifest)
      .catch(() => setError('Failed to load model manifest'));
  }, []);

  // Load jobs + stats
  useEffect(() => {
    loadData().finally(() => setLoading(false));
  }, [loadData]);

  // Poll for active jobs
  useEffect(() => {
    const hasActive = jobs.some(j => j.status === 'queued' || j.status === 'running');
    if (!hasActive) return;
    const interval = setInterval(loadData, 5000);
    return () => clearInterval(interval);
  }, [jobs, loadData]);

  // Load reference images per trait
  useEffect(() => {
    if (!manifest) return;
    const traits = Object.keys(manifest.models);
    Promise.all(
      traits.map(t =>
        api.getReferenceImages(t).then(imgs => [t, imgs] as const).catch(() => [t, []] as const)
      )
    ).then(results => {
      const map: Record<string, ReferenceImage[]> = {};
      for (const [t, imgs] of results) map[t] = imgs;
      setRefImages(map);
    });
  }, [manifest]);

  async function handleTrain(traitName: string) {
    try {
      setError('');
      await api.createTrainingJob(traitName);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create training job');
    }
  }

  async function handleCancel(jobId: number) {
    try {
      await api.cancelTrainingJob(jobId);
      await loadData();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel job');
    }
  }

  async function handleUploadRef(traitName: string, value: string, file: File) {
    try {
      const img = await api.uploadReferenceImage(traitName, value, file);
      setRefImages(prev => ({
        ...prev,
        [traitName]: [...(prev[traitName] || []), img],
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to upload');
    }
  }

  async function handleDeleteRef(traitName: string, filename: string) {
    try {
      await api.deleteReferenceImage(traitName, filename);
      setRefImages(prev => ({
        ...prev,
        [traitName]: (prev[traitName] || []).filter(i => i.filename !== filename),
      }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete');
    }
  }

  const activeTraits = new Set(jobs.filter(j => j.status === 'queued' || j.status === 'running').map(j => j.trait_name));

  if (loading) {
    return <div className="p-4 text-gray-400">Loading...</div>;
  }

  return (
    <div className="pb-6">
      <h2 className="text-xl font-bold text-neutral mb-1">AI Model Training</h2>
      <p className="text-sm text-gray-400 mb-4">Manage training data and run model training jobs</p>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-error">
          {error}
          <button onClick={() => setError('')} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {/* Model Overview */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-neutral mb-3">Models</h3>
        {manifest ? (
          <div className="space-y-2">
            {Object.entries(manifest.models).map(([name, model]) => (
              <TraitCard
                key={name}
                traitName={name}
                model={model}
                stats={stats}
                refImages={refImages[name] || []}
                onTrain={() => handleTrain(name)}
                onUploadRef={(value, file) => handleUploadRef(name, value, file)}
                onDeleteRef={(filename) => handleDeleteRef(name, filename)}
                trainingActive={activeTraits.has(name)}
                isAdmin={isAdmin}
              />
            ))}
          </div>
        ) : (
          <p className="text-sm text-gray-400">No manifest found</p>
        )}
      </div>

      {/* Review Queue — images AI got wrong (admin only) */}
      {isAdmin && (
        <div className="mb-6">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-lg font-semibold text-neutral">
              Review Queue
              {reviewQueue.length > 0 && (
                <span className="ml-2 px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-700">
                  {reviewQueue.length}
                </span>
              )}
            </h3>
            {manifest && (
              <select
                value={reviewFilter}
                onChange={e => setReviewFilter(e.target.value)}
                className="text-xs border border-gray-200 rounded px-2 py-1"
              >
                <option value="">All traits</option>
                {Object.keys(manifest.models).map(t => (
                  <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>
                ))}
              </select>
            )}
          </div>
          <p className="text-xs text-gray-400 mb-3">
            Images where AI predicted incorrectly and you corrected the value. Review these to improve model accuracy.
          </p>
          {reviewQueue.length === 0 ? (
            <div className="bg-gray-50 rounded-lg p-4 text-center text-sm text-gray-400">
              No AI disagreements found. As you correct AI predictions, they'll appear here.
            </div>
          ) : (
            <div className="space-y-2">
              {reviewQueue.map(item => (
                <div key={item.id} className="bg-card rounded-lg border border-gray-100 shadow-sm p-3 flex items-center gap-3">
                  {/* Thumbnail */}
                  <div className="w-14 h-14 rounded overflow-hidden bg-gray-100 flex-shrink-0">
                    <img
                      src={api.getImageUrl(item.image_filename)}
                      alt={`Image ${item.image_id}`}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />
                  </div>
                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-medium text-gray-500">{item.trait_name.replace(/_/g, ' ')}</span>
                      <span className="text-[10px] text-gray-300">Plot #{item.plot_id}</span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="text-red-600 line-through font-medium">
                        AI: {item.ai_predicted_value ?? '?'}
                      </span>
                      <span className="text-gray-400">→</span>
                      <span className="text-green-700 font-semibold">
                        You: {item.value}
                      </span>
                      {item.ai_confidence != null && (
                        <span className="text-[10px] text-gray-400">
                          ({(item.ai_confidence * 100).toFixed(0)}% conf)
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-gray-400 mt-0.5">
                      {new Date(item.labeled_at).toLocaleDateString()}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Training History */}
      <div>
        <h3 className="text-lg font-semibold text-neutral mb-3">Training History</h3>
        {jobs.length === 0 ? (
          <p className="text-sm text-gray-400">No training jobs yet</p>
        ) : (
          <div className="space-y-2">
            {jobs.map(job => {
              const isExpanded = expandedJob === job.id;
              let metrics: TrainingMetrics | null = null;
              if (job.metrics) {
                try { metrics = JSON.parse(job.metrics); } catch { /* ignore */ }
              }

              return (
                <div key={job.id} className="bg-card rounded-lg border border-gray-100 shadow-sm">
                  <button
                    onClick={() => setExpandedJob(isExpanded ? null : job.id)}
                    className="w-full flex items-center justify-between p-3 text-left"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <StatusBadge status={job.status} />
                      <span className="text-sm font-medium text-neutral">{job.trait_name}</span>
                      <span className="text-xs text-gray-400">
                        {new Date(job.created_at).toLocaleDateString()}
                      </span>
                      {job.sample_count != null && (
                        <span className="text-xs text-gray-400">{job.sample_count} samples</span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {isAdmin && (job.status === 'queued' || job.status === 'running') && (
                        <button
                          onClick={e => { e.stopPropagation(); handleCancel(job.id); }}
                          className="text-xs text-error px-2 py-1 rounded hover:bg-red-50"
                        >
                          Cancel
                        </button>
                      )}
                      <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="px-3 pb-3 border-t border-gray-100 pt-2 space-y-2">
                      {job.started_at && (
                        <div className="text-xs text-gray-400">
                          Started: {new Date(job.started_at).toLocaleString()}
                        </div>
                      )}
                      {job.completed_at && (
                        <div className="text-xs text-gray-400">
                          Completed: {new Date(job.completed_at).toLocaleString()}
                        </div>
                      )}
                      {job.error_message && (
                        <div className="text-xs text-error bg-red-50 p-2 rounded max-h-32 overflow-y-auto">
                          <pre className="whitespace-pre-wrap">{job.error_message}</pre>
                        </div>
                      )}
                      {metrics && (
                        <div className="space-y-2">
                          <div className="flex gap-4 text-xs">
                            <div>
                              <span className="text-gray-400">Accuracy:</span>{' '}
                              <span className="font-medium">{(metrics.val_accuracy * 100).toFixed(1)}%</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Samples:</span>{' '}
                              <span className="font-medium">{metrics.total_samples}</span>
                            </div>
                            <div>
                              <span className="text-gray-400">Size:</span>{' '}
                              <span className="font-medium">{metrics.model_size_mb}MB</span>
                            </div>
                          </div>
                          {metrics.confusion_matrix && (
                            <div>
                              <div className="text-xs font-semibold text-gray-500 mb-1">Confusion Matrix</div>
                              <ConfusionMatrix
                                matrix={metrics.confusion_matrix}
                                classes={Array.from({ length: metrics.num_classes }, (_, i) => String(i + 1))}
                              />
                            </div>
                          )}
                        </div>
                      )}
                      {job.status === 'running' && (
                        <div className="flex items-center gap-2 text-xs text-blue-600">
                          <span className="animate-spin">⏳</span> Training in progress...
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
