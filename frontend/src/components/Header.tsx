import { useNavigate, useLocation } from 'react-router-dom';
import { useWeather } from '../hooks/useWeather';
import { useTheme } from '../hooks/useTheme';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const THEME_ICONS = { light: '☀️', dark: '🌙', sun: '🔆' } as const;

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { temperature, humidity, weatherStatus } = useWeather();
  const { theme, cycleTheme } = useTheme();
  const { online, pendingCount, syncing, manualSync } = useOnlineStatus();

  return (
    <>
      <header className="bg-primary text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-md">
        {!isHome && (
          <button
            onClick={() => navigate(-1)}
            className="text-white text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center hover:bg-primary-dark transition-colors rounded-lg"
            aria-label="Go back"
          >
            &larr;
          </button>
        )}
        <button
          onClick={() => navigate('/')}
          className="text-lg font-bold tracking-tight hover:opacity-80 transition-opacity"
        >
          FieldScout
        </button>

        <div className="ml-auto flex items-center gap-2">
          {weatherStatus === 'loading' && (
            <span className="text-xs text-white/60 animate-pulse">Loading...</span>
          )}
          {weatherStatus === 'loaded' && temperature !== null && humidity !== null && (
            <div className="flex items-center gap-2 text-sm font-medium bg-white/15 rounded-full px-3 py-1">
              <span>{temperature.toFixed(1)}&deg;C</span>
              <span className="text-white/50">|</span>
              <span>{humidity.toFixed(0)}% RH</span>
            </div>
          )}
          <button
            onClick={cycleTheme}
            className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg bg-white/15 hover:bg-white/25 transition-colors text-base"
            aria-label={`Theme: ${theme}`}
            title={`Theme: ${theme} (tap to cycle)`}
          >
            {THEME_ICONS[theme]}
          </button>
        </div>
      </header>

      {/* Offline / sync banner */}
      {(!online || pendingCount > 0) && (
        <div
          className={`px-4 py-1.5 text-xs font-medium flex items-center justify-between ${
            online
              ? 'bg-yellow-50 text-yellow-800 border-b border-yellow-200'
              : 'bg-red-50 text-red-700 border-b border-red-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-2 h-2 rounded-full ${online ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`} />
            {!online && 'Offline mode — data saved locally'}
            {online && pendingCount > 0 && `${pendingCount} pending change${pendingCount > 1 ? 's' : ''}`}
          </div>
          {online && pendingCount > 0 && (
            <button
              onClick={manualSync}
              disabled={syncing}
              className="px-2 py-0.5 bg-yellow-200 text-yellow-900 rounded text-xs font-semibold disabled:opacity-50"
            >
              {syncing ? 'Syncing...' : 'Sync now'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
