import { Outlet, useLocation } from 'react-router-dom';
import Header from './Header';
import BottomTabBar from './BottomTabBar';

export default function Layout() {
  const location = useLocation();

  // Hide tab bar on observation entry (it has its own sticky action bar)
  const isCollecting = /\/trials\/\d+\/collect\/\d+/.test(location.pathname);

  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className={`px-4 py-4 max-w-2xl mx-auto ${!isCollecting ? 'pb-20' : ''}`}>
        <Outlet />
      </main>
      {!isCollecting && <BottomTabBar />}
    </div>
  );
}
