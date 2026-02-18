"""Seed the global trait library with crop-specific presets.

Runs automatically on startup (via main.py) if the traits table is empty.
Can also be run manually: cd backend && python -m scripts.seed_trait_library
"""
import json
import sys
import os

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from sqlalchemy.orm import Session

from database import SessionLocal
from models import Observation, ScoringRound, Trait, Trial, TrialTrait


# ─── Trait Definitions ─────────────────────────────────────────────────────────
# Each entry: (name, label, data_type, unit, min_value, max_value, categories, category_labels, description, crop_hint)

TRAIT_LIBRARY = [
    # ── Shared / General ──────────────────────────────────────────────────────
    {
        "name": "flowering_date",
        "label": "Flowering Date",
        "data_type": "date",
        "description": "Date when ~50% of plants are flowering (YYYY-MM-DD)",
        "crop_hint": "sorghum,maize,wheat,rice,cotton,soybean,sunflower,alfalfa,orchardgrass",
        "is_system": True,
    },
    {
        "name": "plant_height",
        "label": "Plant Height",
        "data_type": "integer",
        "unit": "cm",
        "min_value": 10,
        "max_value": 600,
        "description": "Plant height from ground to highest point",
        "crop_hint": "sorghum,maize,wheat,rice,cotton,soybean,sunflower",
        "is_system": True,
    },
    {
        "name": "maturity_date",
        "label": "Maturity Date",
        "data_type": "date",
        "description": "Date of physiological maturity",
        "crop_hint": "sorghum,maize,wheat,rice,cotton,soybean,sunflower",
    },
    {
        "name": "yield_kg_plot",
        "label": "Yield",
        "data_type": "float",
        "unit": "kg/plot",
        "min_value": 0,
        "max_value": 50,
        "description": "Harvested grain or biomass yield per plot",
        "crop_hint": "sorghum,maize,wheat,rice,cotton,soybean,sunflower,alfalfa,orchardgrass,bermudagrass,switchgrass",
    },
    {
        "name": "stand_count",
        "label": "Stand Count",
        "data_type": "integer",
        "unit": "plants",
        "min_value": 0,
        "max_value": 500,
        "description": "Number of established plants per plot",
        "crop_hint": "sorghum,maize,wheat,rice,cotton,soybean,sunflower,alfalfa",
    },
    {
        "name": "lodging_score",
        "label": "Lodging Score",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Slight", "Moderate", "Severe", "Complete"]),
        "description": "Stem lodging severity (1=none, 5=complete)",
        "crop_hint": "sorghum,maize,wheat,rice,sunflower",
    },
    {
        "name": "disease_severity_general",
        "label": "Disease Severity",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None (0%)", "Low (1-10%)", "Moderate (11-25%)", "High (26-50%)", "Severe (>50%)"]),
        "description": "General disease severity on a 1-5 scale",
        "crop_hint": "sorghum,maize,wheat,rice,cotton,soybean,sunflower,alfalfa,orchardgrass",
    },
    {
        "name": "general_notes",
        "label": "Notes",
        "data_type": "text",
        "description": "Free-form observation notes",
        "crop_hint": "sorghum,maize,wheat,rice,cotton,soybean,sunflower,alfalfa,grape,blueberry,apple,peach",
    },

    # ── Sorghum ───────────────────────────────────────────────────────────────
    {
        "name": "ergot_severity",
        "label": "Ergot Severity",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None (0%)", "Low (1-10%)", "Moderate (11-25%)", "High (26-50%)", "Severe (>50%)"]),
        "description": "Ergot (Claviceps africana) severity — honeydew on panicle at milk stage",
        "crop_hint": "sorghum",
        "is_system": True,
    },
    {
        "name": "head_smut_severity",
        "label": "Head Smut Severity",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Moderate", "High", "Severe"]),
        "description": "Sporisorium reilianum head smut severity",
        "crop_hint": "sorghum",
    },
    {
        "name": "grain_mold_severity",
        "label": "Grain Mold Severity",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Moderate", "High", "Severe"]),
        "description": "Post-flowering grain mold severity",
        "crop_hint": "sorghum",
    },
    {
        "name": "panicle_type",
        "label": "Panicle Type",
        "data_type": "categorical",
        "categories": json.dumps(["compact", "semi-compact", "semi-open", "open"]),
        "category_labels": json.dumps(["Compact", "Semi-compact", "Semi-open", "Open"]),
        "description": "Panicle compactness classification",
        "crop_hint": "sorghum",
    },

    # ── Maize ─────────────────────────────────────────────────────────────────
    {
        "name": "ear_height",
        "label": "Ear Height",
        "data_type": "integer",
        "unit": "cm",
        "min_value": 0,
        "max_value": 300,
        "description": "Height of the primary ear attachment node",
        "crop_hint": "maize",
    },
    {
        "name": "grey_leaf_spot",
        "label": "Grey Leaf Spot",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Moderate", "High", "Severe"]),
        "description": "Cercospora zeae-maydis grey leaf spot severity",
        "crop_hint": "maize",
    },

    # ── Wheat ─────────────────────────────────────────────────────────────────
    {
        "name": "stripe_rust_severity",
        "label": "Stripe Rust Severity",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Immune", "Very Low", "Low", "Moderate", "High"]),
        "description": "Puccinia striiformis stripe rust severity",
        "crop_hint": "wheat",
    },
    {
        "name": "fusarium_head_blight",
        "label": "Fusarium Head Blight",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Moderate", "High", "Severe"]),
        "description": "Fusarium graminearum scab severity on spikes",
        "crop_hint": "wheat",
    },

    # ── Perennial Forages ──────────────────────────────────────────────────────
    {
        "name": "stand_density",
        "label": "Stand Density",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Very Poor (<25%)", "Poor (25-49%)", "Fair (50-74%)", "Good (75-89%)", "Excellent (≥90%)"]),
        "description": "Percentage of plot area covered by desired species",
        "crop_hint": "alfalfa,orchardgrass,fescue,bermudagrass,switchgrass",
    },
    {
        "name": "winter_survival",
        "label": "Winter Survival",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Dead (<10%)", "Poor (10-29%)", "Fair (30-59%)", "Good (60-89%)", "Excellent (≥90%)"]),
        "description": "Stand survival rating after winter",
        "crop_hint": "alfalfa,orchardgrass,fescue,bermudagrass",
    },
    {
        "name": "spring_vigor",
        "label": "Spring Regrowth Vigor",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
        "category_labels": json.dumps(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
        "description": "Spring regrowth vigor (1=poor, 9=excellent)",
        "crop_hint": "alfalfa,orchardgrass,fescue,bermudagrass,switchgrass",
    },
    {
        "name": "cutting_date",
        "label": "Cutting Date",
        "data_type": "date",
        "description": "Date of forage cutting/harvest",
        "crop_hint": "alfalfa,orchardgrass,fescue,bermudagrass",
    },
    {
        "name": "forage_yield_kg",
        "label": "Forage Yield",
        "data_type": "float",
        "unit": "kg/plot",
        "min_value": 0,
        "max_value": 20,
        "description": "Fresh weight of harvested forage per plot",
        "crop_hint": "alfalfa,orchardgrass,fescue,bermudagrass,switchgrass",
    },

    # ── Grapes / Vineyard ──────────────────────────────────────────────────────
    {
        "name": "powdery_mildew_severity",
        "label": "Powdery Mildew Severity",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace (<1%)", "Low (1-5%)", "Moderate (6-25%)", "High (26-50%)", "Severe (>50%)"]),
        "description": "Erysiphe necator powdery mildew on leaves/clusters",
        "crop_hint": "grape",
    },
    {
        "name": "downy_mildew_severity",
        "label": "Downy Mildew Severity",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Low", "Moderate", "High", "Severe"]),
        "description": "Plasmopara viticola downy mildew severity",
        "crop_hint": "grape",
    },
    {
        "name": "botrytis_severity",
        "label": "Botrytis Bunch Rot",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Low", "Moderate", "High", "Severe"]),
        "description": "Botrytis cinerea bunch rot severity",
        "crop_hint": "grape",
    },
    {
        "name": "canopy_density",
        "label": "Canopy Density",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Very Thin", "Thin", "Moderate", "Dense", "Very Dense"]),
        "description": "Canopy density / shoot density score",
        "crop_hint": "grape",
    },
    {
        "name": "cluster_weight_g",
        "label": "Cluster Weight",
        "data_type": "float",
        "unit": "g",
        "min_value": 0,
        "max_value": 2000,
        "description": "Average cluster weight",
        "crop_hint": "grape",
    },
    {
        "name": "brix",
        "label": "Brix (Sugar)",
        "data_type": "float",
        "unit": "°Bx",
        "min_value": 0,
        "max_value": 40,
        "description": "Berry sugar content measured by refractometer",
        "crop_hint": "grape,blueberry,strawberry,raspberry",
    },
    {
        "name": "veraison_date",
        "label": "Veraison Date",
        "data_type": "date",
        "description": "Date when 50% of berries begin color change",
        "crop_hint": "grape",
    },
    {
        "name": "harvest_date",
        "label": "Harvest Date",
        "data_type": "date",
        "description": "Date of commercial harvest",
        "crop_hint": "grape,blueberry,strawberry,raspberry,apple,peach,cherry",
    },

    # ── Small Fruits ───────────────────────────────────────────────────────────
    {
        "name": "winter_injury",
        "label": "Winter Injury",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Slight", "Moderate", "Severe", "Dead"]),
        "description": "Winter cold injury rating",
        "crop_hint": "blueberry,strawberry,raspberry,grape",
    },
    {
        "name": "fruit_set",
        "label": "Fruit Set",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Very Poor", "Poor", "Fair", "Good", "Excellent"]),
        "description": "Fruit set rating after pollination",
        "crop_hint": "blueberry,strawberry,raspberry,apple,peach,cherry",
    },
    {
        "name": "berry_size_mm",
        "label": "Berry Size",
        "data_type": "float",
        "unit": "mm",
        "min_value": 0,
        "max_value": 50,
        "description": "Average berry diameter",
        "crop_hint": "blueberry,strawberry,raspberry,grape",
    },
    {
        "name": "firmness_n",
        "label": "Firmness",
        "data_type": "float",
        "unit": "N",
        "min_value": 0,
        "max_value": 50,
        "description": "Fruit firmness measured by penetrometer",
        "crop_hint": "blueberry,strawberry,raspberry,apple,peach",
    },

    # ── Tree Fruits ────────────────────────────────────────────────────────────
    {
        "name": "scab_severity",
        "label": "Scab Severity",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Low", "Moderate", "High", "Severe"]),
        "description": "Apple scab (Venturia inaequalis) or peach scab severity",
        "crop_hint": "apple,peach",
    },
    {
        "name": "fire_blight_severity",
        "label": "Fire Blight Severity",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace (<1%)", "Low (1-5%)", "Moderate (6-25%)", "High (26-50%)", "Severe (>50%)"]),
        "description": "Erwinia amylovora fire blight — % shoot/branch infected",
        "crop_hint": "apple,pear",
    },
    {
        "name": "fruit_size_mm",
        "label": "Fruit Size",
        "data_type": "float",
        "unit": "mm",
        "min_value": 0,
        "max_value": 150,
        "description": "Average fruit equatorial diameter",
        "crop_hint": "apple,peach,cherry,citrus",
    },
    {
        "name": "fruit_color_score",
        "label": "Fruit Color",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["<25% color", "25-49%", "50-74%", "75-89%", "≥90% color"]),
        "description": "Percentage of fruit surface with characteristic color",
        "crop_hint": "apple,peach,cherry",
    },
    {
        "name": "bloom_date",
        "label": "Bloom Date",
        "data_type": "date",
        "description": "Date of 50% full bloom",
        "crop_hint": "apple,peach,cherry,pear,grape,citrus",
    },
    {
        "name": "yield_kg_tree",
        "label": "Yield per Tree",
        "data_type": "float",
        "unit": "kg/tree",
        "min_value": 0,
        "max_value": 500,
        "description": "Total harvested yield per tree",
        "crop_hint": "apple,peach,cherry,pear,citrus",
    },

    # ── Cherry ────────────────────────────────────────────────────────────────
    {
        "name": "cherry_cracking",
        "label": "Rain Cracking",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None (0%)", "<5%", "5-15%", "15-30%", "30-50%", ">50%"]),
        "description": "Percentage of fruit with rain-induced cracking",
        "crop_hint": "cherry",
    },
    {
        "name": "brown_rot_severity",
        "label": "Brown Rot Severity",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Low", "Moderate", "High", "Severe"]),
        "description": "Monilinia brown rot severity on fruit",
        "crop_hint": "cherry,peach",
    },

    # ── Pear ──────────────────────────────────────────────────────────────────
    {
        "name": "pear_psylla",
        "label": "Pear Psylla Damage",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace", "Light", "Moderate", "Heavy", "Severe"]),
        "description": "Psylla honeydew/sooty mold damage rating",
        "crop_hint": "pear",
    },
    {
        "name": "russet_score",
        "label": "Russet Score",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None (0%)", "Trace (<10%)", "Moderate (10-25%)", "High (25-50%)", "Severe (>50%)"]),
        "description": "Fruit skin russeting severity",
        "crop_hint": "pear,apple",
    },

    # ── Citrus ────────────────────────────────────────────────────────────────
    {
        "name": "citrus_canker_severity",
        "label": "Citrus Canker Severity",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Trace (<1%)", "Low (1-5%)", "Moderate (6-15%)", "High (16-30%)", "Severe (>30%)"]),
        "description": "Xanthomonas citri canker lesion severity on leaves/fruit",
        "crop_hint": "citrus",
    },
    {
        "name": "hlb_symptom_score",
        "label": "HLB Symptom Score",
        "data_type": "categorical",
        "categories": json.dumps(["0", "1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["None", "Suspect", "Mild blotchy mottle", "Moderate", "Severe", "Declining"]),
        "description": "Huanglongbing (citrus greening) visual symptom severity",
        "crop_hint": "citrus",
    },
    {
        "name": "juice_content_pct",
        "label": "Juice Content",
        "data_type": "float",
        "unit": "%",
        "min_value": 0,
        "max_value": 80,
        "description": "Juice percentage by weight",
        "crop_hint": "citrus",
    },
    {
        "name": "rind_thickness_mm",
        "label": "Rind Thickness",
        "data_type": "float",
        "unit": "mm",
        "min_value": 0,
        "max_value": 20,
        "description": "Average rind/peel thickness",
        "crop_hint": "citrus",
    },
    {
        "name": "acid_pct",
        "label": "Titratable Acidity",
        "data_type": "float",
        "unit": "%",
        "min_value": 0,
        "max_value": 10,
        "description": "Titratable acid content as citric acid %",
        "crop_hint": "citrus,grape",
    },

    # ── Fescue / Additional Forage ────────────────────────────────────────────
    {
        "name": "leaf_texture",
        "label": "Leaf Texture",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Very Fine", "Fine", "Medium", "Coarse", "Very Coarse"]),
        "description": "Leaf blade texture/fineness rating",
        "crop_hint": "fescue,orchardgrass,bermudagrass",
    },
    {
        "name": "turf_quality",
        "label": "Turf Quality",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
        "category_labels": json.dumps(["1", "2", "3", "4", "5", "6", "7", "8", "9"]),
        "description": "Overall turf quality (1=dead/poor, 9=ideal)",
        "crop_hint": "fescue,bermudagrass",
    },
    {
        "name": "drought_tolerance",
        "label": "Drought Tolerance",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Very Poor", "Poor", "Fair", "Good", "Excellent"]),
        "description": "Summer drought stress tolerance rating",
        "crop_hint": "fescue,bermudagrass,switchgrass",
    },

    # ── Raspberry ─────────────────────────────────────────────────────────────
    {
        "name": "cane_vigor",
        "label": "Cane Vigor",
        "data_type": "categorical",
        "categories": json.dumps(["1", "2", "3", "4", "5"]),
        "category_labels": json.dumps(["Very Weak", "Weak", "Moderate", "Vigorous", "Very Vigorous"]),
        "description": "Primocane/floricane vigor rating",
        "crop_hint": "raspberry,blackberry",
    },
    {
        "name": "fruit_shape",
        "label": "Fruit Shape",
        "data_type": "categorical",
        "categories": json.dumps(["conical", "round", "elongated", "irregular"]),
        "category_labels": json.dumps(["Conical", "Round", "Elongated", "Irregular"]),
        "description": "Predominant fruit shape classification",
        "crop_hint": "strawberry,raspberry",
    },
]


# ─── Preset Crop Packs ─────────────────────────────────────────────────────────
# Maps crop slug → list of trait names to include in the default pack

CROP_PACKS: dict[str, list[str]] = {
    "sorghum": [
        "ergot_severity", "flowering_date", "plant_height",
        "head_smut_severity", "grain_mold_severity", "lodging_score",
        "maturity_date", "yield_kg_plot", "stand_count", "panicle_type", "general_notes",
    ],
    "maize": [
        "grey_leaf_spot", "lodging_score", "flowering_date", "plant_height",
        "ear_height", "maturity_date", "yield_kg_plot", "stand_count", "general_notes",
    ],
    "wheat": [
        "stripe_rust_severity", "fusarium_head_blight", "lodging_score",
        "flowering_date", "plant_height", "maturity_date", "yield_kg_plot", "general_notes",
    ],
    "rice": [
        "disease_severity_general", "lodging_score", "flowering_date",
        "plant_height", "maturity_date", "yield_kg_plot", "stand_count", "general_notes",
    ],
    "cotton": [
        "disease_severity_general", "plant_height", "flowering_date",
        "maturity_date", "yield_kg_plot", "stand_count", "general_notes",
    ],
    "soybean": [
        "disease_severity_general", "lodging_score", "flowering_date",
        "plant_height", "maturity_date", "yield_kg_plot", "stand_count", "general_notes",
    ],
    "sunflower": [
        "disease_severity_general", "lodging_score", "flowering_date",
        "plant_height", "maturity_date", "yield_kg_plot", "general_notes",
    ],
    "alfalfa": [
        "stand_density", "winter_survival", "spring_vigor",
        "disease_severity_general", "lodging_score", "forage_yield_kg",
        "cutting_date", "stand_count", "general_notes",
    ],
    "orchardgrass": [
        "stand_density", "winter_survival", "spring_vigor",
        "disease_severity_general", "forage_yield_kg", "cutting_date", "general_notes",
    ],
    "bermudagrass": [
        "stand_density", "winter_survival", "spring_vigor",
        "disease_severity_general", "forage_yield_kg", "cutting_date", "general_notes",
    ],
    "switchgrass": [
        "stand_density", "spring_vigor", "disease_severity_general",
        "forage_yield_kg", "cutting_date", "plant_height", "general_notes",
    ],
    "grape": [
        "powdery_mildew_severity", "downy_mildew_severity", "botrytis_severity",
        "canopy_density", "cluster_weight_g", "brix",
        "bloom_date", "veraison_date", "harvest_date", "general_notes",
    ],
    "blueberry": [
        "disease_severity_general", "winter_injury", "fruit_set",
        "berry_size_mm", "brix", "firmness_n", "harvest_date", "general_notes",
    ],
    "strawberry": [
        "disease_severity_general", "winter_injury", "fruit_set",
        "berry_size_mm", "brix", "firmness_n", "harvest_date", "general_notes",
    ],
    "apple": [
        "scab_severity", "fire_blight_severity", "fruit_set",
        "fruit_size_mm", "fruit_color_score", "firmness_n",
        "bloom_date", "harvest_date", "yield_kg_tree", "general_notes",
    ],
    "peach": [
        "scab_severity", "brown_rot_severity", "disease_severity_general", "fruit_set",
        "fruit_size_mm", "fruit_color_score", "firmness_n",
        "bloom_date", "harvest_date", "yield_kg_tree", "general_notes",
    ],
    "cherry": [
        "brown_rot_severity", "cherry_cracking", "disease_severity_general",
        "fruit_set", "fruit_size_mm", "fruit_color_score", "firmness_n",
        "bloom_date", "harvest_date", "yield_kg_tree", "general_notes",
    ],
    "pear": [
        "fire_blight_severity", "scab_severity", "pear_psylla", "russet_score",
        "fruit_set", "fruit_size_mm", "firmness_n",
        "bloom_date", "harvest_date", "yield_kg_tree", "general_notes",
    ],
    "citrus": [
        "citrus_canker_severity", "hlb_symptom_score", "disease_severity_general",
        "fruit_size_mm", "brix", "acid_pct", "juice_content_pct", "rind_thickness_mm",
        "bloom_date", "harvest_date", "yield_kg_tree", "general_notes",
    ],
    "fescue": [
        "stand_density", "winter_survival", "spring_vigor", "leaf_texture",
        "turf_quality", "drought_tolerance", "disease_severity_general",
        "forage_yield_kg", "cutting_date", "general_notes",
    ],
    "raspberry": [
        "disease_severity_general", "winter_injury", "cane_vigor",
        "fruit_set", "fruit_shape", "berry_size_mm", "brix", "firmness_n",
        "harvest_date", "general_notes",
    ],
}


def seed_if_empty(db: Session) -> None:
    """Seed traits if the table is empty. Also migrates existing sorghum observations."""
    count = db.query(Trait).count()
    if count > 0:
        return  # already seeded

    print("Seeding trait library...")
    name_to_id: dict[str, int] = {}

    for t in TRAIT_LIBRARY:
        trait = Trait(
            name=t["name"],
            label=t["label"],
            data_type=t["data_type"],
            unit=t.get("unit"),
            min_value=t.get("min_value"),
            max_value=t.get("max_value"),
            categories=t.get("categories"),
            category_labels=t.get("category_labels"),
            description=t.get("description"),
            crop_hint=t.get("crop_hint"),
            is_system=t.get("is_system", False),
        )
        db.add(trait)
        db.flush()
        name_to_id[trait.name] = trait.id

    db.commit()
    print(f"  Created {len(TRAIT_LIBRARY)} traits")

    # Migrate existing trials: attach sorghum trait pack + create default round
    _migrate_existing_trials(db, name_to_id)


def _migrate_existing_trials(db: Session, name_to_id: dict[str, int]) -> None:
    """For existing trials with no TrialTraits, attach the appropriate crop pack
    and create a default 'Round 1' scoring round, then link existing observations."""
    trials = db.query(Trial).all()
    if not trials:
        return

    sorghum_pack = CROP_PACKS.get("sorghum", [])

    for trial in trials:
        # Skip trials that already have traits configured
        existing_tt = db.query(TrialTrait).filter(TrialTrait.trial_id == trial.id).first()
        if existing_tt:
            continue

        # Determine crop pack to use
        crop = (trial.crop or "sorghum").lower()
        pack = CROP_PACKS.get(crop, sorghum_pack)

        # Attach traits
        for order, tname in enumerate(pack):
            tid = name_to_id.get(tname)
            if tid:
                db.add(TrialTrait(trial_id=trial.id, trait_id=tid, display_order=order))

        db.flush()

        # Create default scoring round if none exist
        existing_round = db.query(ScoringRound).filter(ScoringRound.trial_id == trial.id).first()
        if not existing_round:
            sr = ScoringRound(trial_id=trial.id, name="Round 1")
            db.add(sr)
            db.flush()
            round_id = sr.id
        else:
            round_id = existing_round.id

        # Link existing observations to trait records and the default round
        obs_list = (
            db.query(Observation)
            .join(__import__("models").Plot, Observation.plot_id == __import__("models").Plot.id)
            .filter(__import__("models").Plot.trial_id == trial.id)
            .all()
        )
        for obs in obs_list:
            if obs.trait_id is None:
                obs.trait_id = name_to_id.get(obs.trait_name)
            if obs.scoring_round_id is None:
                obs.scoring_round_id = round_id

    db.commit()
    print(f"  Migrated {len(trials)} existing trials")


if __name__ == "__main__":
    db: Session = SessionLocal()
    try:
        # Force re-seed by clearing traits (use only in dev)
        force = "--force" in sys.argv
        if force:
            db.query(Trait).delete()
            db.commit()
            print("Cleared existing traits (force mode)")
        seed_if_empty(db)
        print("Done.")
    finally:
        db.close()
