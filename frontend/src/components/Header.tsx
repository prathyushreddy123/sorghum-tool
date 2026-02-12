import { useNavigate, useLocation } from 'react-router-dom';

export default function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const isHome = location.pathname === '/';

  return (
    <header className="bg-primary text-white px-4 py-3 flex items-center gap-3 sticky top-0 z-10 shadow-md">
      {!isHome && (
        <button
          onClick={() => navigate(-1)}
          className="text-white text-2xl leading-none min-w-[44px] min-h-[44px] flex items-center justify-center"
          aria-label="Go back"
        >
          &larr;
        </button>
      )}
      <h1 className="text-lg font-bold tracking-tight">SorghumField</h1>
    </header>
  );
}
