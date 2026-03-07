import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TeamProvider } from './contexts/TeamContext';
import Layout from './components/Layout';

// Lazy-loaded pages — each page only downloads when first visited,
// reducing the initial JS bundle the user has to parse on load.
const LoginPage = lazy(() => import('./pages/LoginPage'));
const TrialList = lazy(() => import('./pages/TrialList'));
const CreateTrial = lazy(() => import('./pages/CreateTrial'));
const TrialDashboard = lazy(() => import('./pages/TrialDashboard'));
const PlotList = lazy(() => import('./pages/PlotList'));
const CollectRedirect = lazy(() => import('./pages/CollectRedirect'));
const ObservationEntry = lazy(() => import('./pages/ObservationEntry'));
const HeatmapView = lazy(() => import('./pages/HeatmapView'));
const TeamManagement = lazy(() => import('./pages/TeamManagement'));
const Settings = lazy(() => import('./pages/Settings'));
const TrainingDashboard = lazy(() => import('./pages/TrainingDashboard'));
const BulkScoring = lazy(() => import('./pages/BulkScoring'));
const ResetPasswordPage = lazy(() => import('./pages/ResetPasswordPage'));
const VerifyEmailPage = lazy(() => import('./pages/VerifyEmailPage'));

function PageLoader() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center">
      <p className="text-neutral">Loading...</p>
    </div>
  );
}

function AdminRoute({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  if (user?.role !== 'admin') {
    return <Navigate to="/" replace />;
  }
  return <>{children}</>;
}

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
      <Suspense fallback={<PageLoader />}>
        <Routes>
          <Route element={<Layout />}>
            <Route path="/" element={<TrialList />} />
            <Route path="/trials/new" element={<CreateTrial />} />
            <Route path="/trials/:trialId" element={<TrialDashboard />} />
            <Route path="/trials/:trialId/plots" element={<PlotList />} />
            <Route path="/trials/:trialId/heatmap" element={<HeatmapView />} />
            <Route path="/trials/:trialId/bulk-score" element={<BulkScoring />} />
            <Route path="/trials/:trialId/collect" element={<CollectRedirect />} />
            <Route path="/trials/:trialId/collect/:plotId" element={<ObservationEntry />} />
            <Route path="/teams" element={<TeamManagement />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/settings/training" element={<AdminRoute><TrainingDashboard /></AdminRoute>} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </Suspense>
    </TeamProvider>
  );
}

function AuthenticatedLogin() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) return <Navigate to="/" replace />;
  return (
    <Suspense fallback={<PageLoader />}>
      <LoginPage />
    </Suspense>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <Routes>
          <Route path="/login" element={<AuthenticatedLogin />} />
          <Route path="/reset-password" element={<Suspense fallback={<PageLoader />}><ResetPasswordPage /></Suspense>} />
          <Route path="/verify-email" element={<Suspense fallback={<PageLoader />}><VerifyEmailPage /></Suspense>} />
          <Route path="*" element={<ProtectedRoutes />} />
        </Routes>
      </AuthProvider>
    </BrowserRouter>
  );
}
