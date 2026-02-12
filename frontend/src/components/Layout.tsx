import { Outlet } from 'react-router-dom';
import Header from './Header';

export default function Layout() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main className="px-4 py-4 max-w-2xl mx-auto">
        <Outlet />
      </main>
    </div>
  );
}
