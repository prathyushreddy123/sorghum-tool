from datetime import date, datetime
from typing import Literal

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
    created_at: datetime

    model_config = {"from_attributes": True}


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse


# --- Trial ---

class TrialCreate(BaseModel):
    name: str
    crop: str = "sorghum"
    location: str
    start_date: date
    end_date: date | None = None


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


# --- Plot ---

class PlotCreate(BaseModel):
    plot_id: str
    genotype: str
    rep: int
    row: int
    column: int
    notes: str | None = None


class PlotResponse(BaseModel):
    id: int
    trial_id: int
    plot_id: str
    genotype: str
    rep: int
    row: int
    column: int
    notes: str | None
    has_observations: bool = False

    model_config = {"from_attributes": True}


class PlotImportResponse(BaseModel):
    imported: int
    errors: list[str]


# --- Observation ---

TraitName = Literal["ergot_severity", "flowering_date", "plant_height"]


class ObservationCreate(BaseModel):
    plot_id: int
    trait_name: TraitName
    value: str
    notes: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    temperature: float | None = None
    humidity: float | None = None


class ObservationBulkItem(BaseModel):
    trait_name: TraitName
    value: str
    notes: str | None = None
    latitude: float | None = None
    longitude: float | None = None
    temperature: float | None = None
    humidity: float | None = None


class ObservationBulkCreate(BaseModel):
    observations: list[ObservationBulkItem]


class ObservationUpdate(BaseModel):
    value: str | None = None
    notes: str | None = None


class ObservationResponse(BaseModel):
    id: int
    plot_id: int
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


# --- Stats ---

class NumericStats(BaseModel):
    count: int = 0
    mean: float | None = None
    sd: float | None = None
    min: float | None = None
    max: float | None = None


class DateStats(BaseModel):
    count: int = 0
    earliest: str | None = None
    latest: str | None = None


class TraitStats(BaseModel):
    ergot_severity: NumericStats = NumericStats()
    plant_height: NumericStats = NumericStats()
    flowering_date: DateStats = DateStats()


class SeverityDistributionItem(BaseModel):
    score: int
    count: int


class TrialStatsResponse(BaseModel):
    total_plots: int
    scored_plots: int
    traits: TraitStats
    ergot_distribution: list[SeverityDistributionItem] = []


# --- Heatmap ---

class HeatmapCell(BaseModel):
    plot_id: str
    plot_pk: int
    row: int
    column: int
    genotype: str
    ergot_severity: int | None = None


class HeatmapResponse(BaseModel):
    rows: int
    columns: int
    cells: list[HeatmapCell]


# --- Next unscored ---

class NextUnscoredResponse(BaseModel):
    next_plot_id: int | None
