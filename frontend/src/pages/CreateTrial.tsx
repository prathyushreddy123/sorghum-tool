import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { createTrial as offlineCreateTrial, getTraits as offlineGetTraits } from '../db/offlineApi';
import type { Trait, WalkMode } from '../types';
import { useTeam } from '../contexts/TeamContext';
import TraitBuilderModal from '../components/TraitBuilderModal';

// Crop options with emoji icons
const CROP_GROUPS = [
  {
    label: 'Cereals & Row Crops',
    crops: [
      { value: 'sorghum', label: 'Sorghum', icon: '🌾' },
      { value: 'maize', label: 'Maize / Corn', icon: '🌽' },
      { value: 'wheat', label: 'Wheat', icon: '🌾' },
      { value: 'rice', label: 'Rice', icon: '🌾' },
      { value: 'cotton', label: 'Cotton', icon: '🌿' },
      { value: 'soybean', label: 'Soybean', icon: '🫘' },
      { value: 'sunflower', label: 'Sunflower', icon: '🌻' },
    ],
  },
  {
    label: 'Forages & Grasses',
    crops: [
      { value: 'alfalfa', label: 'Alfalfa', icon: '🌿' },
      { value: 'fescue', label: 'Fescue', icon: '🌿' },
      { value: 'orchardgrass', label: 'Orchardgrass', icon: '🌿' },
      { value: 'bermudagrass', label: 'Bermudagrass', icon: '🌿' },
      { value: 'switchgrass', label: 'Switchgrass', icon: '🌿' },
    ],
  },
  {
    label: 'Fruits & Berries',
    crops: [
      { value: 'grape', label: 'Grape', icon: '🍇' },
      { value: 'blueberry', label: 'Blueberry', icon: '🫐' },
      { value: 'strawberry', label: 'Strawberry', icon: '🍓' },
      { value: 'raspberry', label: 'Raspberry', icon: '🫐' },
    ],
  },
  {
    label: 'Tree Fruits',
    crops: [
      { value: 'apple', label: 'Apple', icon: '🍎' },
      { value: 'peach', label: 'Peach', icon: '🍑' },
      { value: 'cherry', label: 'Cherry', icon: '🍒' },
      { value: 'pear', label: 'Pear', icon: '🍐' },
      { value: 'citrus', label: 'Citrus', icon: '🍊' },
    ],
  },
];


type Step = 'basics' | 'crop' | 'traits' | 'round';

export default function CreateTrial() {
  const navigate = useNavigate();
  const { activeTeam } = useTeam();
  const [step, setStep] = useState<Step>('basics');

  // Step 1: basics
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // Step 2: crop
  const [crop, setCrop] = useState('sorghum');
  const [customCrop, setCustomCrop] = useState('');
  const [cropSearch, setCropSearch] = useState('');

  // Step 3: traits
  const [allTraits, setAllTraits] = useState<Trait[]>([]);
  const [selectedTraitIds, setSelectedTraitIds] = useState<number[]>([]);
  const [traitsLoading, setTraitsLoading] = useState(false);
  const [traitSearch, setTraitSearch] = useState('');

  // Step 4: round & walk mode
  const [firstRoundName, setFirstRoundName] = useState('Round 1');
  const [walkMode, setWalkMode] = useState<WalkMode>('serpentine');

  // Trait builder modal
  const [showTraitBuilder, setShowTraitBuilder] = useState(false);

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const effectiveCrop = crop === 'custom' ? customCrop.trim() : crop;

  // Load all traits when moving to trait step; auto-select crop-matched ones
  useEffect(() => {
    if (step !== 'traits') return;
    setTraitsLoading(true);
    setTraitSearch('');
    setError('');
    offlineGetTraits()
      .then(traits => {
        setAllTraits(traits);
        const preSelected = traits
          .filter(t => effectiveCrop && t.crop_hint?.toLowerCase().includes(effectiveCrop.toLowerCase()))
          .map(t => t.id);
        setSelectedTraitIds(preSelected);
      })
      .catch(() => setError('Failed to load traits. Check your connection.'))
      .finally(() => setTraitsLoading(false));
  }, [step, effectiveCrop]);

  function toggleTrait(id: number) {
    setSelectedTraitIds(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  }

  async function handleCreate() {
    setSaving(true);
    setError('');
    try {
      const trial = await offlineCreateTrial({
        name: name.trim(),
        crop: effectiveCrop || 'custom',
        location: location.trim(),
        start_date: startDate,
        end_date: endDate || undefined,
        walk_mode: walkMode,
        trait_ids: selectedTraitIds,
        first_round_name: firstRoundName.trim() || 'Round 1',
        team_id: activeTeam?.id,
      });
      if (trial.id < 0) {
        // Created offline — go to trial list; badge will show "Pending sync"
        navigate('/');
      } else {
        navigate(`/trials/${trial.id}`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trial');
    } finally {
      setSaving(false);
    }
  }

  const steps: Step[] = ['basics', 'crop', 'traits', 'round'];
  const stepIdx = steps.indexOf(step);

  function StepIndicator() {
    const labels = ['Basics', 'Crop', 'Traits', 'Round'];
    return (
      <div className="flex items-center gap-1 mb-6">
        {labels.map((label, i) => (
          <div key={label} className="flex items-center gap-1 flex-1">
            <div className={`flex items-center gap-1 ${i <= stepIdx ? 'text-green-700' : 'text-gray-400'}`}>
              <div className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold
                ${i < stepIdx ? 'bg-green-700 text-white' : i === stepIdx ? 'bg-green-100 text-green-700 border-2 border-green-700' : 'bg-gray-100 text-gray-400'}`}>
                {i < stepIdx ? '✓' : i + 1}
              </div>
              <span className="text-xs font-medium hidden sm:block">{label}</span>
            </div>
            {i < labels.length - 1 && (
              <div className={`flex-1 h-0.5 mx-1 ${i < stepIdx ? 'bg-green-700' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto">
      <h2 className="text-xl font-bold text-neutral mb-2">New Trial</h2>
      {activeTeam && (
        <div className="flex items-center gap-2 mb-3 px-3 py-2 bg-primary/5 border border-primary/15 rounded-xl text-sm">
          <svg className="w-4 h-4 text-primary flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 003.741-.479 3 3 0 00-4.682-2.72m.94 3.198l.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0112 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 016 18.719m12 0a5.971 5.971 0 00-.941-3.197m0 0A5.995 5.995 0 0012 12.75a5.995 5.995 0 00-5.058 2.772m0 0a3 3 0 00-4.681 2.72 8.986 8.986 0 003.74.477m.94-3.197a5.971 5.971 0 00-.94 3.197M15 6.75a3 3 0 11-6 0 3 3 0 016 0zm6 3a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0zm-13.5 0a2.25 2.25 0 11-4.5 0 2.25 2.25 0 014.5 0z" />
          </svg>
          <span className="text-primary font-medium">Creating for team: {activeTeam.name}</span>
        </div>
      )}
      <StepIndicator />

      {/* ── Step 1: Basics ── */}
      {step === 'basics' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-neutral mb-1">Trial Name *</label>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g., Sorghum Ergot Trial 2026"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
              autoFocus
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral mb-1">Location *</label>
            <input
              type="text"
              value={location}
              onChange={e => setLocation(e.target.value)}
              placeholder="e.g., Tifton, GA"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral mb-1">Start Date *</label>
            <input
              type="date"
              value={startDate}
              onChange={e => setStartDate(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-neutral mb-1">End Date (optional)</label>
            <input
              type="date"
              value={endDate}
              onChange={e => setEndDate(e.target.value)}
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
            />
          </div>
          <button
            onClick={() => setStep('crop')}
            disabled={!name.trim() || !location.trim() || !startDate}
            className="w-full py-3 bg-primary text-white rounded-lg font-semibold text-lg disabled:opacity-50"
          >
            Next: Select Crop →
          </button>
        </div>
      )}

      {/* ── Step 2: Crop ── */}
      {step === 'crop' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Select your crop to load suggested traits.</p>
          <input
            type="text"
            value={cropSearch}
            onChange={e => setCropSearch(e.target.value)}
            placeholder="Search crops..."
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
          />
          <div className="max-h-80 overflow-y-auto space-y-4 pr-1">
            {CROP_GROUPS.map(group => {
              const filtered = group.crops.filter(c =>
                c.label.toLowerCase().includes(cropSearch.toLowerCase())
              );
              if (filtered.length === 0) return null;
              return (
                <div key={group.label}>
                  <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">{group.label}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {filtered.map(c => (
                      <button
                        key={c.value}
                        type="button"
                        onClick={() => setCrop(c.value)}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all
                          ${crop === c.value
                            ? 'border-green-700 bg-green-50 text-green-800 font-semibold'
                            : 'border-gray-200 hover:border-green-300 text-gray-700'
                          }`}
                      >
                        <span className="text-xl">{c.icon}</span>
                        <span className="text-sm">{c.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              );
            })}
            {(!cropSearch || 'custom crop'.includes(cropSearch.toLowerCase())) && (
              <div>
                <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-1.5">Other</p>
                <button
                  type="button"
                  onClick={() => setCrop('custom')}
                  className={`flex items-center gap-2 p-3 rounded-xl border-2 text-left transition-all w-full
                    ${crop === 'custom'
                      ? 'border-green-700 bg-green-50 text-green-800 font-semibold'
                      : 'border-gray-200 hover:border-green-300 text-gray-700'
                    }`}
                >
                  <span className="text-xl">🔬</span>
                  <span className="text-sm">Custom Crop</span>
                </button>
              </div>
            )}
          </div>
          {crop === 'custom' && (
            <input
              type="text"
              value={customCrop}
              onChange={e => setCustomCrop(e.target.value)}
              placeholder="Enter crop name (e.g., Coffee, Cassava)"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
              autoFocus
            />
          )}
          <div className="flex gap-3">
            <button onClick={() => setStep('basics')} className="flex-1 py-3 border border-gray-300 rounded-lg font-semibold text-gray-600">
              ← Back
            </button>
            <button
              onClick={() => setStep('traits')}
              disabled={crop === 'custom' && !customCrop.trim()}
              className="flex-1 py-3 bg-primary text-white rounded-lg font-semibold disabled:opacity-50"
            >
              Next: Traits →
            </button>
          </div>
        </div>
      )}

      {/* ── Step 3: Traits ── */}
      {step === 'traits' && (() => {
        const lowerSearch = traitSearch.toLowerCase();
        const filtered = traitSearch
          ? allTraits.filter(t =>
              t.label.toLowerCase().includes(lowerSearch) ||
              t.name.toLowerCase().includes(lowerSearch) ||
              t.description?.toLowerCase().includes(lowerSearch) ||
              t.data_type.toLowerCase().includes(lowerSearch)
            )
          : allTraits;

        const cropMatched = filtered.filter(t =>
          effectiveCrop && t.crop_hint?.toLowerCase().includes(effectiveCrop.toLowerCase())
        );
        const otherTraits = filtered.filter(t =>
          !effectiveCrop || !t.crop_hint?.toLowerCase().includes(effectiveCrop.toLowerCase())
        );

        function TraitCard({ trait }: { trait: Trait }) {
          const selected = selectedTraitIds.includes(trait.id);
          return (
            <button
              key={trait.id}
              type="button"
              onClick={() => toggleTrait(trait.id)}
              className={`w-full flex items-start gap-3 p-3 rounded-xl border-2 text-left transition-all
                ${selected ? 'border-green-700 bg-green-50' : 'border-gray-200 hover:border-green-300'}`}
            >
              <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center flex-shrink-0
                ${selected ? 'border-green-700 bg-green-700' : 'border-gray-300'}`}>
                {selected && <span className="text-white text-xs">✓</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-semibold text-sm text-gray-800">{trait.label}</span>
                  <span className="text-xs text-gray-400 bg-gray-100 px-1.5 py-0.5 rounded">
                    {trait.data_type}{trait.unit ? ` · ${trait.unit}` : ''}
                  </span>
                </div>
                {trait.description && (
                  <p className="text-xs text-gray-500 mt-0.5 leading-tight">{trait.description}</p>
                )}
              </div>
            </button>
          );
        }

        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm text-gray-500">Select traits for this trial.</p>
              <span className="text-xs text-green-700 font-semibold">{selectedTraitIds.length} selected</span>
            </div>

            <input
              type="text"
              value={traitSearch}
              onChange={e => setTraitSearch(e.target.value)}
              placeholder="Search traits..."
              className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            />

            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setSelectedTraitIds(filtered.map(t => t.id))}
                className="text-xs text-green-700 font-semibold hover:underline"
              >
                Select all
              </button>
              <span className="text-gray-300">|</span>
              <button
                type="button"
                onClick={() => setSelectedTraitIds([])}
                className="text-xs text-gray-500 font-semibold hover:underline"
              >
                Clear
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowTraitBuilder(true)}
              className="w-full py-2.5 border-2 border-dashed border-green-300 rounded-xl text-sm font-semibold text-green-700 hover:bg-green-50 transition-colors"
            >
              + Create Custom Trait
            </button>

            {traitsLoading && <p className="text-center text-gray-400 py-4">Loading traits...</p>}

            {!traitsLoading && error && (
              <p className="text-center text-red-500 text-sm py-4">{error}</p>
            )}

            {!traitsLoading && !error && filtered.length === 0 && (
              <p className="text-center text-gray-400 py-4">
                {traitSearch ? 'No traits match your search.' : 'No traits available.'}
              </p>
            )}

            {!traitsLoading && (
              <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
                {cropMatched.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
                      Suggested for {effectiveCrop}
                    </p>
                    {cropMatched.map(trait => <TraitCard key={trait.id} trait={trait} />)}
                  </>
                )}
                {otherTraits.length > 0 && (
                  <>
                    <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide mt-3">
                      {cropMatched.length > 0 ? 'Other traits' : 'All traits'}
                    </p>
                    {otherTraits.map(trait => <TraitCard key={trait.id} trait={trait} />)}
                  </>
                )}
              </div>
            )}

            <div className="flex gap-3 pt-2">
              <button onClick={() => setStep('crop')} className="flex-1 py-3 border border-gray-300 rounded-lg font-semibold text-gray-600">
                ← Back
              </button>
              <button
                onClick={() => setStep('round')}
                disabled={selectedTraitIds.length === 0}
                className="flex-1 py-3 bg-primary text-white rounded-lg font-semibold disabled:opacity-50"
              >
                Next: Round →
              </button>
            </div>
          </div>
        );
      })()}

      {/* ── Step 4: First Scoring Round ── */}
      {step === 'round' && (
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Name your first scoring session.</p>
          <div>
            <label className="block text-sm font-medium text-neutral mb-1">Scoring Round Name *</label>
            <input
              type="text"
              value={firstRoundName}
              onChange={e => setFirstRoundName(e.target.value)}
              placeholder="e.g., Round 1, Heading Stage, Post-harvest"
              className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
              autoFocus
            />
            <p className="text-xs text-gray-400 mt-1">You can add more rounds later from the trial dashboard.</p>
          </div>

          {/* Walk mode selector */}
          <div>
            <label className="block text-sm font-medium text-neutral mb-2">Field Walk Pattern</label>
            <p className="text-xs text-gray-400 mb-3">How should plots be ordered during data collection?</p>
            <div className="grid grid-cols-2 gap-2">
              {([
                { mode: 'serpentine' as WalkMode, label: 'Serpentine', desc: 'Zigzag through rows', arrows: '→→→↓\n↓←←←\n→→→' },
                { mode: 'row_by_row' as WalkMode, label: 'Row-by-Row', desc: 'Left to right, top to bottom', arrows: '→→→\n→→→\n→→→' },
                { mode: 'column_by_column' as WalkMode, label: 'Column-by-Column', desc: 'Top to bottom, left to right', arrows: '↓ ↓ ↓\n↓ ↓ ↓\n↓ ↓ ↓' },
                { mode: 'free' as WalkMode, label: 'Free', desc: 'No enforced order', arrows: '· · ·\n· · ·\n· · ·' },
              ]).map(({ mode, label, desc, arrows }) => (
                <button
                  key={mode}
                  onClick={() => setWalkMode(mode)}
                  className={`p-3 rounded-xl border-2 text-left transition-all ${
                    walkMode === mode
                      ? 'border-green-600 bg-green-50'
                      : 'border-gray-200 bg-white hover:border-gray-300'
                  }`}
                >
                  <pre className="text-xs leading-tight mb-1.5 text-gray-500 font-mono">{arrows}</pre>
                  <div className={`text-sm font-semibold ${walkMode === mode ? 'text-green-700' : 'text-neutral'}`}>{label}</div>
                  <div className="text-xs text-gray-400">{desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Summary */}
          <div className="bg-gray-50 rounded-xl p-4 space-y-1 text-sm">
            <div className="flex justify-between"><span className="text-gray-500">Trial</span><span className="font-semibold">{name}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Crop</span><span className="font-semibold capitalize">{effectiveCrop}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Location</span><span className="font-semibold">{location}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Walk</span><span className="font-semibold capitalize">{walkMode.replace(/_/g, ' ')}</span></div>
            <div className="flex justify-between"><span className="text-gray-500">Traits</span><span className="font-semibold">{selectedTraitIds.length} selected</span></div>
          </div>

          {error && <p className="text-red-600 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button onClick={() => setStep('traits')} className="flex-1 py-3 border border-gray-300 rounded-lg font-semibold text-gray-600">
              ← Back
            </button>
            <button
              onClick={handleCreate}
              disabled={saving || !firstRoundName.trim()}
              className="flex-1 py-3 bg-primary text-white rounded-lg font-semibold text-lg disabled:opacity-50"
            >
              {saving ? 'Creating...' : 'Create Trial'}
            </button>
          </div>
        </div>
      )}
      <TraitBuilderModal
        open={showTraitBuilder}
        onClose={() => setShowTraitBuilder(false)}
        onSaved={(trait) => {
          setAllTraits(prev => [...prev, trait]);
          setSelectedTraitIds(prev => [...prev, trait.id]);
        }}
        cropHint={effectiveCrop}
      />
    </div>
  );
}
