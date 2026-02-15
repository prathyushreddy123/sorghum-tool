import { useNavigate, useLocation } from 'react-router-dom';
import { useWeather } from '../hooks/useWeather';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';
  const { temperature, humidity, weatherStatus } = useWeather();

  return (
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
      </div>
    </header>
  );
}
