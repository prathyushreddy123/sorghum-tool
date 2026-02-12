# Backend Specification

## Technology
- FastAPI (Python 3.11+)
- SQLAlchemy ORM
- SQLite database (single file: `sorghum.db`)
- Pydantic for validation

## Data Models

### Trial
```python
class Trial(Base):
    __tablename__ = "trials"
    
    id: int  # Primary key, auto-increment
    name: str  # Required, e.g., "Perennial Ergot Trial 2026"
    crop: str = "sorghum"  # Default to sorghum
    location: str  # Required, e.g., "Tifton, GA"
    start_date: date  # Required
    end_date: date | None  # Optional
    created_at: datetime  # Auto-set to now
    
    # Relationships
    plots: List[Plot]
```

### Plot
```python
class Plot(Base):
    __tablename__ = "plots"
    
    id: int  # Primary key, auto-increment
    trial_id: int  # Foreign key to Trial
    plot_id: str  # User-defined ID, e.g., "T1-R1-C5"
    genotype: str  # Required, e.g., "IS8525"
    rep: int  # Replication number
    row: int  # Row position
    column: int  # Column position
    notes: str | None  # Optional
    
    # Relationships
    trial: Trial
    observations: List[Observation]
```

### Observation
```python
class Observation(Base):
    __tablename__ = "observations"
    
    id: int  # Primary key, auto-increment
    plot_id: int  # Foreign key to Plot (internal ID, not plot_id string)
    trait_name: str  # One of: ergot_severity, flowering_date, plant_height
    value: str  # Stored as string, interpreted by trait type
    recorded_at: datetime  # Auto-set to now
    notes: str | None  # Optional
    
    # Relationships
    plot: Plot
```

## Hardcoded Traits (MVP)

| trait_name | Type | value format | Validation |
|------------|------|--------------|------------|
| ergot_severity | categorical | "1", "2", "3", "4", "5" | Must be 1-5 |
| flowering_date | date | "2026-06-15" (ISO format) | Valid date |
| plant_height | numeric | "142" (integer string) | 50-400 |

## API Endpoints

### Trials

```
GET /trials
  Response: List[TrialResponse]
  
POST /trials
  Body: { name, location, start_date, end_date?, crop? }
  Response: TrialResponse
  
GET /trials/{trial_id}
  Response: TrialResponse with plot_count, scored_count
  
DELETE /trials/{trial_id}
  Response: { success: true }
```

### Plots

```
GET /trials/{trial_id}/plots
  Query params: search? (filters by plot_id or genotype), scored? (true/false)
  Response: List[PlotResponse] with has_observations flag
  
POST /trials/{trial_id}/plots
  Body: { plot_id, genotype, rep, row, column, notes? }
  Response: PlotResponse
  
POST /trials/{trial_id}/plots/import
  Body: CSV file upload
  CSV headers: plot_id, genotype, rep, row, column
  Response: { imported: int, errors: List[str] }
  
GET /trials/{trial_id}/plots/{plot_id}/next-unscored
  Response: { next_plot_id: int | null }
  Returns the internal ID of the next plot (by row, then column) that has no observations
```

### Observations

```
GET /plots/{plot_id}/observations
  Response: List[ObservationResponse]
  
POST /observations
  Body: { plot_id, trait_name, value, notes? }
  Response: ObservationResponse
  Validation: Check trait_name is valid, value matches trait type
  
PUT /observations/{observation_id}
  Body: { value?, notes? }
  Response: ObservationResponse
  
POST /plots/{plot_id}/observations/bulk
  Body: { observations: List[{ trait_name, value, notes? }] }
  Response: List[ObservationResponse]
  Use this to save all traits for a plot at once
```

### Statistics & Export

```
GET /trials/{trial_id}/stats
  Response: {
    total_plots: int,
    scored_plots: int,
    traits: {
      ergot_severity: { count, mean, sd, min, max },
      flowering_date: { count, earliest, latest },
      plant_height: { count, mean, sd, min, max }
    }
  }
  
GET /trials/{trial_id}/export
  Response: CSV file download
  Columns: plot_id, genotype, rep, row, column, ergot_severity, flowering_date, plant_height, notes, recorded_at
  One row per plot, observations pivoted into columns
```

## File Structure

```
backend/
├── main.py              # FastAPI app, CORS config
├── database.py          # SQLite connection, Base
├── models.py            # SQLAlchemy models
├── schemas.py           # Pydantic schemas
├── crud.py              # Database operations
└── routers/
    ├── trials.py
    ├── plots.py
    ├── observations.py
    └── stats.py
```

## CORS Configuration

Allow all origins for MVP (localhost development):
```python
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
```

## Running

```bash
cd backend
pip install fastapi uvicorn sqlalchemy python-multipart
uvicorn main:app --reload --port 8000
```

Swagger UI at: http://localhost:8000/docs
