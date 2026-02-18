from datetime import date, datetime

from pydantic import BaseModel, Field


# --- Auth ---

class UserRegister(BaseModel):
    email: str = Field(..., min_length=3)
    password: str = Field(..., min_length=6)
    name: str = Field(..., min_length=1)


class UserLogin(BaseModel):
    email: str
    password: str


class UserResponse(BaseModel):
    id: int
    email: str
    name: str
    role: str
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- Trait ---

class TraitCreate(BaseModel):
    name: str = Field(..., min_length=1)
    label: str = Field(..., min_length=1)
    data_type: str = Field(..., pattern="^(integer|float|date|categorical|text)$")
    unit: str | None = None
    min_value: float | None = None
    max_value: float | None = None
    categories: str | None = None        # JSON array string, e.g. '["1","2","3","4","5"]'
    category_labels: str | None = None   # JSON array string, e.g. '["None","Low","Moderate","High","Severe"]'
    description: str | None = None
    crop_hint: str | None = None


class TraitResponse(BaseModel):
    id: int
    name: str
    label: str
    data_type: str
    unit: str | None
    min_value: float | None
    max_value: float | None
    categories: str | None
    category_labels: str | None
    description: str | None
    crop_hint: str | None
    is_system: bool

    model_config = {"from_attributes": True}


# --- Trial Trait ---

class TrialTraitAdd(BaseModel):
    trait_id: int
    display_order: int = 0


class TrialTraitBulkAdd(BaseModel):
    trait_ids: list[int]


class TrialTraitReorder(BaseModel):
    ordered_trait_ids: list[int]  # trait IDs in desired display order


class TrialTraitResponse(BaseModel):
    id: int
    trial_id: int
    trait_id: int
    display_order: int
    trait: TraitResponse

    model_config = {"from_attributes": True}


# --- Scoring Round ---

class ScoringRoundCreate(BaseModel):
    name: str = Field(..., min_length=1)
    scored_at: date | None = None
    notes: str | None = None


class ScoringRoundUpdate(BaseModel):
    name: str | None = None
    scored_at: date | None = None
    notes: str | None = None


class ScoringRoundResponse(BaseModel):
    id: int
    trial_id: int
    name: str
    scored_at: date | None
    notes: str | None
    created_at: datetime
    scored_plots: int = 0    # computed: plots with ≥1 obs in this round
    total_plots: int = 0     # computed

    model_config = {"from_attributes": True}


# --- Trial ---

class TrialCreate(BaseModel):
    name: str
    crop: str = "sorghum"
    location: str
    start_date: date
    end_date: date | None = None
    trait_ids: list[int] = []              # traits to attach at creation
    first_round_name: str = "Round 1"     # name for the auto-created first scoring round


class TrialResponse(BaseModel):
    id: int
    name: str
    crop: str
    location: str
    start_date: date
    end_date: date | None
    created_at: datetime
    plot_count: int = 0
    scored_count: int = 0

    model_config = {"from_attributes": True}


class TrialCloneRequest(BaseModel):
    name: str
    location: str
    start_date: date
    end_date: date | None = None
    first_round_name: str = "Round 1"


# --- Plot ---

class PlotCreate(BaseModel):
    plot_id: str
    genotype: str
    rep: int
    row: int
    column: int
    notes: str | None = None


class PlotStatusUpdate(BaseModel):
    plot_status: str = Field(..., pattern="^(active|skipped|flagged|border)$")


class PlotResponse(BaseModel):
    id: int
    trial_id: int
    plot_id: str
    genotype: str
    rep: int
    row: int
    column: int
    notes: str | None
    plot_status: str
    has_observations: bool = False

    model_config = {"from_attributes": True}


class PlotImportResponse(BaseModel):
    imported: int
    errors: list[str]


# --- Plot Attribute ---

class PlotAttributeSet(BaseModel):
    key: str = Field(..., min_length=1)
    value: str


class PlotAttributeResponse(BaseModel):
    key: str
    value: str

    model_config = {"from_attributes": True}


# --- Observation ---

class ObservationCreate(BaseModel):
    plot_id: int
    trait_id: int | None = None          # preferred for new observations
    scoring_round_id: int | None = None  # preferred for new observations
    trait_name: str | None = None        # fallback for backward compat
    value: str
    notes: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    temperature: float | None = None
    humidity: float | None = None


class ObservationBulkItem(BaseModel):
    trait_id: int | None = None
    trait_name: str | None = None        # fallback
    value: str
    notes: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    temperature: float | None = None
    humidity: float | None = None


class ObservationBulkCreate(BaseModel):
    scoring_round_id: int | None = None
    observations: list[ObservationBulkItem]


class ObservationUpdate(BaseModel):
    value: str | None = None
    notes: str | None = None


class ObservationResponse(BaseModel):
    id: int
    plot_id: int
    trait_id: int | None
    scoring_round_id: int | None
    trait_name: str
    value: str
    recorded_at: datetime
    notes: str | None
    latitude: float | None = None
    longitude: float | None = None
    temperature: float | None = None
    humidity: float | None = None

    model_config = {"from_attributes": True}


# --- API Key ---

class APIKeyCreate(BaseModel):
    user_label: str = Field(..., min_length=1, max_length=100)


class APIKeyResponse(BaseModel):
    id: int
    user_label: str
    created_at: datetime
    last_used_at: datetime | None
    is_active: bool

    model_config = {"from_attributes": True}


class APIKeyCreateResponse(APIKeyResponse):
    """Returned only on creation — includes the raw key (shown once)."""
    raw_key: str


# --- Image ---

class ImageResponse(BaseModel):
    id: int
    plot_id: int
    filename: str
    original_name: str
    image_type: str
    uploaded_at: datetime

    model_config = {"from_attributes": True}


class SeverityPredictionResponse(BaseModel):
    severity: int = Field(..., ge=0, le=5)
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str
    provider: str


class HeightPredictionResponse(BaseModel):
    height_cm: int = Field(..., ge=0, le=400)
    confidence: float = Field(..., ge=0.0, le=1.0)
    reasoning: str
    provider: str


# --- Stats (dynamic, one entry per trait) ---

class DistributionItem(BaseModel):
    value: str
    label: str | None = None
    count: int


class TraitStatItem(BaseModel):
    trait_id: int
    trait_name: str
    trait_label: str
    data_type: str
    unit: str | None
    count: int          # number of scored plots for this trait
    total_plots: int
    # numeric aggregates (integer/float)
    mean: float | None = None
    sd: float | None = None
    min_value: float | None = None
    max_value: float | None = None
    # categorical distribution
    distribution: list[DistributionItem] | None = None
    # date range
    earliest: str | None = None
    latest: str | None = None


class TrialStatsResponse(BaseModel):
    trial_id: int
    round_id: int | None
    total_plots: int
    scored_plots: int   # plots with ≥1 observation in the given round
    traits: list[TraitStatItem]


# --- Heatmap ---

class HeatmapCell(BaseModel):
    plot_id: str
    plot_pk: int
    row: int
    column: int
    genotype: str
    plot_status: str
    value: str | None = None          # raw string value for selected trait in selected round
    numeric_value: float | None = None  # for color gradient


class HeatmapResponse(BaseModel):
    rows: int
    columns: int
    cells: list[HeatmapCell]
    trait: TraitResponse | None = None   # which trait is displayed
    round_id: int | None = None


# --- Next unscored ---

class NextUnscoredResponse(BaseModel):
    next_plot_id: int | None
