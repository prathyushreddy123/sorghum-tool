import { useState, useRef } from 'react';
import type { ParsedTrait } from '../types';

interface TraitInputProps {
  trait: ParsedTrait;
  value: string;
  previousValue?: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}

export default function TraitInput({ trait, value, previousValue, onChange, disabled }: TraitInputProps) {
  const [listening, setListening] = useState(false);
  const recognitionRef = useRef<SpeechRecognition | null>(null);

  const isNumeric = trait.data_type === 'integer' || trait.data_type === 'float';

  function startVoiceInput() {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const rec: SpeechRecognition = new SR();
    rec.lang = 'en-US';
    rec.interimResults = false;
    recognitionRef.current = rec;
    setListening(true);

    rec.onresult = (e: SpeechRecognitionEvent) => {
      const spoken = e.results[0][0].transcript.trim().toLowerCase();
      // convert words to digits: "one twenty" → "120", "three point five" → "3.5"
      const parsed = parseSpokenNumber(spoken);
      if (parsed !== null) onChange(String(parsed));
      setListening(false);
    };
    rec.onerror = () => setListening(false);
    rec.onend = () => setListening(false);
    rec.start();
  }

  function parseSpokenNumber(spoken: string): number | null {
    const wordMap: Record<string, number> = {
      zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5,
      six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
      eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15,
      sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
      twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60,
      seventy: 70, eighty: 80, ninety: 90,
      hundred: 100, thousand: 1000,
    };
    // Replace "point" with "." and try direct parse
    const withDot = spoken.replace(/\s*point\s*/g, '.').replace(/\s+/g, '');
    const direct = parseFloat(withDot);
    if (!isNaN(direct)) return direct;

    // Try word-by-word sum
    const words = spoken.split(/[\s-]+/);
    let total = 0;
    let current = 0;
    for (const word of words) {
      if (word in wordMap) {
        const n = wordMap[word];
        if (n === 100) current *= 100;
        else if (n === 1000) { total += current * 1000; current = 0; }
        else current += n;
      }
    }
    total += current;
    return total > 0 ? total : null;
  }

  function adjustNumeric(delta: number) {
    const step = trait.data_type === 'float' ? 0.1 : 1;
    const current = parseFloat(value) || 0;
    const next = Math.round((current + delta * step) * 1000) / 1000;
    const min = trait.min_value ?? -Infinity;
    const max = trait.max_value ?? Infinity;
    onChange(String(Math.max(min, Math.min(max, next))));
  }

  const hasSpeech = typeof window !== 'undefined' &&
    ((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  return (
    <div className="mb-4">
      {/* Label row */}
      <div className="flex items-center justify-between mb-1">
        <label className="text-sm font-semibold text-gray-700">
          {trait.label}
          {trait.unit && <span className="ml-1 text-gray-400 font-normal">({trait.unit})</span>}
        </label>
        {previousValue !== undefined && previousValue !== '' && (
          <span className="text-xs text-gray-400 bg-gray-100 px-2 py-0.5 rounded-full">
            Last: {previousValue}
          </span>
        )}
      </div>

      {/* Description hint */}
      {trait.description && (
        <p className="text-xs text-gray-400 mb-2">{trait.description}</p>
      )}

      {/* ── Categorical: buttons (≤9) or dropdown (>9) ── */}
      {trait.data_type === 'categorical' && trait.categoriesArr.length <= 9 && (
        <div className="flex flex-wrap gap-2">
          {trait.categoriesArr.map((cat, idx) => {
            const label = trait.categoryLabelsArr[idx] || cat;
            const selected = value === cat;
            return (
              <button
                key={cat}
                type="button"
                disabled={disabled}
                onClick={() => onChange(cat)}
                className={`
                  flex-1 min-w-[56px] py-3 px-2 rounded-xl text-sm font-semibold border-2 transition-all
                  ${selected
                    ? 'bg-green-700 text-white border-green-700 shadow-md scale-105'
                    : 'bg-white text-gray-700 border-gray-200 hover:border-green-400 hover:bg-green-50'
                  }
                  ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer active:scale-95'}
                `}
                title={label}
              >
                <div className="font-bold">{cat}</div>
                <div className="text-[10px] leading-tight mt-0.5 opacity-80 truncate">{label.split(' ')[0]}</div>
              </button>
            );
          })}
        </div>
      )}

      {trait.data_type === 'categorical' && trait.categoriesArr.length > 9 && (
        <select
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-3 py-3 text-sm focus:outline-none focus:border-green-600"
        >
          <option value="">— select —</option>
          {trait.categoriesArr.map((cat, idx) => (
            <option key={cat} value={cat}>
              {cat}{trait.categoryLabelsArr[idx] ? ` — ${trait.categoryLabelsArr[idx]}` : ''}
            </option>
          ))}
        </select>
      )}

      {/* ── Numeric (integer / float) ── */}
      {isNumeric && (
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={disabled}
            onClick={() => adjustNumeric(-1)}
            className="w-12 h-12 rounded-xl bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
          >
            −
          </button>
          <div className="relative flex-1">
            <input
              type="number"
              disabled={disabled}
              value={value}
              onChange={e => onChange(e.target.value)}
              min={trait.min_value ?? undefined}
              max={trait.max_value ?? undefined}
              step={trait.data_type === 'float' ? '0.1' : '1'}
              placeholder={
                trait.min_value !== null && trait.max_value !== null
                  ? `${trait.min_value}–${trait.max_value}`
                  : 'Enter value'
              }
              className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-center text-lg font-semibold focus:outline-none focus:border-green-600 disabled:opacity-50"
            />
          </div>
          <button
            type="button"
            disabled={disabled}
            onClick={() => adjustNumeric(1)}
            className="w-12 h-12 rounded-xl bg-gray-100 text-xl font-bold text-gray-600 hover:bg-gray-200 active:scale-95 transition-all disabled:opacity-50"
          >
            +
          </button>
          {hasSpeech && (
            <button
              type="button"
              disabled={disabled || listening}
              onClick={startVoiceInput}
              className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all
                ${listening ? 'bg-red-100 text-red-600 animate-pulse' : 'bg-gray-100 text-gray-600 hover:bg-blue-50 hover:text-blue-600'}
                disabled:opacity-50`}
              title="Voice input"
            >
              {listening ? '🔴' : '🎤'}
            </button>
          )}
        </div>
      )}

      {/* ── Date ── */}
      {trait.data_type === 'date' && (
        <input
          type="date"
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-600 disabled:opacity-50"
        />
      )}

      {/* ── Text ── */}
      {trait.data_type === 'text' && (
        <textarea
          disabled={disabled}
          value={value}
          onChange={e => onChange(e.target.value)}
          rows={3}
          placeholder={trait.description || 'Enter notes...'}
          className="w-full border-2 border-gray-200 rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-green-600 resize-none disabled:opacity-50"
        />
      )}
    </div>
  );
}
