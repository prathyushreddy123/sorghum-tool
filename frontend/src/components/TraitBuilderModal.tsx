import { useState, useEffect } from 'react';
import { api } from '../api/client';
import type { Trait, TraitCreate, TraitDataType } from '../types';

interface Props {
  open: boolean;
  onClose: () => void;
  onSaved: (trait: Trait) => void;
  editTrait?: Trait | null;
  cropHint?: string;
}

const DATA_TYPES: { value: TraitDataType; label: string; icon: string }[] = [
  { value: 'integer', label: 'Integer', icon: '#' },
  { value: 'float', label: 'Decimal', icon: '1.5' },
  { value: 'categorical', label: 'Category', icon: '☰' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'text', label: 'Text', icon: 'Aa' },
];

function slugify(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
}

export default function TraitBuilderModal({ open, onClose, onSaved, editTrait, cropHint }: Props) {
  const [label, setLabel] = useState('');
  const [name, setName] = useState('');
  const [nameEdited, setNameEdited] = useState(false);
  const [dataType, setDataType] = useState<TraitDataType>('integer');
  const [unit, setUnit] = useState('');
  const [minVal, setMinVal] = useState('');
  const [maxVal, setMaxVal] = useState('');
  const [description, setDescription] = useState('');
  const [categories, setCategories] = useState<{ value: string; label: string }[]>([
    { value: '1', label: '' },
  ]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  // Reset form when opening or switching edit target
  useEffect(() => {
    if (!open) return;
    if (editTrait) {
      setLabel(editTrait.label);
      setName(editTrait.name);
      setNameEdited(true);
      setDataType(editTrait.data_type);
      setUnit(editTrait.unit || '');
      setMinVal(editTrait.min_value != null ? String(editTrait.min_value) : '');
      setMaxVal(editTrait.max_value != null ? String(editTrait.max_value) : '');
      setDescription(editTrait.description || '');
      if (editTrait.categories) {
        const vals: string[] = JSON.parse(editTrait.categories);
        const labs: string[] = editTrait.category_labels ? JSON.parse(editTrait.category_labels) : [];
        setCategories(vals.map((v, i) => ({ value: v, label: labs[i] || '' })));
      } else {
        setCategories([{ value: '1', label: '' }]);
      }
    } else {
      setLabel('');
      setName('');
      setNameEdited(false);
      setDataType('integer');
      setUnit('');
      setMinVal('');
      setMaxVal('');
      setDescription('');
      setCategories([{ value: '1', label: '' }]);
    }
    setError('');
  }, [open, editTrait]);

  function handleLabelChange(val: string) {
    setLabel(val);
    if (!nameEdited) setName(slugify(val));
  }

  function addCategory() {
    const next = String(categories.length + 1);
    setCategories([...categories, { value: next, label: '' }]);
  }

  function removeCategory(idx: number) {
    setCategories(categories.filter((_, i) => i !== idx));
  }

  function updateCategory(idx: number, field: 'value' | 'label', val: string) {
    setCategories(categories.map((c, i) => (i === idx ? { ...c, [field]: val } : c)));
  }

  async function handleSubmit() {
    if (!label.trim() || !name.trim()) {
      setError('Label and name are required');
      return;
    }

    const data: TraitCreate = {
      name: name.trim(),
      label: label.trim(),
      data_type: dataType,
      description: description.trim() || undefined,
      crop_hint: cropHint || undefined,
    };

    if (dataType === 'integer' || dataType === 'float') {
      if (unit.trim()) data.unit = unit.trim();
      if (minVal) data.min_value = Number(minVal);
      if (maxVal) data.max_value = Number(maxVal);
    }

    if (dataType === 'categorical') {
      const validCats = categories.filter(c => c.value.trim());
      if (validCats.length < 2) {
        setError('Add at least 2 categories');
        return;
      }
      data.categories = JSON.stringify(validCats.map(c => c.value.trim()));
      data.category_labels = JSON.stringify(validCats.map(c => c.label.trim() || c.value.trim()));
    }

    setSaving(true);
    setError('');
    try {
      const saved = editTrait
        ? await api.updateTrait(editTrait.id, data)
        : await api.createTrait(data);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save trait');
    } finally {
      setSaving(false);
    }
  }

  if (!open) return null;

  const isNumeric = dataType === 'integer' || dataType === 'float';

  return (
    <div className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl p-5 w-full max-w-md max-h-[85vh] overflow-y-auto space-y-4">
        <h3 className="text-lg font-bold text-neutral">
          {editTrait ? 'Edit Trait' : 'Create Custom Trait'}
        </h3>

        {/* Label */}
        <div>
          <label className="block text-sm font-medium text-neutral mb-1">Trait Label *</label>
          <input
            type="text"
            value={label}
            onChange={e => handleLabelChange(e.target.value)}
            placeholder="e.g., Leaf Curl Severity"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
            autoFocus
          />
        </div>

        {/* Name (slug) */}
        <div>
          <label className="block text-sm font-medium text-neutral mb-1">
            Internal Name *
            <span className="text-xs text-gray-400 font-normal ml-1">(used in exports)</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={e => { setName(e.target.value); setNameEdited(true); }}
            placeholder="e.g., leaf_curl_severity"
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm font-mono"
          />
        </div>

        {/* Data Type */}
        <div>
          <label className="block text-sm font-medium text-neutral mb-2">Data Type *</label>
          <div className="grid grid-cols-5 gap-1.5">
            {DATA_TYPES.map(dt => (
              <button
                key={dt.value}
                type="button"
                onClick={() => setDataType(dt.value)}
                className={`flex flex-col items-center gap-0.5 p-2 rounded-lg border-2 transition-all text-center
                  ${dataType === dt.value
                    ? 'border-green-700 bg-green-50 text-green-800'
                    : 'border-gray-200 hover:border-green-300 text-gray-600'
                  }`}
              >
                <span className="text-base">{dt.icon}</span>
                <span className="text-[10px] font-medium leading-tight">{dt.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Numeric fields */}
        {isNumeric && (
          <div className="space-y-3">
            <div>
              <label className="block text-sm font-medium text-neutral mb-1">Unit</label>
              <input
                type="text"
                value={unit}
                onChange={e => setUnit(e.target.value)}
                placeholder="e.g., cm, kg, mm"
                className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium text-neutral mb-1">Min Value</label>
                <input
                  type="number"
                  value={minVal}
                  onChange={e => setMinVal(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-neutral mb-1">Max Value</label>
                <input
                  type="number"
                  value={maxVal}
                  onChange={e => setMaxVal(e.target.value)}
                  placeholder="Optional"
                  className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm"
                />
              </div>
            </div>
          </div>
        )}

        {/* Categorical fields */}
        {dataType === 'categorical' && (
          <div>
            <label className="block text-sm font-medium text-neutral mb-2">Categories *</label>
            <div className="space-y-2">
              {categories.map((cat, idx) => (
                <div key={idx} className="flex items-center gap-2">
                  <input
                    type="text"
                    value={cat.value}
                    onChange={e => updateCategory(idx, 'value', e.target.value)}
                    placeholder="Value"
                    className="w-20 px-2 py-2 border border-gray-300 rounded-lg text-sm text-center"
                  />
                  <span className="text-gray-400 text-xs">=</span>
                  <input
                    type="text"
                    value={cat.label}
                    onChange={e => updateCategory(idx, 'label', e.target.value)}
                    placeholder="Label (optional)"
                    className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-sm"
                  />
                  {categories.length > 1 && (
                    <button
                      type="button"
                      onClick={() => removeCategory(idx)}
                      className="text-gray-400 hover:text-red-500 text-lg px-1 min-w-[28px] min-h-[28px]"
                    >
                      x
                    </button>
                  )}
                </div>
              ))}
            </div>
            <button
              type="button"
              onClick={addCategory}
              className="mt-2 text-sm text-green-700 font-medium hover:underline"
            >
              + Add Category
            </button>
          </div>
        )}

        {/* Description */}
        <div>
          <label className="block text-sm font-medium text-neutral mb-1">Description</label>
          <textarea
            value={description}
            onChange={e => setDescription(e.target.value)}
            placeholder="Optional notes about this trait"
            rows={2}
            className="w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm resize-none"
          />
        </div>

        {error && <p className="text-red-600 text-sm">{error}</p>}

        {/* Buttons */}
        <div className="flex gap-3 pt-1">
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 rounded-lg font-semibold text-gray-600"
          >
            Cancel
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving || !label.trim() || !name.trim()}
            className="flex-1 py-2.5 bg-primary text-white rounded-lg font-semibold disabled:opacity-50"
          >
            {saving ? 'Saving...' : editTrait ? 'Update Trait' : 'Create Trait'}
          </button>
        </div>
      </div>
    </div>
  );
}
