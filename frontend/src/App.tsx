import { BrowserRouter, Routes, Route } from 'react-router-dom';
import Layout from './components/Layout';
import TrialList from './pages/TrialList';
import CreateTrial from './pages/CreateTrial';
import TrialDashboard from './pages/TrialDashboard';
import PlotList from './pages/PlotList';
import CollectRedirect from './pages/CollectRedirect';
import ObservationEntry from './pages/ObservationEntry';
import HeatmapView from './pages/HeatmapView';
import Settings from './pages/Settings';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<TrialList />} />
          <Route path="/trials/new" element={<CreateTrial />} />
          <Route path="/trials/:trialId" element={<TrialDashboard />} />
          <Route path="/trials/:trialId/plots" element={<PlotList />} />
          <Route path="/trials/:trialId/heatmap" element={<HeatmapView />} />
          <Route path="/trials/:trialId/collect" element={<CollectRedirect />} />
          <Route path="/trials/:trialId/collect/:plotId" element={<ObservationEntry />} />
          <Route path="/settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
