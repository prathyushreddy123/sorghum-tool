# Remaining Features — SorghumField Roadmap

Features still to implement, organized by release phase. Cross-references PRD section 7.2 and section 14.

---

## V1.1 — Production Ready

### F4.1: Offline Support
**Priority:** High | **Effort:** Large

IndexedDB storage with Service Worker for offline data collection and background sync.

**What to build:**
- Service Worker via Workbox for caching app shell and API responses
- IndexedDB storage (Dexie.js) to queue observations when offline
- Sync queue that pushes queued observations when connectivity returns
- Conflict resolution strategy (last-write-wins or prompt user)
- Online/offline indicator in the UI header
- "Pending sync" badge count on observations

**Tech:** Workbox, Dexie.js, Background Sync API

**Why it matters:** Field locations (Tifton, Plains, Griffin) have spotty cell coverage. This is the #1 blocker for real-world adoption.

---

### F4.2: User Authentication
**Priority:** High | **Effort:** Medium

JWT-based login/register so multiple researchers can use the system.

**What to build:**
- Backend: User model (email, hashed password, name, role)
- Backend: `/auth/register`, `/auth/login` endpoints returning JWT tokens
- Backend: Auth middleware that protects all endpoints except login/register
- Backend: Password hashing with bcrypt
- Frontend: Login page, Register page
- Frontend: Auth context storing JWT, auto-redirect to login when 401
- Frontend: Logout button in header
- Trial ownership: link trials to the user who created them

**Tech:** python-jose (JWT), passlib + bcrypt, React Context

---

### F4.3: Team Collaboration
**Priority:** High | **Effort:** Medium | **Depends on:** F4.2

Trial sharing with role-based access control.

**What to build:**
- Backend: TrialMember model (trial_id, user_id, role: owner/editor/viewer)
- Backend: Invite endpoint `POST /trials/{id}/members`
- Backend: Permission checks on all trial/plot/observation endpoints
- Frontend: "Share" button on trial dashboard
- Frontend: Member list with role management
- Frontend: "Shared With Me" section on trial list (per PRD wireframe)

**Roles:**
- Owner: full control, can delete trial, manage members
- Editor: can add/edit observations and plots
- Viewer: read-only access, can export

---

### F4.6: Excel Export
**Priority:** Medium | **Effort:** Small

Formatted .xlsx export with multiple sheets.

**What to build:**
- Backend: Install `openpyxl`
- Backend: `GET /trials/{id}/export?format=xlsx` endpoint
- Sheet 1 "Summary": trial metadata + summary stats table
- Sheet 2 "Observations": raw data (same as current CSV but in xlsx)
- Sheet 3 "Plots": plot metadata without observations
- Auto-sized columns, header row styling
- Frontend: Add "Export Excel" button alongside existing "Export CSV"

**Tech:** openpyxl

---

### Cloud Deployment
**Priority:** High | **Effort:** Medium

Deploy so the app is accessible from any device, not just localhost.

**What to build:**
- Dockerize backend (FastAPI + SQLAlchemy)
- Migrate SQLite → PostgreSQL (update DATABASE_URL, install psycopg2)
- Deploy backend to Railway or Render (free tier)
- Deploy frontend to Vercel (connects to GitHub repo)
- Environment variables for DATABASE_URL, CORS origins, JWT secret
- CI/CD: auto-deploy on push to main

**Tech:** Docker, PostgreSQL, Railway/Render, Vercel

---

## V1.2 — Enhanced Collection

### F5.1: Image Capture
**Priority:** High | **Effort:** Medium

Attach photos of panicles to observations for documentation.

**What to build:**
- Backend: Image upload endpoint `POST /observations/{id}/images`
- Backend: Store images on disk or S3-compatible storage (local for dev)
- Backend: Image model (observation_id, filename, uploaded_at)
- Backend: Serve images via `GET /images/{filename}`
- Frontend: Camera button on observation entry form
- Frontend: Use `<input type="file" accept="image/*" capture="environment">` for mobile camera
- Frontend: Thumbnail gallery on observation entry showing attached images
- Image compression before upload (max 1MB, resize to 1200px)

---

### F5.2: GPS Tagging
**Priority:** High | **Effort:** Small

Auto-record latitude/longitude when making observations.

**What to build:**
- Backend: Add `latitude` and `longitude` nullable float fields to Observation model
- Backend: Accept lat/lng in observation create/bulk endpoints
- Frontend: Request geolocation permission on observation entry
- Frontend: Use `navigator.geolocation.getCurrentPosition()` to capture coords
- Frontend: Display coordinates (or "Location captured" indicator) on observation entry
- Include lat/lng columns in CSV/Excel exports

---

### F5.3: Barcode/QR Scanning
**Priority:** Medium | **Effort:** Medium

Scan plot tags to quickly jump to the right plot.

**What to build:**
- Frontend: Camera-based barcode scanner component
- Frontend: Scan button on plot list page
- Frontend: Match scanned value against plot_id, navigate to observation entry
- Support Code 128, QR Code formats (most common for plot labels)

**Tech:** `@aspect-software/barcode-reader` or `html5-qrcode`

---

### F5.4: Weather Integration
**Priority:** Medium | **Effort:** Small

Auto-record temperature and humidity at observation time.

**What to build:**
- Backend: Add `temperature` and `humidity` fields to Observation model (nullable)
- Backend: Integrate with Open-Meteo API (free, no API key needed) or OpenWeatherMap
- Backend: Auto-fetch weather for lat/lng at observation time (depends on F5.2)
- Alternatively: frontend fetches weather and sends with observation
- Display weather on observation entry and in exports

**Tech:** Open-Meteo API (free)

---

### F5.5: API Access for R/Python
**Priority:** Medium | **Effort:** Small

Formalize the REST API for programmatic access.

**What to build:**
- API key authentication (separate from user JWT) for script access
- Rate limiting middleware
- Documented API examples in Python (`requests`) and R (`httr2`)
- OpenAPI spec export for client generation
- Endpoint: `POST /auth/api-keys` to generate API keys

**Note:** Swagger docs at `/docs` already exist — this is about making it production-safe.

---

## V2.0 — Advanced Features

### F6.1: ML Disease Scoring
**Priority:** High | **Effort:** Large

Suggest ergot severity score from an uploaded panicle photo.

**What to build:**
- Collect and label training dataset (panicle images at each severity level)
- Train image classification model (ResNet or EfficientNet, fine-tuned)
- Backend: ML inference endpoint `POST /ml/predict-severity`
- Backend: Return predicted score + confidence percentage
- Frontend: "Auto-score" button that captures photo → sends to ML → suggests score
- User confirms or overrides the suggestion

**Tech:** PyTorch or TensorFlow, ONNX Runtime for inference

---

### F6.2: Statistical Analysis
**Priority:** Medium | **Effort:** Medium

Built-in ANOVA and correlation analysis.

**What to build:**
- Backend: `GET /trials/{id}/analysis` endpoint
- One-way ANOVA: severity by genotype
- Pearson correlation: severity vs. height, severity vs. flowering date
- Return F-statistic, p-value, R-squared
- Frontend: Analysis page with results table
- Interpretation helpers ("Significant difference between genotypes at p < 0.05")

**Tech:** scipy.stats, statsmodels

---

### F6.3: BrAPI Integration
**Priority:** High | **Effort:** Medium

Connect to BreedBase and other BrAPI-compatible systems.

**What to build:**
- Implement BrAPI v2.1 endpoints: `/brapi/v2/trials`, `/brapi/v2/observations`
- Import trials/plots from external BrAPI sources
- Export observations in BrAPI format
- Configurable BrAPI server URL in settings

**Spec:** https://brapi.org/specification

---

### Multi-Crop Support
**Priority:** Medium | **Effort:** Medium

Extend beyond sorghum to cotton, peanut, corn.

**What to build:**
- Backend: TraitDefinition model (name, type, unit, validation, crop)
- Backend: CRUD endpoints for custom traits
- Frontend: Trait configuration UI per trial
- Pre-built trait templates per crop (sorghum, cotton, peanut, corn)
- Remove hardcoded trait names from code; make data-driven

---

### UGA SSO Integration
**Priority:** Low | **Effort:** Small | **Depends on:** F4.2

Login with UGA MyID credentials.

**What to build:**
- SAML or OAuth2 integration with UGA's CAS/Shibboleth IdP
- Auto-create user on first SSO login
- Link SSO identity to local user account
- Fallback to email/password login for non-UGA users

---

## Priority Matrix

```
                    High Impact
                        │
    ┌───────────────────┼───────────────────┐
    │  Offline (F4.1)   │  Auth (F4.2)      │
    │  Cloud Deploy     │  Image Cap (F5.1) │
    │                   │  ML Scoring (F6.1)│
    │───────────────────┼───────────────────│
    │  GPS (F5.2)       │  Excel (F4.6)     │
    │  Weather (F5.4)   │  Teams (F4.3)     │
    │  UGA SSO          │  Barcode (F5.3)   │
    │                   │  BrAPI (F6.3)     │
    └───────────────────┼───────────────────┘
        Low Effort      │      High Effort
                    Low Impact
```

## Suggested Implementation Order

1. **Cloud Deployment** — unblocks everything (device testing, advisor access)
2. **User Auth (F4.2)** — prerequisite for teams and production use
3. **Excel Export (F4.6)** — quick win, researchers love xlsx
4. **GPS Tagging (F5.2)** — small effort, high value for field use
5. **Team Collaboration (F4.3)** — enables multi-user
6. **Image Capture (F5.1)** — big value for documentation
7. **Offline Support (F4.1)** — hardest but most impactful for field use
8. **Weather (F5.4)** — easy add-on once GPS exists
9. **Barcode Scanning (F5.3)** — nice-to-have for large trials
10. **Statistical Analysis (F6.2)** — after enough data collected
11. **API Access (F5.5)** — for power users with R/Python workflows
12. **Multi-Crop Support** — when expanding to other labs
13. **ML Disease Scoring (F6.1)** — needs training data first
14. **BrAPI Integration (F6.3)** — for interoperability
15. **UGA SSO** — last, only needed for institutional deployment
