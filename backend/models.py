from datetime import date, datetime

from sqlalchemy import Boolean, Date, DateTime, Float, ForeignKey, Index, Integer, String, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column, relationship
from sqlalchemy.sql import func

from database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    email: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    hashed_password: Mapped[str] = mapped_column(String, nullable=False)
    name: Mapped[str] = mapped_column(String, nullable=False)
    role: Mapped[str] = mapped_column(String, default="admin")  # admin|collector — informational label only
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    trials: Mapped[list["Trial"]] = relationship(back_populates="owner")
    team_memberships: Mapped[list["TeamMember"]] = relationship(back_populates="user")


class Team(Base):
    __tablename__ = "teams"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    invite_code: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    created_by: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    creator: Mapped["User"] = relationship()
    members: Mapped[list["TeamMember"]] = relationship(back_populates="team", cascade="all, delete-orphan")
    trials: Mapped[list["Trial"]] = relationship(back_populates="team")


class TeamMember(Base):
    __tablename__ = "team_members"
    __table_args__ = (UniqueConstraint("team_id", "user_id", name="uq_team_member"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    team_id: Mapped[int] = mapped_column(Integer, ForeignKey("teams.id"), nullable=False, index=True)
    user_id: Mapped[int] = mapped_column(Integer, ForeignKey("users.id"), nullable=False, index=True)
    joined_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    team: Mapped["Team"] = relationship(back_populates="members")
    user: Mapped["User"] = relationship(back_populates="team_memberships")


class Trait(Base):
    """A phenotypic trait definition — lives in the global library and is shared across trials."""
    __tablename__ = "traits"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False, unique=True)   # slug, e.g. "ergot_severity"
    label: Mapped[str] = mapped_column(String, nullable=False)               # display name, e.g. "Ergot Severity"
    data_type: Mapped[str] = mapped_column(String, nullable=False)           # integer|float|date|categorical|text
    unit: Mapped[str | None] = mapped_column(String, nullable=True)          # e.g. "cm", "kg/plot", "°Bx"
    min_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    max_value: Mapped[float | None] = mapped_column(Float, nullable=True)
    categories: Mapped[str | None] = mapped_column(String, nullable=True)    # JSON array e.g. '["1","2","3","4","5"]'
    category_labels: Mapped[str | None] = mapped_column(String, nullable=True)  # JSON array of display labels
    description: Mapped[str | None] = mapped_column(String, nullable=True)
    crop_hint: Mapped[str | None] = mapped_column(String, nullable=True)     # e.g. "sorghum,maize" — suggested crops
    is_system: Mapped[bool] = mapped_column(Boolean, default=False)          # system traits can't be deleted
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    trial_traits: Mapped[list["TrialTrait"]] = relationship(back_populates="trait")
    observations: Mapped[list["Observation"]] = relationship(back_populates="trait")


class Trial(Base):
    __tablename__ = "trials"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    crop: Mapped[str] = mapped_column(String, default="sorghum")
    location: Mapped[str] = mapped_column(String, nullable=False)
    walk_mode: Mapped[str] = mapped_column(String, default="row_by_row")  # row_by_row|serpentine|column_by_column|free
    start_date: Mapped[date] = mapped_column(Date, nullable=False)
    end_date: Mapped[date | None] = mapped_column(Date, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    user_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("users.id"), nullable=True)
    team_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("teams.id"), nullable=True, index=True)

    owner: Mapped["User | None"] = relationship(back_populates="trials")
    team: Mapped["Team | None"] = relationship(back_populates="trials")
    plots: Mapped[list["Plot"]] = relationship(back_populates="trial", cascade="all, delete-orphan")
    trial_traits: Mapped[list["TrialTrait"]] = relationship(
        back_populates="trial", cascade="all, delete-orphan", order_by="TrialTrait.display_order"
    )
    scoring_rounds: Mapped[list["ScoringRound"]] = relationship(
        back_populates="trial", cascade="all, delete-orphan", order_by="ScoringRound.created_at"
    )


class TrialTrait(Base):
    """Join table linking a Trait to a Trial, with trial-specific ordering."""
    __tablename__ = "trial_traits"
    __table_args__ = (UniqueConstraint("trial_id", "trait_id", name="uq_trial_trait"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trial_id: Mapped[int] = mapped_column(Integer, ForeignKey("trials.id"), nullable=False, index=True)
    trait_id: Mapped[int] = mapped_column(Integer, ForeignKey("traits.id"), nullable=False)
    display_order: Mapped[int] = mapped_column(Integer, default=0)

    trial: Mapped["Trial"] = relationship(back_populates="trial_traits")
    trait: Mapped["Trait"] = relationship(back_populates="trial_traits")


class ScoringRound(Base):
    """A named collection session within a trial (e.g. 'Round 1', 'Flowering Stage')."""
    __tablename__ = "scoring_rounds"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trial_id: Mapped[int] = mapped_column(Integer, ForeignKey("trials.id"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String, nullable=False)
    scored_at: Mapped[date | None] = mapped_column(Date, nullable=True)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    trial: Mapped["Trial"] = relationship(back_populates="scoring_rounds")
    observations: Mapped[list["Observation"]] = relationship(back_populates="scoring_round")


class Plot(Base):
    __tablename__ = "plots"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trial_id: Mapped[int] = mapped_column(Integer, ForeignKey("trials.id"), nullable=False, index=True)
    plot_id: Mapped[str] = mapped_column(String, nullable=False)
    genotype: Mapped[str] = mapped_column(String, nullable=False)
    rep: Mapped[int] = mapped_column(Integer, nullable=False)
    row: Mapped[int] = mapped_column(Integer, nullable=False)
    column: Mapped[int] = mapped_column(Integer, nullable=False)
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    plot_status: Mapped[str] = mapped_column(String, default="active")  # active|skipped|flagged|border

    trial: Mapped["Trial"] = relationship(back_populates="plots")
    observations: Mapped[list["Observation"]] = relationship(
        back_populates="plot", cascade="all, delete-orphan"
    )
    images: Mapped[list["Image"]] = relationship(
        back_populates="plot", cascade="all, delete-orphan"
    )
    attributes: Mapped[list["PlotAttribute"]] = relationship(
        back_populates="plot", cascade="all, delete-orphan"
    )


class PlotAttribute(Base):
    """Custom key-value metadata for a plot beyond the fixed 5 fields."""
    __tablename__ = "plot_attributes"
    __table_args__ = (UniqueConstraint("plot_id", "key", name="uq_plot_attribute"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plot_id: Mapped[int] = mapped_column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    key: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)

    plot: Mapped["Plot"] = relationship(back_populates="attributes")


class Observation(Base):
    __tablename__ = "observations"
    __table_args__ = (
        Index('ix_observations_plot_id_round', 'plot_id', 'scoring_round_id'),
    )

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plot_id: Mapped[int] = mapped_column(Integer, ForeignKey("plots.id"), nullable=False, index=True)
    trait_id: Mapped[int | None] = mapped_column(Integer, ForeignKey("traits.id"), nullable=True, index=True)
    scoring_round_id: Mapped[int | None] = mapped_column(
        Integer, ForeignKey("scoring_rounds.id"), nullable=True, index=True
    )
    # trait_name kept for backward compat with existing data; new obs will populate both
    trait_name: Mapped[str] = mapped_column(String, nullable=False)
    value: Mapped[str] = mapped_column(String, nullable=False)
    recorded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    notes: Mapped[str | None] = mapped_column(String, nullable=True)
    latitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    longitude: Mapped[float | None] = mapped_column(Float, nullable=True)
    temperature: Mapped[float | None] = mapped_column(Float, nullable=True)
    humidity: Mapped[float | None] = mapped_column(Float, nullable=True)

    plot: Mapped["Plot"] = relationship(back_populates="observations")
    trait: Mapped["Trait | None"] = relationship(back_populates="observations")
    scoring_round: Mapped["ScoringRound | None"] = relationship(back_populates="observations")


class Image(Base):
    __tablename__ = "images"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    plot_id: Mapped[int] = mapped_column(Integer, ForeignKey("plots.id"), nullable=False)
    filename: Mapped[str] = mapped_column(String, nullable=False, unique=True)
    original_name: Mapped[str] = mapped_column(String, nullable=False)
    image_type: Mapped[str] = mapped_column(String, nullable=False, default="panicle")
    uploaded_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    plot: Mapped["Plot"] = relationship(back_populates="images")


class TrainingSample(Base):
    """A labeled image+trait_name+value tuple collected for model training."""
    __tablename__ = "training_samples"
    __table_args__ = (UniqueConstraint("image_id", "trait_name", name="uq_training_sample_trait"),)

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    image_id: Mapped[int] = mapped_column(Integer, ForeignKey("images.id"), nullable=False, index=True)
    trait_name: Mapped[str] = mapped_column(String, nullable=False)  # e.g. "ergot_severity"
    value: Mapped[str] = mapped_column(String, nullable=False)       # e.g. "3"
    source: Mapped[str] = mapped_column(String, nullable=False, default="user_label")  # user_label|ai_confirmed
    labeled_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())

    image: Mapped["Image"] = relationship()


class TrainingJob(Base):
    """A queued/running/completed model training job."""
    __tablename__ = "training_jobs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    trait_name: Mapped[str] = mapped_column(String, nullable=False)
    status: Mapped[str] = mapped_column(String, nullable=False, default="queued")  # queued|running|completed|failed|cancelled
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    started_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    config: Mapped[str | None] = mapped_column(String, nullable=True)         # JSON string
    metrics: Mapped[str | None] = mapped_column(String, nullable=True)        # JSON string
    model_path: Mapped[str | None] = mapped_column(String, nullable=True)
    error_message: Mapped[str | None] = mapped_column(String, nullable=True)
    sample_count: Mapped[int | None] = mapped_column(Integer, nullable=True)


class APIKey(Base):
    __tablename__ = "api_keys"

    id: Mapped[int] = mapped_column(Integer, primary_key=True, index=True)
    user_label: Mapped[str] = mapped_column(String, nullable=False)
    key_hash: Mapped[str] = mapped_column(String, nullable=False, unique=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    last_used_at: Mapped[datetime | None] = mapped_column(DateTime, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)
