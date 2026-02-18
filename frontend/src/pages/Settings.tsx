import { useEffect, useState } from 'react';
import { api } from '../api/client';
import { useAuth } from '../contexts/AuthContext';
import { useTheme } from '../hooks/useTheme';
import type { Theme } from '../hooks/useTheme';
import type { APIKey, Trait } from '../types';
import TraitBuilderModal from '../components/TraitBuilderModal';
import ConfirmDialog from '../components/ConfirmDialog';

const THEME_OPTIONS: { mode: Theme; label: string; desc: string; icon: string }[] = [
  { mode: 'light', label: 'Light', desc: 'Default light theme', icon: '☀️' },
  { mode: 'dark', label: 'Dark', desc: 'Low-light & indoor use', icon: '🌙' },
  { mode: 'sun', label: 'Sun / Field', desc: 'High contrast for bright sunlight', icon: '🔆' },
];

export default function Settings() {
  const { user, logout } = useAuth();
  const { theme, setTheme } = useTheme();
  const [keys, setKeys] = useState<APIKey[]>([]);
  const [label, setLabel] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);

  // Trait management
  const [traits, setTraits] = useState<Trait[]>([]);
  const [traitsLoading, setTraitsLoading] = useState(true);
  const [showTraitBuilder, setShowTraitBuilder] = useState(false);
  const [editingTrait, setEditingTrait] = useState<Trait | null>(null);
  const [deletingTrait, setDeletingTrait] = useState<Trait | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  useEffect(() => {
    api.getTraits()
      .then(setTraits)
      .catch(() => {})
      .finally(() => setTraitsLoading(false));
  }, []);

  async function handleDeleteTrait() {
    if (!deletingTrait) return;
    setDeleteLoading(true);
    try {
      await api.deleteTrait(deletingTrait.id);
      setTraits(prev => prev.filter(t => t.id !== deletingTrait.id));
      setDeletingTrait(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to delete trait');
    } finally {
      setDeleteLoading(false);
    }
  }

  useEffect(() => {
    api.getAPIKeys()
      .then(setKeys)
      .catch(() => setError('Failed to load API keys'))
      .finally(() => setLoading(false));
  }, []);

  async function handleCreate() {
    if (!label.trim()) return;
    setError('');
    try {
      const result = await api.createAPIKey(label.trim());
      setNewKey(result.raw_key);
      setLabel('');
      setKeys((prev) => [
        { id: result.id, user_label: result.user_label, created_at: result.created_at, last_used_at: result.last_used_at, is_active: result.is_active },
        ...prev,
      ]);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to create key');
    }
  }

  async function handleRevoke(keyId: number) {
    try {
      await api.revokeAPIKey(keyId);
      setKeys((prev) => prev.filter((k) => k.id !== keyId));
    } catch {
      setError('Failed to revoke key');
    }
  }

  function handleCopy() {
    if (newKey) {
      navigator.clipboard.writeText(newKey).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      });
    }
  }

  return (
    <div className="pb-6">
      <h2 className="text-xl font-bold text-neutral mb-4">Settings</h2>

      {/* Account section */}
      {user && (
        <div className="mb-6 bg-card rounded-lg p-4 shadow border border-gray-100">
          <h3 className="text-lg font-semibold text-neutral mb-2">Account</h3>
          <div className="text-sm text-neutral">{user.name}</div>
          <div className="text-xs text-gray-400 mb-3">{user.email}</div>
          <button
            onClick={logout}
            className="w-full py-3 text-error text-center rounded-lg font-medium text-sm min-h-[44px] border border-gray-200 hover:bg-red-50 transition-colors"
          >
            Sign Out
          </button>
        </div>
      )}

      {/* Theme selector */}
      <div className="mb-6 bg-card rounded-lg p-4 shadow border border-gray-100">
        <h3 className="text-lg font-semibold text-neutral mb-2">Appearance</h3>
        <p className="text-xs text-gray-400 mb-3">Choose a display mode for field conditions</p>
        <div className="grid grid-cols-3 gap-2">
          {THEME_OPTIONS.map(({ mode, label, desc, icon }) => (
            <button
              key={mode}
              onClick={() => setTheme(mode)}
              className={`p-3 rounded-xl border-2 text-center transition-all ${
                theme === mode
                  ? 'border-primary bg-green-50 dark:bg-green-900/20'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <div className="text-2xl mb-1">{icon}</div>
              <div className={`text-sm font-semibold ${theme === mode ? 'text-primary' : 'text-neutral'}`}>{label}</div>
              <div className="text-[10px] text-gray-400 leading-tight mt-0.5">{desc}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Trait Manager */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-lg font-semibold text-neutral">Custom Traits</h3>
          <button
            onClick={() => { setEditingTrait(null); setShowTraitBuilder(true); }}
            className="px-3 py-1.5 bg-primary text-white rounded-lg text-sm font-medium min-h-[36px] hover:bg-primary-dark transition-colors"
          >
            + New Trait
          </button>
        </div>
        <p className="text-sm text-gray-500 mb-3">
          Create and manage custom traits for your trials.
        </p>

        {traitsLoading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : (
          <>
            {traits.filter(t => !t.is_system).length === 0 ? (
              <p className="text-gray-400 text-sm">No custom traits yet. System traits are available by default.</p>
            ) : (
              <div className="space-y-2">
                {traits.filter(t => !t.is_system).map(trait => (
                  <div key={trait.id} className="flex items-center justify-between bg-card p-3 rounded-lg border border-gray-100">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-neutral">{trait.label}</span>
                        <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                          {trait.data_type}{trait.unit ? ` · ${trait.unit}` : ''}
                        </span>
                      </div>
                      {trait.description && (
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{trait.description}</p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 flex-shrink-0 ml-2">
                      <button
                        onClick={() => { setEditingTrait(trait); setShowTraitBuilder(true); }}
                        className="px-2 py-1 text-primary text-sm font-medium min-h-[32px] hover:bg-green-50 transition-colors rounded"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => setDeletingTrait(trait)}
                        className="px-2 py-1 text-error text-sm font-medium min-h-[32px] hover:bg-red-50 transition-colors rounded"
                      >
                        Delete
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="mb-6">
        <h3 className="text-lg font-semibold text-neutral mb-3">API Keys</h3>
        <p className="text-sm text-gray-500 mb-4">
          Generate API keys to access data from R, Python, or other tools.
        </p>

        {/* Create new key */}
        <div className="flex gap-2 mb-4">
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Key label (e.g., My R Script)"
            className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm"
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
          />
          <button
            onClick={handleCreate}
            disabled={!label.trim()}
            className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-medium min-h-[44px] disabled:opacity-50 hover:bg-primary-dark transition-colors"
          >
            Generate
          </button>
        </div>

        {/* Newly created key */}
        {newKey && (
          <div className="mb-4 p-3 bg-green-50 border border-primary-light rounded-lg">
            <p className="text-sm font-medium text-primary mb-1">
              New API key created. Copy it now — it won't be shown again.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-white px-2 py-1 rounded border border-gray-200 break-all">
                {newKey}
              </code>
              <button
                onClick={handleCopy}
                className="px-3 py-1 bg-primary text-white rounded text-xs font-medium min-h-[36px] hover:bg-primary-dark transition-colors"
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>
            </div>
          </div>
        )}

        {error && <p className="text-error text-sm mb-3">{error}</p>}

        {/* Key list */}
        {loading ? (
          <p className="text-gray-400 text-sm">Loading...</p>
        ) : keys.length === 0 ? (
          <p className="text-gray-400 text-sm">No active API keys.</p>
        ) : (
          <div className="space-y-2">
            {keys.map((k) => (
              <div
                key={k.id}
                className="flex items-center justify-between bg-card p-3 rounded-lg border border-gray-100"
              >
                <div>
                  <div className="text-sm font-medium text-neutral">{k.user_label}</div>
                  <div className="text-xs text-gray-400">
                    Created {new Date(k.created_at).toLocaleDateString()}
                    {k.last_used_at && ` · Last used ${new Date(k.last_used_at).toLocaleDateString()}`}
                  </div>
                </div>
                <button
                  onClick={() => handleRevoke(k.id)}
                  className="px-3 py-1 text-error text-sm font-medium min-h-[36px] hover:bg-red-50 transition-colors rounded"
                >
                  Revoke
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Usage examples */}
      <div>
        <h3 className="text-lg font-semibold text-neutral mb-3">Usage Examples</h3>

        <div className="mb-3">
          <p className="text-sm font-medium text-neutral mb-1">Python</p>
          <pre className="text-xs bg-gray-100 p-3 rounded-lg overflow-x-auto">
{`import requests

API_KEY = "sf_your_key_here"
BASE = "http://localhost:8000"

trials = requests.get(
    f"{BASE}/trials",
    headers={"X-API-Key": API_KEY}
).json()
print(trials)`}
          </pre>
        </div>

        <div>
          <p className="text-sm font-medium text-neutral mb-1">R</p>
          <pre className="text-xs bg-gray-100 p-3 rounded-lg overflow-x-auto">
{`library(httr2)

resp <- request("http://localhost:8000/trials") |>
  req_headers("X-API-Key" = "sf_your_key_here") |>
  req_perform()

trials <- resp_body_json(resp)
print(trials)`}
          </pre>
        </div>
      </div>

      <TraitBuilderModal
        open={showTraitBuilder}
        onClose={() => { setShowTraitBuilder(false); setEditingTrait(null); }}
        onSaved={(trait) => {
          setTraits(prev => {
            const idx = prev.findIndex(t => t.id === trait.id);
            if (idx >= 0) {
              const next = [...prev];
              next[idx] = trait;
              return next;
            }
            return [...prev, trait];
          });
        }}
        editTrait={editingTrait}
      />

      <ConfirmDialog
        open={!!deletingTrait}
        title="Delete Trait"
        message={`Delete "${deletingTrait?.label}"? This trait will be removed from all future trials. Existing observations using this trait will not be affected.`}
        onConfirm={handleDeleteTrait}
        onCancel={() => setDeletingTrait(null)}
        loading={deleteLoading}
      />
    </div>
  );
}
