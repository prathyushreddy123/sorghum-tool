import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TeamProvider } from './contexts/TeamContext';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import TrialList from './pages/TrialList';
import CreateTrial from './pages/CreateTrial';
import TrialDashboard from './pages/TrialDashboard';
import PlotList from './pages/PlotList';
import CollectRedirect from './pages/CollectRedirect';
import ObservationEntry from './pages/ObservationEntry';
import HeatmapView from './pages/HeatmapView';
import TeamManagement from './pages/TeamManagement';
import Settings from './pages/Settings';

function ProtectedRoutes() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <p className="text-neutral">Loading...</p>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  return (
    <TeamProvider>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TrialList />} />
          <Route path="/trials/new" element={<CreateTrial />} />
          <Route path="/trials/:trialId" element={<TrialDashboard />} />
          <Route path="/trials/:trialId/plots" element={<PlotList />} />
          <Route path="/trials/:trialId/heatmap" element={<HeatmapView />} />
          <Route path="/trials/:trialId/collect" element={<CollectRedirect />} />
          <Route path="/trials/:trialId/collect/:plotId" element={<ObservationEntry />} />
          <Route path="/teams" element={<TeamManagement />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </TeamProvider>
  );
}

function AuthenticatedLogin() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return <LoginPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthenticatedLogin />} />
          <Route path="*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
