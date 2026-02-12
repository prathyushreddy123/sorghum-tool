"""Seed script: creates a demo trial with 20 plots and 12 pre-filled observations."""

import random
from datetime import date, datetime

from database import SessionLocal, engine, Base
from models import Trial, Plot, Observation

# Realistic sorghum genotype names
GENOTYPES = [
    "IS8525", "IS14131", "ATx623", "BTx623", "SC748-5",
    "Tx430", "RTx430", "SC170", "IS2205", "Tx2737",
]


def seed():
    Base.metadata.create_all(bind=engine)
    db = SessionLocal()

    # Check if data exists
    if db.query(Trial).first():
        print("Database already has data. Skipping seed.")
        db.close()
        return

    # Create trial
    trial = Trial(
        name="Perennial Ergot Trial 2026",
        crop="sorghum",
        location="Tifton, GA",
        start_date=date(2026, 4, 1),
        end_date=date(2026, 10, 31),
    )
    db.add(trial)
    db.flush()

    # Create 20 plots (4 rows x 5 columns, 2 reps of 10 genotypes)
    plots: list[Plot] = []
    plot_idx = 0
    for rep in range(1, 3):
        for row in range(1, 3):
            for col in range(1, 6):
                genotype = GENOTYPES[plot_idx % len(GENOTYPES)]
                plot = Plot(
                    trial_id=trial.id,
                    plot_id=f"T1-R{rep}{row}-C{col}",
                    genotype=genotype,
                    rep=rep,
                    row=(rep - 1) * 2 + row,
                    column=col,
                )
                db.add(plot)
                plots.append(plot)
                plot_idx += 1
    db.flush()

    # Score 12 of 20 plots with varied data
    random.seed(42)
    scored_plots = plots[:12]
    notes_map = {
        2: "Honeydew visible on lower panicle",
        7: "Border plot, wind damage",
        10: "Late flowering, vigorous growth",
    }

    for i, plot in enumerate(scored_plots):
        severity = random.choice([1, 1, 2, 2, 3, 3, 3, 4, 4, 5])
        height = random.randint(100, 250)
        flowering_offset = random.randint(0, 14)
        flowering = date(2026, 6, 8 + flowering_offset)

        db.add(Observation(
            plot_id=plot.id,
            trait_name="ergot_severity",
            value=str(severity),
            notes=notes_map.get(i),
        ))
        db.add(Observation(
            plot_id=plot.id,
            trait_name="plant_height",
            value=str(height),
        ))
        db.add(Observation(
            plot_id=plot.id,
            trait_name="flowering_date",
            value=flowering.isoformat(),
        ))

    db.commit()
    db.close()
    print(f"Seeded: 1 trial, {len(plots)} plots, {len(scored_plots)} scored")


if __name__ == "__main__":
    seed()
