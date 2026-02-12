# Frontend Specification

## Technology
- React 18 with TypeScript
- Tailwind CSS (mobile-first)
- React Router v6
- useState/useContext (no Redux)
- Vite for build tooling

## Design Tokens

```css
/* Colors - use Tailwind classes */
--primary-green: #2E7D32    /* bg-[#2E7D32] or define in tailwind.config */
--light-green: #81C784
--warning-yellow: #FFC107
--error-red: #D32F2F
--neutral-gray: #616161
--background: #FAFAFA
--card-white: #FFFFFF

/* In tailwind.config.js, extend theme: */
colors: {
  primary: '#2E7D32',
  'primary-light': '#81C784',
  warning: '#FFC107',
  error: '#D32F2F',
  neutral: '#616161',
}
```

## Routes

```
/                           → TrialList (home)
/trials/new                 → CreateTrial form
/trials/:trialId            → TrialDashboard
/trials/:trialId/plots      → PlotList with import
/trials/:trialId/collect    → Redirects to first unscored plot
/trials/:trialId/collect/:plotId → ObservationEntry
```

## Component Hierarchy

```
App
├── Layout (header, nav)
│   ├── Header (logo, back button)
│   └── children (routes)
│
├── TrialList (/)
│   ├── TrialCard (repeating)
│   └── NewTrialButton
│
├── CreateTrial (/trials/new)
│   └── TrialForm
│
├── TrialDashboard (/trials/:trialId)
│   ├── ProgressBar
│   ├── StatsCards
│   │   ├── StatCard (ergot)
│   │   ├── StatCard (height)
│   │   └── StatCard (flowering)
│   ├── ActionButtons
│   │   ├── RecordButton → /collect
│   │   ├── ViewPlotsButton → /plots
│   │   └── ExportButton
│   └── RecentActivity (optional)
│
├── PlotList (/trials/:trialId/plots)
│   ├── SearchBar
│   ├── FilterTabs (All | Unscored | Scored)
│   ├── ImportButton (CSV upload)
│   └── PlotCard (repeating)
│       └── ScoredBadge
│
└── ObservationEntry (/trials/:trialId/collect/:plotId)
    ├── PlotHeader (plot_id, genotype)
    ├── SeveritySelector
    │   ├── SeverityButton (x5)
    │   └── ReferenceImagesLink
    ├── ReferenceModal (conditional)
    ├── FloweringDateInput
    ├── PlantHeightInput
    ├── NotesTextarea
    ├── SaveNextButton
    └── NavigationControls (prev/next)
```

## Key Components

### SeveritySelector
```tsx
// 5 large buttons in a row
// Each button: number on top, label below
// Selected state: filled background, bold
// Unselected: outline only

<div className="flex justify-between gap-2">
  {[1,2,3,4,5].map(score => (
    <button
      key={score}
      onClick={() => setScore(score)}
      className={`
        flex-1 py-4 rounded-lg border-2 min-h-[60px]
        ${selected === score 
          ? 'bg-primary text-white border-primary' 
          : 'bg-white text-neutral border-gray-300'}
      `}
    >
      <div className="text-2xl font-bold">{score}</div>
      <div className="text-xs">{labels[score]}</div>
    </button>
  ))}
</div>

const labels = {
  1: 'None',
  2: 'Low', 
  3: 'Mod',
  4: 'High',
  5: 'Sev'
};
```

### ReferenceModal
```tsx
// Full-screen modal on mobile
// Shows 5 severity levels with placeholder images
// Each: image thumbnail + score + description

// Placeholder images: use colored boxes with text
// e.g., green box "No symptoms" for score 1
//       red box "Severe infection" for score 5
```

### ProgressBar
```tsx
<div className="bg-gray-200 rounded-full h-4">
  <div 
    className="bg-primary h-4 rounded-full transition-all"
    style={{ width: `${(scored/total) * 100}%` }}
  />
</div>
<p className="text-sm text-neutral mt-1">
  {scored}/{total} plots scored
</p>
```

### StatCard
```tsx
<div className="bg-white rounded-lg p-4 shadow">
  <div className="text-3xl font-bold text-primary">{value}</div>
  <div className="text-sm text-neutral">{label}</div>
  {subtext && <div className="text-xs text-gray-400">{subtext}</div>}
</div>
```

## API Client

```typescript
// src/api/client.ts
const API_BASE = 'http://localhost:8000';

export const api = {
  // Trials
  getTrials: () => fetch(`${API_BASE}/trials`).then(r => r.json()),
  createTrial: (data) => fetch(`${API_BASE}/trials`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  }).then(r => r.json()),
  getTrial: (id) => fetch(`${API_BASE}/trials/${id}`).then(r => r.json()),
  
  // Plots
  getPlots: (trialId, params?) => 
    fetch(`${API_BASE}/trials/${trialId}/plots?${new URLSearchParams(params)}`).then(r => r.json()),
  importPlots: (trialId, file) => {
    const form = new FormData();
    form.append('file', file);
    return fetch(`${API_BASE}/trials/${trialId}/plots/import`, {
      method: 'POST',
      body: form
    }).then(r => r.json());
  },
  getNextUnscored: (trialId, currentPlotId) =>
    fetch(`${API_BASE}/trials/${trialId}/plots/${currentPlotId}/next-unscored`).then(r => r.json()),
  
  // Observations
  getObservations: (plotId) => 
    fetch(`${API_BASE}/plots/${plotId}/observations`).then(r => r.json()),
  saveObservations: (plotId, observations) =>
    fetch(`${API_BASE}/plots/${plotId}/observations/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ observations })
    }).then(r => r.json()),
  
  // Stats & Export
  getStats: (trialId) => fetch(`${API_BASE}/trials/${trialId}/stats`).then(r => r.json()),
  exportCsv: (trialId) => fetch(`${API_BASE}/trials/${trialId}/export`).then(r => r.blob()),
};
```

## File Structure

```
frontend/
├── index.html
├── vite.config.ts
├── tailwind.config.js
├── tsconfig.json
├── package.json
└── src/
    ├── main.tsx
    ├── App.tsx
    ├── index.css           # Tailwind imports
    ├── api/
    │   └── client.ts
    ├── components/
    │   ├── Layout.tsx
    │   ├── Header.tsx
    │   ├── ProgressBar.tsx
    │   ├── StatCard.tsx
    │   ├── SeveritySelector.tsx
    │   ├── ReferenceModal.tsx
    │   └── ...
    ├── pages/
    │   ├── TrialList.tsx
    │   ├── CreateTrial.tsx
    │   ├── TrialDashboard.tsx
    │   ├── PlotList.tsx
    │   └── ObservationEntry.tsx
    └── types/
        └── index.ts
```

## TypeScript Types

```typescript
// src/types/index.ts

export interface Trial {
  id: number;
  name: string;
  crop: string;
  location: string;
  start_date: string;
  end_date: string | null;
  created_at: string;
  plot_count?: number;
  scored_count?: number;
}

export interface Plot {
  id: number;
  trial_id: number;
  plot_id: string;
  genotype: string;
  rep: number;
  row: number;
  column: number;
  notes: string | null;
  has_observations?: boolean;
}

export interface Observation {
  id: number;
  plot_id: number;
  trait_name: 'ergot_severity' | 'flowering_date' | 'plant_height';
  value: string;
  recorded_at: string;
  notes: string | null;
}

export interface TrialStats {
  total_plots: number;
  scored_plots: number;
  traits: {
    ergot_severity: NumericStats;
    plant_height: NumericStats;
    flowering_date: DateStats;
  };
}

export interface NumericStats {
  count: number;
  mean: number;
  sd: number;
  min: number;
  max: number;
}

export interface DateStats {
  count: number;
  earliest: string;
  latest: string;
}
```

## Mobile-First Responsive Breakpoints

```css
/* Default: mobile (< 640px) */
/* sm: >= 640px (large phones, small tablets) */
/* md: >= 768px (tablets) */
/* lg: >= 1024px (desktop) */

/* Example usage */
<div className="px-4 sm:px-6 md:px-8">  /* Padding increases with screen */
<div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4">  /* Grid adapts */
```

## Testing on Chrome DevTools

1. Open Chrome DevTools (F12)
2. Click device toggle (Ctrl+Shift+M)
3. Select "iPhone SE" (375x667)
4. Test all interactions with touch simulation

## Running

```bash
cd frontend
npm install
npm run dev
```

Runs at: http://localhost:5173 (Vite default)
