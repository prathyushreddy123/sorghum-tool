import { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api } from '../api/client';
import * as offlineApi from '../db/offlineApi';
import type { Trial } from '../types';
import { useAuth } from '../contexts/AuthContext';
import { useTeam } from '../contexts/TeamContext';
import ConfirmDialog from '../components/ConfirmDialog';

const CROP_ICON: Record<string, string> = {
  sorghum: '\u{1F33E}',
  maize: '\u{1F33D}',
  corn: '\u{1F33D}',
  wheat: '\u{1F33E}',
  rice: '\u{1F33E}',
  soybean: '\u{1FAD8}',
  cotton: '\u2601\uFE0F',
  sunflower: '\u{1F33B}',
  barley: '\u{1F33E}',
};

function getCropIcon(crop: string): string {
  return CROP_ICON[crop.toLowerCase()] || '\u{1F331}';
}

function getGreeting(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function relativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days === 1) return 'Yesterday';
  if (days < 7) return `${days}d ago`;
  return formatDate(iso);
}

export default function TrialList() {
  const { user } = useAuth();
  const { activeTeam } = useTeam();
  const navigate = useNavigate();
  const [trials, setTrials] = useState<Trial[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    setLoading(true);
    offlineApi.getTrials(activeTeam?.id)
      .then((data) => {
        setTrials(data);
        setLoading(false);
        // After showing cached data instantly, wait for the background refresh
        // and update the list if the API returns newer counts/data.
        offlineApi.getTrials(activeTeam?.id)
          .then(setTrials)
          .catch(() => {});
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [activeTeam]);

  async function handleDelete() {
    if (deletingId === null) return;
    setDeleteLoading(true);
    try {
      // Try backend delete (may 404 if already deleted — that's fine)
      await api.deleteTrial(deletingId).catch(() => {});
      // Always purge from local cache
      await offlineApi.deleteTrial(deletingId);
      setTrials((prev) => prev.filter((t) => t.id !== deletingId));
      setDeletingId(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleteLoading(false);
    }
  }

  const stats = useMemo(() => {
    const totalPlots = trials.reduce((a, t) => a + t.plot_count, 0);
    const totalScored = trials.reduce((a, t) => a + t.scored_count, 0);
    const activeTrials = trials.filter(t => t.plot_count > 0 && t.scored_count < t.plot_count).length;
    return { totalPlots, totalScored, activeTrials, totalTrials: trials.length };
  }, [trials]);

  const resumeTrial = useMemo(() => {
    const isResumable = (t: Trial) => t.plot_count > 0 && t.scored_count < t.plot_count;
    const lastTrialId = localStorage.getItem('sorghum_last_trial_id');
    const lastTrial = lastTrialId ? trials.find(t => t.id === Number(lastTrialId)) : null;
    if (lastTrial && isResumable(lastTrial)) return lastTrial;
    return [...trials].reverse().find(isResumable) ?? null;
  }, [trials]);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const todayStr = new Date().toLocaleDateString(undefined, {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
  });

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <div className="w-10 h-10 border-4 border-primary border-t-transparent rounded-full animate-spin" />
        <p className="text-neutral text-sm">Loading your trials...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-20 px-6">
        <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-red-50 flex items-center justify-center">
          <svg className="w-8 h-8 text-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
          </svg>
        </div>
        <p className="text-error font-semibold mb-1">Failed to load trials</p>
        <p className="text-sm text-neutral mb-4">{error}</p>
        <p className="text-xs text-gray-400">Make sure the backend is running on port 8000.</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* ── Greeting section ─────────────────────────────────────────── */}
      <div className="px-5 sm:px-6 pt-2 pb-4">
        <p className="text-gray-400 text-sm">{todayStr}</p>
        <h1 className="text-2xl font-bold text-neutral mt-0.5">
          {getGreeting()}, {firstName}
        </h1>
      </div>

      {/* ── Stat cards ───────────────────────────────────────────────── */}
      {trials.length > 0 && (
        <div className="px-5 sm:px-6 pb-4">
          <div className="grid grid-cols-4 gap-2 sm:gap-3">
            {[
              { value: stats.totalTrials, label: 'Trials', color: 'bg-blue-50 text-blue-700' },
              { value: stats.totalPlots, label: 'Plots', color: 'bg-purple-50 text-purple-700' },
              { value: stats.totalScored, label: 'Scored', color: 'bg-green-50 text-primary' },
              { value: stats.activeTrials, label: 'Active', color: 'bg-amber-50 text-amber-700' },
            ].map(({ value, label, color }) => (
              <div key={label} className={`rounded-xl px-3 py-2.5 ${color}`}>
                <div className="text-xl sm:text-2xl font-bold">{value}</div>
                <div className="text-[11px] sm:text-xs font-medium opacity-70">{label}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="px-5 sm:px-6 pb-6">
        {/* ── Quick resume card ─────────────────────────────────────── */}
        {resumeTrial && (
          <div
            className="bg-primary/5 border border-primary/15 rounded-2xl p-4 mb-5 cursor-pointer hover:bg-primary/8 hover:border-primary/25 transition-all active:scale-[0.99]"
            onClick={() => navigate(`/trials/${resumeTrial.id}/collect`)}
          >
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-primary text-white flex items-center justify-center flex-shrink-0 shadow-sm">
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5.25 5.653c0-.856.917-1.398 1.667-.986l11.54 6.348a1.125 1.125 0 010 1.971l-11.54 6.347a1.125 1.125 0 01-1.667-.985V5.653z" />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] font-semibold text-primary uppercase tracking-wider">Continue collecting</div>
                <div className="font-semibold text-neutral truncate mt-0.5">{resumeTrial.name}</div>
              </div>
              <div className="text-right flex-shrink-0">
                <div className="text-sm font-bold text-primary">
                  {Math.round((resumeTrial.scored_count / resumeTrial.plot_count) * 100)}%
                </div>
                <div className="text-[11px] text-gray-400">
                  {resumeTrial.scored_count}/{resumeTrial.plot_count}
                </div>
              </div>
            </div>
            <div className="mt-3 h-1.5 bg-white rounded-full overflow-hidden">
              <div
                className="h-full bg-primary rounded-full transition-all duration-500"
                style={{ width: `${Math.max((resumeTrial.scored_count / resumeTrial.plot_count) * 100, 3)}%` }}
              />
            </div>
          </div>
        )}

        {/* ── Section header ───────────────────────────────────────── */}
        {trials.length > 0 && (
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider">
              {activeTeam ? `${activeTeam.name} Trials` : 'Your Trials'}
            </h2>
            <span className="text-xs text-gray-400">{trials.length} total</span>
          </div>
        )}

        {/* ── Empty state ──────────────────────────────────────────── */}
        {trials.length === 0 && (
          <div className="text-center py-16">
            <div className="mx-auto w-56 h-44 mb-8 relative">
              <svg viewBox="0 0 240 180" className="w-full h-full">
                <defs>
                  <linearGradient id="skyGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#DBEAFE" />
                    <stop offset="100%" stopColor="#EFF6FF" />
                  </linearGradient>
                </defs>
                <rect width="240" height="110" fill="url(#skyGrad)" rx="16" />
                <circle cx="190" cy="40" r="22" fill="#FEF3C7" />
                <circle cx="190" cy="40" r="15" fill="#FCD34D" />
                {/* Clouds */}
                <ellipse cx="60" cy="30" rx="20" ry="8" fill="white" opacity="0.7" />
                <ellipse cx="50" cy="28" rx="14" ry="7" fill="white" opacity="0.7" />
                <ellipse cx="120" cy="22" rx="16" ry="6" fill="white" opacity="0.5" />
                {/* Hills */}
                <ellipse cx="70" cy="110" rx="90" ry="28" fill="#BBF7D0" />
                <ellipse cx="180" cy="110" rx="80" ry="24" fill="#86EFAC" />
                {/* Field */}
                <rect x="10" y="118" width="220" height="62" fill="#D1FAE5" rx="8" />
                {[0, 1, 2, 3].map(i => (
                  <g key={i}>
                    <line x1="20" y1={128 + i * 14} x2="220" y2={128 + i * 14} stroke="#6EE7B7" strokeWidth="1" strokeDasharray="6 8" />
                    {[0, 1, 2, 3, 4, 5, 6, 7].map(j => (
                      <circle key={j} cx={30 + j * 27} cy={128 + i * 14} r="2.5" fill="#059669" opacity="0.5" />
                    ))}
                  </g>
                ))}
                {/* Clipboard */}
                <g transform="translate(92, 46)">
                  <rect width="56" height="64" rx="6" fill="white" stroke="#D1D5DB" strokeWidth="1.5" />
                  <rect x="14" y="-5" width="28" height="11" rx="5.5" fill="#6B7280" />
                  <line x1="10" y1="20" x2="46" y2="20" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
                  <line x1="10" y1="30" x2="38" y2="30" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
                  <line x1="10" y1="40" x2="42" y2="40" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
                  <line x1="10" y1="50" x2="34" y2="50" stroke="#E5E7EB" strokeWidth="2" strokeLinecap="round" />
                  <path d="M10 20 L14 24 L22 14" stroke="#10B981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                  <path d="M10 30 L14 34 L22 24" stroke="#10B981" strokeWidth="2.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
                </g>
              </svg>
            </div>
            <h2 className="text-xl font-bold text-neutral mb-2">Ready to start phenotyping?</h2>
            <p className="text-gray-500 text-sm mb-8 max-w-[300px] mx-auto leading-relaxed">
              Create your first field trial to begin collecting observations, scoring traits, and analyzing data.
            </p>
            <Link
              to="/trials/new"
              className="inline-flex items-center gap-2 px-7 py-3.5 bg-primary text-white rounded-2xl font-semibold text-base shadow-lg hover:bg-primary-dark transition-all hover:shadow-xl active:scale-[0.97]"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              Create First Trial
            </Link>
          </div>
        )}

        {/* ── Trial cards ──────────────────────────────────────────── */}
        {trials.length > 0 && (
          <div className="space-y-3">
            {trials.map((trial) => {
              const pct = trial.plot_count > 0 ? (trial.scored_count / trial.plot_count) * 100 : 0;
              const isComplete = pct >= 100;
              return (
                <div
                  key={trial.id}
                  className="bg-card rounded-2xl border border-gray-100 overflow-hidden hover:border-gray-200 transition-all group shadow-sm hover:shadow-md"
                >
                  <Link to={`/trials/${trial.id}`} className="block p-4">
                    <div className="flex items-start gap-3">
                      <div className="w-11 h-11 rounded-xl bg-gray-50 flex items-center justify-center text-xl flex-shrink-0 group-hover:scale-105 transition-transform">
                        {getCropIcon(trial.crop)}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-neutral truncate">{trial.name}</span>
                          {trial.id < 0 && (
                            <span className="flex-shrink-0 text-[10px] font-semibold px-1.5 py-0.5 rounded-full bg-amber-100 text-amber-700">
                              Pending sync
                            </span>
                          )}
                          {isComplete && trial.plot_count > 0 && (
                            <span className="flex-shrink-0 w-5 h-5 rounded-full bg-green-100 flex items-center justify-center">
                              <svg className="w-3 h-3 text-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-1.5 mt-1 text-xs text-gray-400">
                          <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M15 10.5a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 10.5c0 7.142-7.5 11.25-7.5 11.25S4.5 17.642 4.5 10.5a7.5 7.5 0 1115 0z" />
                          </svg>
                          <span className="truncate">{trial.location}</span>
                          <span className="text-gray-200">&middot;</span>
                          <span className="capitalize text-gray-500">{trial.crop}</span>
                          {trial.team_name && !activeTeam && (
                            <>
                              <span className="text-gray-200">&middot;</span>
                              <span className="text-primary font-medium">{trial.team_name}</span>
                            </>
                          )}
                          <span className="text-gray-200">&middot;</span>
                          <span>{relativeTime(trial.created_at)}</span>
                        </div>

                        {trial.plot_count > 0 ? (
                          <div className="mt-3 flex items-center gap-3">
                            <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full transition-all duration-700 ${
                                  isComplete ? 'bg-emerald-500' : pct > 0 ? 'bg-primary' : 'bg-gray-200'
                                }`}
                                style={{ width: `${Math.max(pct, pct > 0 ? 4 : 0)}%` }}
                              />
                            </div>
                            <span className={`text-xs font-semibold tabular-nums w-10 text-right ${
                              isComplete ? 'text-emerald-600' : 'text-gray-400'
                            }`}>
                              {Math.round(pct)}%
                            </span>
                          </div>
                        ) : (
                          <div className="mt-2.5">
                            <span className="inline-flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2.5 py-1 rounded-lg font-medium">
                              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                              </svg>
                              Import plots to start
                            </span>
                          </div>
                        )}
                      </div>

                      <button
                        onClick={(e) => { e.preventDefault(); e.stopPropagation(); setDeletingId(trial.id); }}
                        className="flex-shrink-0 p-2 text-gray-300 hover:text-error rounded-xl min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-red-50 transition-all opacity-0 group-hover:opacity-100"
                        aria-label={`Delete ${trial.name}`}
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M14.74 9l-.346 9m-4.788 0L9.26 9m9.968-3.21c.342.052.682.107 1.022.166m-1.022-.165L18.16 19.673a2.25 2.25 0 01-2.244 2.077H8.084a2.25 2.25 0 01-2.244-2.077L4.772 5.79m14.456 0a48.108 48.108 0 00-3.478-.397m-12 .562c.34-.059.68-.114 1.022-.165m0 0a48.11 48.11 0 013.478-.397m7.5 0v-.916c0-1.18-.91-2.164-2.09-2.201a51.964 51.964 0 00-3.32 0c-1.18.037-2.09 1.022-2.09 2.201v.916m7.5 0a48.667 48.667 0 00-7.5 0" />
                        </svg>
                      </button>
                    </div>
                  </Link>
                </div>
              );
            })}
          </div>
        )}

        {/* Spacer for FAB + tabs */}
        {trials.length > 0 && <div className="h-24" />}
      </div>

      {/* ── Floating action button ───────────────────────────────── */}
      {trials.length > 0 && (
        <Link
          to="/trials/new"
          className="fixed bottom-20 right-5 z-30 w-14 h-14 bg-primary text-white rounded-2xl shadow-lg shadow-primary/30 flex items-center justify-center hover:bg-primary-dark hover:shadow-xl hover:scale-105 transition-all active:scale-95"
          aria-label="Create new trial"
        >
          <svg className="w-7 h-7" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
          </svg>
        </Link>
      )}

      <ConfirmDialog
        open={deletingId !== null}
        title="Delete Trial"
        message="This will permanently delete this trial and all its plots and observations. This cannot be undone."
        onConfirm={handleDelete}
        onCancel={() => setDeletingId(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
