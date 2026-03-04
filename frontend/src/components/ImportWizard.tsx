import { useState, useRef } from 'react';
import { api } from '../api/client';

interface ImportWizardProps {
  trialId: number;
  onComplete: (message: string) => void;
  onClose: () => void;
}

type Step = 'pick' | 'preview' | 'map' | 'result';

const REQUIRED_FIELDS = ['plot_id', 'genotype', 'rep', 'row', 'column'] as const;
const FIELD_LABELS: Record<string, string> = {
  plot_id: 'Plot ID',
  genotype: 'Genotype',
  rep: 'Rep',
  row: 'Row',
  column: 'Column',
};

export default function ImportWizard({ trialId, onComplete, onClose }: ImportWizardProps) {
  const [step, setStep] = useState<Step>('pick');
  const [file, setFile] = useState<File | null>(null);
  const [columns, setColumns] = useState<string[]>([]);
  const [sampleRows, setSampleRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultMsg, setResultMsg] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setError('');
    setLoading(true);
    try {
      const preview = await api.previewImport(trialId, f);
      setColumns(preview.columns);
      setSampleRows(preview.sample_rows);
      setMapping(preview.suggested_mapping);
      setStep('preview');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  }

  async function handleImport() {
    if (!file) return;
    // Validate all fields mapped
    for (const field of REQUIRED_FIELDS) {
      if (!mapping[field]) {
        setError(`Please map the "${FIELD_LABELS[field]}" field`);
        return;
      }
    }
    setLoading(true);
    setError('');
    try {
      const result = await api.importMapped(trialId, file, mapping);
      const msg = `Imported ${result.imported} plots${result.errors.length > 0 ? `. Errors: ${result.errors.join('; ')}` : ''}`;
      setResultMsg(msg);
      setStep('result');
      onComplete(msg);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setLoading(false);
    }
  }

  function downloadTemplate() {
    const csv = 'plot_id,genotype,rep,row,column\nPLOT001,Genotype_A,1,1,1\nPLOT002,Genotype_B,1,1,2\n';
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plot_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <>
      <div className="fixed inset-0 z-50 bg-black/40" onClick={onClose} />
      <div className="fixed inset-x-4 top-[10%] z-50 bg-white rounded-2xl shadow-xl max-w-lg mx-auto max-h-[80vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between">
          <h3 className="font-bold text-neutral">Import Plots</h3>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-1">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
            </svg>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {/* Step 1: File picker */}
          {step === 'pick' && (
            <div className="text-center py-8">
              <p className="text-sm text-gray-500 mb-4">Upload a CSV or Excel file with your plot data</p>
              <button
                onClick={() => fileRef.current?.click()}
                className="px-6 py-3 bg-primary text-white rounded-xl font-semibold min-h-[48px] hover:bg-primary-dark transition-colors"
              >
                Choose File
              </button>
              <input ref={fileRef} type="file" accept=".csv,.xlsx" onChange={handleFileSelect} className="hidden" />
              <div className="mt-4">
                <button onClick={downloadTemplate} className="text-sm text-blue-500 hover:text-blue-700 underline">
                  Download template CSV
                </button>
              </div>
              {loading && <p className="text-sm text-gray-400 mt-4">Reading file...</p>}
            </div>
          )}

          {/* Step 2: Preview */}
          {step === 'preview' && (
            <div>
              <p className="text-sm text-gray-500 mb-3">
                Detected <strong>{columns.length}</strong> columns with <strong>{sampleRows.length}</strong> sample rows
              </p>
              <div className="overflow-x-auto border border-gray-200 rounded-lg mb-4">
                <table className="text-xs w-full">
                  <thead>
                    <tr className="bg-gray-50">
                      {columns.map(c => <th key={c} className="px-2 py-1.5 text-left font-semibold text-gray-600">{c}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {sampleRows.map((row, i) => (
                      <tr key={i} className="border-t border-gray-100">
                        {columns.map(c => <td key={c} className="px-2 py-1.5 text-gray-700">{row[c] || ''}</td>)}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <button
                onClick={() => setStep('map')}
                className="w-full py-3 bg-primary text-white rounded-xl font-semibold min-h-[48px]"
              >
                Next: Map Columns
              </button>
            </div>
          )}

          {/* Step 3: Column mapping */}
          {step === 'map' && (
            <div>
              <p className="text-sm text-gray-500 mb-3">Map your file columns to the required fields</p>
              <div className="space-y-3">
                {REQUIRED_FIELDS.map(field => (
                  <div key={field} className="flex items-center gap-3">
                    <label className="text-sm font-medium text-neutral w-24">{FIELD_LABELS[field]}</label>
                    <select
                      value={mapping[field] || ''}
                      onChange={e => setMapping(prev => ({ ...prev, [field]: e.target.value }))}
                      className={`flex-1 border rounded-lg px-3 py-2 text-sm ${mapping[field] ? 'border-green-400' : 'border-gray-300'}`}
                    >
                      <option value="">-- Select column --</option>
                      {columns.map(c => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </div>
                ))}
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={() => setStep('preview')} className="flex-1 py-3 border border-gray-300 rounded-xl font-medium min-h-[48px]">
                  Back
                </button>
                <button
                  onClick={handleImport}
                  disabled={loading}
                  className="flex-1 py-3 bg-primary text-white rounded-xl font-semibold min-h-[48px] disabled:opacity-50"
                >
                  {loading ? 'Importing...' : 'Import'}
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Result */}
          {step === 'result' && (
            <div className="text-center py-8">
              <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-green-600" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                </svg>
              </div>
              <p className="text-sm text-neutral font-medium">{resultMsg}</p>
              <button onClick={onClose} className="mt-4 px-6 py-2 bg-primary text-white rounded-xl font-semibold min-h-[44px]">
                Done
              </button>
            </div>
          )}

          {error && <p className="text-sm text-error mt-3">{error}</p>}
        </div>
      </div>
    </>
  );
}
