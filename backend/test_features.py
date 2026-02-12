"""
Tests for post-MVP features and V1.2 Enhanced Collection features.
"""
import io
import os
import shutil
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

import database
from database import Base, get_db
from main import app

# Use in-memory SQLite for tests
TEST_DB_URL = "sqlite:///./test_sorghum.db"
engine = create_engine(TEST_DB_URL, connect_args={"check_same_thread": False})
TestSession = sessionmaker(autocommit=False, autoflush=False, bind=engine)


def override_get_db():
    db = TestSession()
    try:
        yield db
    finally:
        db.close()


app.dependency_overrides[get_db] = override_get_db
# Override SessionLocal so middleware also uses test DB
database.SessionLocal = TestSession
client = TestClient(app)


@pytest.fixture(autouse=True)
def setup_db():
    """Create tables before each test and drop after."""
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)
    # Clean up uploads directory
    upload_dir = os.path.join(os.path.dirname(__file__), "uploads")
    if os.path.exists(upload_dir):
        shutil.rmtree(upload_dir)


# ── Helpers ──────────────────────────────────────────────────────────

def create_trial(name="Test Trial"):
    r = client.post("/trials", json={
        "name": name,
        "location": "Tifton, GA",
        "start_date": "2026-04-01",
    })
    assert r.status_code == 201
    return r.json()


def import_csv(trial_id: int, csv_text: str):
    r = client.post(
        f"/trials/{trial_id}/plots/import",
        files={"file": ("plots.csv", io.BytesIO(csv_text.encode()), "text/csv")},
    )
    assert r.status_code == 200
    return r.json()


SAMPLE_CSV = """plot_id,genotype,rep,row,column
T1-R1-C1,IS8525,1,1,1
T1-R1-C2,IS14131,1,1,2
T1-R1-C3,ATx623,1,1,3
T1-R2-C1,IS8525,2,2,1
T1-R2-C2,IS14131,2,2,2
T1-R2-C3,ATx623,2,2,3
"""


def score_plot(plot_id: int, severity: int, height: int = 150, flowering: str = "2026-06-15"):
    obs = [
        {"trait_name": "ergot_severity", "value": str(severity)},
        {"trait_name": "plant_height", "value": str(height)},
        {"trait_name": "flowering_date", "value": flowering},
    ]
    r = client.post(f"/plots/{plot_id}/observations/bulk", json={"observations": obs})
    assert r.status_code == 200
    return r.json()


# ═══════════════════════════════════════════════════════════════════════
# Feature 1: Delete Trial/Plot
# ═══════════════════════════════════════════════════════════════════════

class TestDeleteTrial:
    def test_delete_empty_trial(self):
        trial = create_trial()
        r = client.delete(f"/trials/{trial['id']}")
        assert r.status_code == 200
        assert r.json() == {"success": True}
        # Verify gone
        r = client.get(f"/trials/{trial['id']}")
        assert r.status_code == 404

    def test_delete_trial_cascades_plots_and_observations(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        # Get first plot and score it
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=3)
        # Delete trial
        r = client.delete(f"/trials/{trial['id']}")
        assert r.status_code == 200
        # Plots are gone
        r = client.get(f"/trials/{trial['id']}/plots")
        assert r.status_code == 404  # trial not found

    def test_delete_nonexistent_trial(self):
        r = client.delete("/trials/9999")
        assert r.status_code == 404


class TestDeletePlot:
    def test_delete_plot(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        plot_id = plots[0]["id"]
        r = client.delete(f"/trials/{trial['id']}/plots/{plot_id}")
        assert r.status_code == 200
        assert r.json() == {"success": True}
        # Verify count decreased
        plots_after = client.get(f"/trials/{trial['id']}/plots").json()
        assert len(plots_after) == len(plots) - 1

    def test_delete_scored_plot_cascades_observations(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        plot_id = plots[0]["id"]
        score_plot(plot_id, severity=4)
        # Verify observations exist
        obs = client.get(f"/plots/{plot_id}/observations").json()
        assert len(obs) == 3
        # Delete plot
        r = client.delete(f"/trials/{trial['id']}/plots/{plot_id}")
        assert r.status_code == 200
        # Plot is gone — observations endpoint returns empty or 404
        obs_after = client.get(f"/plots/{plot_id}/observations")
        if obs_after.status_code == 200:
            assert len(obs_after.json()) == 0
        else:
            # Plot no longer exists, so endpoint may 404
            assert obs_after.status_code == 404

    def test_delete_plot_wrong_trial(self):
        trial1 = create_trial("Trial A")
        trial2 = create_trial("Trial B")
        import_csv(trial1["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial1['id']}/plots").json()
        # Try to delete trial1's plot from trial2
        r = client.delete(f"/trials/{trial2['id']}/plots/{plots[0]['id']}")
        assert r.status_code == 404

    def test_delete_nonexistent_plot(self):
        trial = create_trial()
        r = client.delete(f"/trials/{trial['id']}/plots/9999")
        assert r.status_code == 404

    def test_delete_plot_nonexistent_trial(self):
        r = client.delete("/trials/9999/plots/1")
        assert r.status_code == 404


# ═══════════════════════════════════════════════════════════════════════
# Feature 2: Plot Counts via Stats (used by frontend for tab counts)
# ═══════════════════════════════════════════════════════════════════════

class TestPlotCounts:
    def test_stats_returns_total_and_scored_counts(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        # Score 2 of 6 plots
        score_plot(plots[0]["id"], severity=2)
        score_plot(plots[1]["id"], severity=4)
        stats = client.get(f"/trials/{trial['id']}/stats").json()
        assert stats["total_plots"] == 6
        assert stats["scored_plots"] == 2
        # Derived: unscored = 6 - 2 = 4

    def test_counts_update_after_delete(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=3)
        # Delete scored plot
        client.delete(f"/trials/{trial['id']}/plots/{plots[0]['id']}")
        stats = client.get(f"/trials/{trial['id']}/stats").json()
        assert stats["total_plots"] == 5
        assert stats["scored_plots"] == 0

    def test_counts_zero_for_empty_trial(self):
        trial = create_trial()
        stats = client.get(f"/trials/{trial['id']}/stats").json()
        assert stats["total_plots"] == 0
        assert stats["scored_plots"] == 0

    def test_search_filter_scored(self):
        """The search and scored filters work on the plots endpoint."""
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=1)
        # Filter: scored only
        scored = client.get(f"/trials/{trial['id']}/plots?scored=true").json()
        assert len(scored) == 1
        # Filter: unscored only
        unscored = client.get(f"/trials/{trial['id']}/plots?scored=false").json()
        assert len(unscored) == 5
        # Search by genotype
        searched = client.get(f"/trials/{trial['id']}/plots?search=IS8525").json()
        assert all("IS8525" in p["genotype"] for p in searched)


# ═══════════════════════════════════════════════════════════════════════
# Feature 3: Severity Histogram (ergot_distribution in stats)
# ═══════════════════════════════════════════════════════════════════════

class TestSeverityHistogram:
    def test_ergot_distribution_present_in_stats(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        stats = client.get(f"/trials/{trial['id']}/stats").json()
        assert "ergot_distribution" in stats
        assert len(stats["ergot_distribution"]) == 5

    def test_ergot_distribution_empty_when_no_observations(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        stats = client.get(f"/trials/{trial['id']}/stats").json()
        for item in stats["ergot_distribution"]:
            assert item["count"] == 0

    def test_ergot_distribution_counts_correct(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        # Score: 2 plots severity 1, 1 plot severity 3, 1 plot severity 5
        score_plot(plots[0]["id"], severity=1)
        score_plot(plots[1]["id"], severity=1)
        score_plot(plots[2]["id"], severity=3)
        score_plot(plots[3]["id"], severity=5)

        stats = client.get(f"/trials/{trial['id']}/stats").json()
        dist = {d["score"]: d["count"] for d in stats["ergot_distribution"]}
        assert dist[1] == 2
        assert dist[2] == 0
        assert dist[3] == 1
        assert dist[4] == 0
        assert dist[5] == 1

    def test_distribution_scores_always_1_through_5(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=3)  # Only one score
        stats = client.get(f"/trials/{trial['id']}/stats").json()
        scores = [d["score"] for d in stats["ergot_distribution"]]
        assert scores == [1, 2, 3, 4, 5]

    def test_distribution_updates_after_plot_delete(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=2)
        score_plot(plots[1]["id"], severity=2)
        # Delete one scored plot
        client.delete(f"/trials/{trial['id']}/plots/{plots[0]['id']}")
        stats = client.get(f"/trials/{trial['id']}/stats").json()
        dist = {d["score"]: d["count"] for d in stats["ergot_distribution"]}
        assert dist[2] == 1  # Down from 2


# ═══════════════════════════════════════════════════════════════════════
# Feature 4: Heatmap View
# ═══════════════════════════════════════════════════════════════════════

class TestHeatmap:
    def test_heatmap_returns_correct_structure(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        r = client.get(f"/trials/{trial['id']}/heatmap")
        assert r.status_code == 200
        data = r.json()
        assert "rows" in data
        assert "columns" in data
        assert "cells" in data

    def test_heatmap_dimensions(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        data = client.get(f"/trials/{trial['id']}/heatmap").json()
        assert data["rows"] == 2  # 2 rows in CSV
        assert data["columns"] == 3  # 3 columns in CSV
        assert len(data["cells"]) == 6

    def test_heatmap_cell_fields(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        data = client.get(f"/trials/{trial['id']}/heatmap").json()
        cell = data["cells"][0]
        assert "plot_id" in cell
        assert "plot_pk" in cell
        assert "row" in cell
        assert "column" in cell
        assert "genotype" in cell
        assert "ergot_severity" in cell

    def test_heatmap_unscored_shows_null(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        data = client.get(f"/trials/{trial['id']}/heatmap").json()
        for cell in data["cells"]:
            assert cell["ergot_severity"] is None

    def test_heatmap_scored_shows_severity(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=3)
        data = client.get(f"/trials/{trial['id']}/heatmap").json()
        scored_cells = [c for c in data["cells"] if c["ergot_severity"] is not None]
        assert len(scored_cells) == 1
        assert scored_cells[0]["ergot_severity"] == 3
        assert scored_cells[0]["plot_pk"] == plots[0]["id"]

    def test_heatmap_mixed_scores(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=1)
        score_plot(plots[1]["id"], severity=4)
        score_plot(plots[2]["id"], severity=5)
        data = client.get(f"/trials/{trial['id']}/heatmap").json()
        scored = {c["plot_pk"]: c["ergot_severity"] for c in data["cells"] if c["ergot_severity"]}
        assert scored[plots[0]["id"]] == 1
        assert scored[plots[1]["id"]] == 4
        assert scored[plots[2]["id"]] == 5

    def test_heatmap_empty_trial(self):
        trial = create_trial()
        data = client.get(f"/trials/{trial['id']}/heatmap").json()
        assert data["rows"] == 0
        assert data["columns"] == 0
        assert data["cells"] == []

    def test_heatmap_nonexistent_trial(self):
        r = client.get("/trials/9999/heatmap")
        assert r.status_code == 404

    def test_heatmap_updates_after_delete(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        score_plot(plots[0]["id"], severity=2)
        # Delete scored plot
        client.delete(f"/trials/{trial['id']}/plots/{plots[0]['id']}")
        data = client.get(f"/trials/{trial['id']}/heatmap").json()
        assert len(data["cells"]) == 5
        scored = [c for c in data["cells"] if c["ergot_severity"] is not None]
        assert len(scored) == 0


# ═══════════════════════════════════════════════════════════════════════
# Feature 5: Reference Images (backend schema validation)
# The actual SVG files are in frontend/public/images/ergot/
# Here we just verify the API contracts used by the reference modal
# ═══════════════════════════════════════════════════════════════════════

class TestReferenceImageSupport:
    """Verify the ergot severity scoring contract that reference images depend on."""

    def test_severity_values_1_through_5_accepted(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        for sev in range(1, 6):
            r = client.post("/observations", json={
                "plot_id": plots[sev - 1]["id"],
                "trait_name": "ergot_severity",
                "value": str(sev),
            })
            assert r.status_code == 201, f"Severity {sev} should be valid"

    def test_severity_value_0_rejected(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        r = client.post("/observations", json={
            "plot_id": plots[0]["id"],
            "trait_name": "ergot_severity",
            "value": "0",
        })
        assert r.status_code in (400, 422)

    def test_severity_value_6_rejected(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        r = client.post("/observations", json={
            "plot_id": plots[0]["id"],
            "trait_name": "ergot_severity",
            "value": "6",
        })
        assert r.status_code in (400, 422)


# ═══════════════════════════════════════════════════════════════════════
# Integration: Full workflow test
# ═══════════════════════════════════════════════════════════════════════

class TestFullWorkflow:
    def test_create_score_view_stats_heatmap_delete(self):
        """End-to-end: create trial → import → score → check stats/histogram/heatmap → delete."""
        # 1. Create trial
        trial = create_trial("E2E Trial")
        tid = trial["id"]

        # 2. Import plots
        result = import_csv(tid, SAMPLE_CSV)
        assert result["imported"] == 6

        # 3. Score plots with varying severity
        plots = client.get(f"/trials/{tid}/plots").json()
        score_plot(plots[0]["id"], severity=1)
        score_plot(plots[1]["id"], severity=2)
        score_plot(plots[2]["id"], severity=3)
        score_plot(plots[3]["id"], severity=4)

        # 4. Check stats: counts and distribution
        stats = client.get(f"/trials/{tid}/stats").json()
        assert stats["total_plots"] == 6
        assert stats["scored_plots"] == 4
        dist = {d["score"]: d["count"] for d in stats["ergot_distribution"]}
        assert dist == {1: 1, 2: 1, 3: 1, 4: 1, 5: 0}

        # 5. Check heatmap
        heatmap = client.get(f"/trials/{tid}/heatmap").json()
        assert len(heatmap["cells"]) == 6
        scored_cells = [c for c in heatmap["cells"] if c["ergot_severity"] is not None]
        assert len(scored_cells) == 4

        # 6. Delete a plot, verify updates
        client.delete(f"/trials/{tid}/plots/{plots[0]['id']}")
        stats2 = client.get(f"/trials/{tid}/stats").json()
        assert stats2["total_plots"] == 5
        assert stats2["scored_plots"] == 3
        dist2 = {d["score"]: d["count"] for d in stats2["ergot_distribution"]}
        assert dist2[1] == 0  # Deleted the severity-1 plot

        heatmap2 = client.get(f"/trials/{tid}/heatmap").json()
        assert len(heatmap2["cells"]) == 5

        # 7. Delete trial, verify cascade
        client.delete(f"/trials/{tid}")
        r = client.get(f"/trials/{tid}")
        assert r.status_code == 404

        # 8. Export before deletion should work (test on a fresh trial)
        trial2 = create_trial("Export Trial")
        import_csv(trial2["id"], SAMPLE_CSV)
        plots2 = client.get(f"/trials/{trial2['id']}/plots").json()
        score_plot(plots2[0]["id"], severity=5)
        r = client.get(f"/trials/{trial2['id']}/export")
        assert r.status_code == 200
        assert "text/csv" in r.headers["content-type"]
        csv_lines = r.text.strip().split("\n")
        assert len(csv_lines) == 7  # header + 6 data rows


# ═══════════════════════════════════════════════════════════════════════
# Feature F5.2: GPS Tagging
# ═══════════════════════════════════════════════════════════════════════

class TestGPSTagging:
    def test_bulk_save_with_gps(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        obs = [
            {"trait_name": "ergot_severity", "value": "3",
             "latitude": 31.4505, "longitude": -83.5085},
        ]
        r = client.post(f"/plots/{plots[0]['id']}/observations/bulk", json={"observations": obs})
        assert r.status_code == 200
        data = r.json()
        assert data[0]["latitude"] == pytest.approx(31.4505)
        assert data[0]["longitude"] == pytest.approx(-83.5085)

    def test_bulk_save_without_gps(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        obs = [{"trait_name": "ergot_severity", "value": "2"}]
        r = client.post(f"/plots/{plots[0]['id']}/observations/bulk", json={"observations": obs})
        assert r.status_code == 200
        assert r.json()[0]["latitude"] is None
        assert r.json()[0]["longitude"] is None

    def test_single_observation_with_gps(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        r = client.post("/observations", json={
            "plot_id": plots[0]["id"],
            "trait_name": "ergot_severity",
            "value": "4",
            "latitude": 31.45,
            "longitude": -83.51,
        })
        assert r.status_code == 201
        assert r.json()["latitude"] == pytest.approx(31.45)
        assert r.json()["longitude"] == pytest.approx(-83.51)

    def test_gps_in_csv_export(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        obs = [
            {"trait_name": "ergot_severity", "value": "3",
             "latitude": 31.45, "longitude": -83.51},
        ]
        client.post(f"/plots/{plots[0]['id']}/observations/bulk", json={"observations": obs})
        r = client.get(f"/trials/{trial['id']}/export")
        assert "latitude" in r.text
        assert "longitude" in r.text
        assert "31.45" in r.text
        assert "-83.51" in r.text


# ═══════════════════════════════════════════════════════════════════════
# Feature F5.4: Weather Integration
# ═══════════════════════════════════════════════════════════════════════

class TestWeatherIntegration:
    def test_bulk_save_with_weather(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        obs = [{
            "trait_name": "ergot_severity", "value": "3",
            "latitude": 31.45, "longitude": -83.51,
            "temperature": 32.5, "humidity": 65.0,
        }]
        r = client.post(f"/plots/{plots[0]['id']}/observations/bulk", json={"observations": obs})
        assert r.status_code == 200
        assert r.json()[0]["temperature"] == pytest.approx(32.5)
        assert r.json()[0]["humidity"] == pytest.approx(65.0)

    def test_bulk_save_without_weather(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        obs = [{"trait_name": "ergot_severity", "value": "2"}]
        r = client.post(f"/plots/{plots[0]['id']}/observations/bulk", json={"observations": obs})
        assert r.status_code == 200
        assert r.json()[0]["temperature"] is None
        assert r.json()[0]["humidity"] is None

    def test_weather_in_csv_export(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        obs = [{
            "trait_name": "ergot_severity", "value": "3",
            "temperature": 29.0, "humidity": 72.0,
        }]
        client.post(f"/plots/{plots[0]['id']}/observations/bulk", json={"observations": obs})
        r = client.get(f"/trials/{trial['id']}/export")
        assert "temperature" in r.text
        assert "humidity" in r.text
        assert "29.0" in r.text
        assert "72.0" in r.text


# ═══════════════════════════════════════════════════════════════════════
# Feature F5.1: Image Capture
# ═══════════════════════════════════════════════════════════════════════

# Fake JPEG-like bytes for testing (starts with JPEG magic bytes)
TINY_JPEG = b"\xff\xd8\xff\xe0" + b"\x00" * 200 + b"\xff\xd9"


class TestImageCapture:
    def test_upload_image(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        r = client.post(
            f"/plots/{plots[0]['id']}/images",
            files={"file": ("test.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")},
        )
        assert r.status_code == 201
        data = r.json()
        assert data["plot_id"] == plots[0]["id"]
        assert data["original_name"] == "test.jpg"
        assert "filename" in data

    def test_list_images(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        client.post(
            f"/plots/{plots[0]['id']}/images",
            files={"file": ("test.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")},
        )
        r = client.get(f"/plots/{plots[0]['id']}/images")
        assert r.status_code == 200
        assert len(r.json()) == 1

    def test_delete_image(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        upload = client.post(
            f"/plots/{plots[0]['id']}/images",
            files={"file": ("test.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")},
        )
        img_id = upload.json()["id"]
        r = client.delete(f"/images/{img_id}")
        assert r.status_code == 200
        imgs = client.get(f"/plots/{plots[0]['id']}/images").json()
        assert len(imgs) == 0

    def test_reject_non_image(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        r = client.post(
            f"/plots/{plots[0]['id']}/images",
            files={"file": ("test.txt", io.BytesIO(b"hello"), "text/plain")},
        )
        assert r.status_code == 422

    def test_images_cascade_on_plot_delete(self):
        trial = create_trial()
        import_csv(trial["id"], SAMPLE_CSV)
        plots = client.get(f"/trials/{trial['id']}/plots").json()
        client.post(
            f"/plots/{plots[0]['id']}/images",
            files={"file": ("test.jpg", io.BytesIO(TINY_JPEG), "image/jpeg")},
        )
        # Delete the plot
        client.delete(f"/trials/{trial['id']}/plots/{plots[0]['id']}")
        # Plot is gone, images should be cascade-deleted
        r = client.get(f"/plots/{plots[0]['id']}/images")
        # Expect 404 (plot not found) or empty list
        assert r.status_code in (200, 404)
        if r.status_code == 200:
            assert len(r.json()) == 0


# ═══════════════════════════════════════════════════════════════════════
# Feature F5.5: API Access for R/Python
# ═══════════════════════════════════════════════════════════════════════

class TestAPIKeys:
    def test_create_api_key(self):
        r = client.post("/auth/api-keys", json={"user_label": "My R Script"})
        assert r.status_code == 201
        data = r.json()
        assert "raw_key" in data
        assert data["raw_key"].startswith("sf_")
        assert data["user_label"] == "My R Script"
        assert data["is_active"] is True

    def test_list_api_keys(self):
        client.post("/auth/api-keys", json={"user_label": "Key 1"})
        client.post("/auth/api-keys", json={"user_label": "Key 2"})
        r = client.get("/auth/api-keys")
        assert r.status_code == 200
        assert len(r.json()) == 2

    def test_revoke_api_key(self):
        create_resp = client.post("/auth/api-keys", json={"user_label": "Temp"})
        key_id = create_resp.json()["id"]
        r = client.delete(f"/auth/api-keys/{key_id}")
        assert r.status_code == 200
        keys = client.get("/auth/api-keys").json()
        assert all(k["id"] != key_id for k in keys)

    def test_api_key_auth_valid(self):
        create_resp = client.post("/auth/api-keys", json={"user_label": "Test"})
        raw_key = create_resp.json()["raw_key"]
        r = client.get("/trials", headers={"X-API-Key": raw_key})
        assert r.status_code == 200

    def test_api_key_auth_invalid(self):
        r = client.get("/trials", headers={"X-API-Key": "sf_invalidkey"})
        assert r.status_code == 401

    def test_api_key_auth_revoked(self):
        create_resp = client.post("/auth/api-keys", json={"user_label": "Revoke Test"})
        raw_key = create_resp.json()["raw_key"]
        key_id = create_resp.json()["id"]
        client.delete(f"/auth/api-keys/{key_id}")
        r = client.get("/trials", headers={"X-API-Key": raw_key})
        assert r.status_code == 401

    def test_no_api_key_still_works(self):
        """Browser access (no X-API-Key header) should still work."""
        r = client.get("/trials")
        assert r.status_code == 200
