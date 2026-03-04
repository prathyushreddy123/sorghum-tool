import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomTabBar from './BottomTabBar';

export default function Layout() {
  const location = useLocation();

  const isCollecting = /\/trials\/\d+\/collect\/\d+/.test(location.pathname);
  const isBulkScoring = /\/trials\/\d+\/bulk-score/.test(location.pathname);
  const hideTabBar = isCollecting || isBulkScoring;
  const isHome = location.pathname === '/';

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className={`${isHome ? '' : 'px-4 sm:px-6 py-4 max-w-3xl mx-auto'} ${!hideTabBar ? 'pb-20' : ''}`}>
        <Outlet />
      </main>
      {!hideTabBar && <BottomTabBar />}
    </div>
  );
}
