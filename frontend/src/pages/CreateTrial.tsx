import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api/client';

export default function CreateTrial() {
  const navigate = useNavigate();
  const [name, setName] = useState('');
  const [location, setLocation] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const canSubmit = name.trim() && location.trim() && startDate;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setSaving(true);
    setError('');
    try {
      const trial = await api.createTrial({
        name: name.trim(),
        location: location.trim(),
        start_date: startDate,
        end_date: endDate || undefined,
      });
      navigate(`/trials/${trial.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create trial');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <h2 className="text-xl font-bold text-neutral mb-4">New Trial</h2>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-neutral mb-1">
            Trial Name *
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Perennial Ergot Trial 2026"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral mb-1">
            Location *
          </label>
          <input
            type="text"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="e.g., Tifton, GA"
            className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral mb-1">
            Start Date *
          </label>
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
            required
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-neutral mb-1">
            End Date (optional)
          </label>
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="w-full px-3 py-3 border border-gray-300 rounded-lg text-base"
          />
        </div>

        {error && <p className="text-error text-sm">{error}</p>}

        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="w-full py-3 bg-primary text-white rounded-lg font-semibold text-lg min-h-[48px] disabled:opacity-50"
        >
          {saving ? 'Creating...' : 'Create Trial'}
        </button>
      </form>
    </div>
  );
}
