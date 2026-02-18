import { useNavigate, useLocation } from 'react-router-dom';
import { useWeather } from '../hooks/useWeather';
import { useTheme } from '../hooks/useTheme';
import { useOnlineStatus } from '../hooks/useOnlineStatus';

const THEME_ICONS = { light: '\u2600\uFE0F', dark: '\uD83C\uDF19', sun: '\uD83D\uDD06' } as const;

function LogoIcon({ white }: { white?: boolean }) {
  return (
    <div className={`w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 ${
      white ? 'bg-white/20' : 'bg-primary'
    }`}>
      <svg className="w-4 h-4 text-white" viewBox="0 0 16 16" fill="currentColor">
        <path d="M8 14V7M8 7C8 7 6.5 5.5 5 6C5 7.5 6.5 8 8 7ZM8 7C8 7 9.5 5.5 11 6C11 7.5 9.5 8 8 7ZM8 10.5C8 10.5 6.5 9 5 9.5C5 11 6.5 11.5 8 10.5ZM8 10.5C8 10.5 9.5 9 11 9.5C11 11 9.5 11.5 8 10.5Z" />
      </svg>
    </div>
  );
}

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { temperature, humidity, weatherStatus } = useWeather();
  const { theme, cycleTheme } = useTheme();
  const { online, pendingCount, syncing, manualSync } = useOnlineStatus();

  return (
    <>
      <header
        className={`px-4 sm:px-6 py-3 flex items-center gap-3 sticky top-0 z-10 transition-all ${
          isHome
            ? 'bg-background text-neutral shadow-none border-b border-gray-100'
            : 'bg-gradient-to-r from-[#1a5e1e] to-primary text-white shadow-md'
        }`}
      >
        {!isHome && (
          <button
            onClick={() => navigate(-1)}
            className="text-white/90 hover:text-white min-w-[40px] min-h-[40px] flex items-center justify-center hover:bg-white/10 transition-colors rounded-lg"
            aria-label="Go back"
          >
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10.5 19.5L3 12m0 0l7.5-7.5M3 12h18" />
            </svg>
          </button>
        )}

        <button
          onClick={() => navigate('/')}
          className="flex items-center gap-2 hover:opacity-80 transition-opacity"
        >
          <LogoIcon white={!isHome} />
          <span className={`text-[17px] font-bold tracking-tight ${isHome ? 'text-primary' : 'text-white'}`}>
            FieldScout
          </span>
        </button>

        <div className="ml-auto flex items-center gap-2">
          {weatherStatus === 'loading' && (
            <span className={`text-xs animate-pulse ${isHome ? 'text-gray-400' : 'text-white/60'}`}>
              Locating...
            </span>
          )}
          {weatherStatus === 'loaded' && temperature !== null && humidity !== null && (
            <div className={`flex items-center gap-1.5 text-xs font-medium rounded-full px-3 py-1.5 ${
              isHome ? 'bg-gray-100 text-gray-600' : 'bg-white/15 text-white'
            }`}>
              <svg className="w-3 h-3 opacity-70" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v2.25m6.364.386l-1.591 1.591M21 12h-2.25m-.386 6.364l-1.591-1.591M12 18.75V21m-4.773-4.227l-1.591 1.591M5.25 12H3m4.227-4.773L5.636 5.636M15.75 12a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0z" />
              </svg>
              <span>{temperature.toFixed(0)}&deg;C</span>
              <span className={isHome ? 'text-gray-300' : 'text-white/40'}>·</span>
              <span>{humidity.toFixed(0)}%</span>
            </div>
          )}
          <button
            onClick={cycleTheme}
            className={`w-9 h-9 flex items-center justify-center rounded-lg transition-colors text-sm ${
              isHome
                ? 'bg-gray-100 hover:bg-gray-200 text-gray-600'
                : 'bg-white/15 hover:bg-white/25 text-white'
            }`}
            aria-label={`Theme: ${theme}`}
            title={`Switch theme (${theme})`}
          >
            {THEME_ICONS[theme]}
          </button>
        </div>
      </header>

      {(!online || pendingCount > 0) && (
        <div
          className={`px-4 py-2 text-xs font-medium flex items-center justify-between ${
            online
              ? 'bg-amber-50 text-amber-800 border-b border-amber-100'
              : 'bg-red-50 text-red-700 border-b border-red-100'
          }`}
        >
          <div className="flex items-center gap-2">
            <span className={`w-1.5 h-1.5 rounded-full ${online ? 'bg-amber-500' : 'bg-red-500 animate-pulse'}`} />
            {!online && 'Offline \u2014 observations saved locally'}
            {online && pendingCount > 0 && `${pendingCount} observation${pendingCount > 1 ? 's' : ''} pending sync`}
          </div>
          {online && pendingCount > 0 && (
            <button
              onClick={manualSync}
              disabled={syncing}
              className="px-2.5 py-0.5 bg-amber-200 text-amber-900 rounded-full text-xs font-semibold disabled:opacity-50 hover:bg-amber-300 transition-colors"
            >
              {syncing ? 'Syncing\u2026' : 'Sync now'}
            </button>
          )}
        </div>
      )}
    </>
  );
}
