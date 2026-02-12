# Product Requirements Document (PRD)
# SorghumField: Phenotyping Data Manager for Sorghum Research

**Version:** 1.1
**Last Updated:** February 5, 2026
**Author:** [Your Name]
**Department:** UGA College of Agricultural and Environmental Sciences

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Competitive Analysis](#2-competitive-analysis)
3. [Research Context & Background](#3-research-context--background)
4. [Problem Statement](#4-problem-statement)
5. [Product Vision & Goals](#5-product-vision--goals)
6. [User Personas](#6-user-personas)
7. [Feature Requirements](#7-feature-requirements)
8. [Technical Architecture](#8-technical-architecture)
9. [Data Model](#9-data-model)
10. [User Interface Design](#10-user-interface-design)
11. [Implementation Plan](#11-implementation-plan)
12. [Testing Strategy](#12-testing-strategy)
13. [Success Metrics](#13-success-metrics)
14. [Future Roadmap](#14-future-roadmap)
15. [Appendix](#15-appendix)

---

## 1. Executive Summary

### 1.1 Product Name
**SorghumField** - A mobile-first phenotyping data management tool for sorghum research trials

### 1.2 One-Line Description
A cross-platform PWA enabling researchers to collect, manage, and analyze sorghum phenotyping data with visual disease severity scoring and pre-configured trait templates.

### 1.3 Target Users
- Sorghum researchers at UGA (primary)
- Graduate students conducting field trials

### 1.4 Key Value Proposition
Replace fragmented paper forms and spreadsheets with a unified, mobile-friendly system that:
- **Visual disease scoring** with built-in reference images (unique differentiator)
- **Sorghum-specific trait templates** (ergot, anthracnose, flowering, height)
- **Cross-platform PWA** works on iOS, Android, and desktop browsers
- Reduces data entry errors with validation
- Provides instant statistical summaries
- Simple CSV export for R/Python analysis

### 1.5 Timeline
**2-week MVP delivery** for seminar demonstration (Target: February 18, 2026)
- **Deadline type:** Soft (can adjust if needed)
- **Demo format:** Solo demonstration on localhost

### 1.6 MVP Scope Decisions
Based on requirements analysis, the following simplifications were made for the 2-week MVP:

| Feature | MVP Status | Rationale |
|---------|------------|-----------|
| Offline support | ⏸️ Post-MVP | Complex sync logic; online-only for demo |
| User authentication | ⏸️ Post-MVP | Single-user mode sufficient for solo demo |
| Team collaboration | ⏸️ Post-MVP | No multi-user needed for demo |
| Charts/heatmaps | ⏸️ Post-MVP | Simple numeric stats sufficient |
| Cloud deployment | ⏸️ Post-MVP | Localhost demo is sufficient |

---

## 2. Competitive Analysis

### 2.1 Existing Phenotyping Tools

| Tool | Platform | iOS? | Offline | Open Source | Key Weakness |
|------|----------|------|---------|-------------|--------------|
| **Field Book** | Android | ❌ | ✅ | ✅ | No iOS, steep learning curve |
| **KDSmart** | Android | ❌ | ✅ | ❌ | No iOS, closed source, no BrAPI |
| **GridScore** | PWA | ⚠️ | ✅ | ✅ | iOS deletes PWA data after 7 days inactive |
| **BreedBase** | Web | ✅ | ❌ | ✅ | Not mobile-first, complex setup |

### 2.2 Detailed Tool Analysis

#### Field Book (PhenoApps)
- **What it does:** Open-source Android app for phenotypic data collection
- **Key features:** Custom traits, barcode scanning, BrAPI integration, cloud sync
- **Strengths:** Most widely adopted, extensive trait types, well-documented
- **Weaknesses:** Android-only (excludes iPhone users), steep learning curve, no built-in data visualization, no disease reference images

#### KDSmart (Diversity Arrays)
- **What it does:** Mobile data collection app for phenotypic observations
- **Key features:** Input validation, Bluetooth barcode, ergonomic design options
- **Strengths:** Good UX design, device-to-device sync
- **Weaknesses:** Android-only, closed source, no BrAPI support, tied to KDDart ecosystem

#### GridScore (James Hutton Institute)
- **What it does:** Cross-platform PWA with field-plan-centric visualization
- **Key features:** Grid view, guided walks, speech recognition, georeferencing
- **Strengths:** Cross-platform PWA, innovative field view, real-time visualization
- **Weaknesses:** iOS Safari deletes PWA data after 7 days of inactivity (critical issue)

#### BreedBase
- **What it does:** Comprehensive web-based breeding database and digital ecosystem
- **Key features:** Trial design, pedigree tracking, genomic selection, BrAPI 2.0
- **Strengths:** Full breeding program management, advanced analytics
- **Weaknesses:** Not mobile-first, requires server infrastructure, overkill for simple data collection

### 2.3 Gap Analysis & Differentiation

**Critical gaps in existing tools that SorghumField addresses:**

| Gap | Current State | SorghumField Solution |
|-----|---------------|----------------------|
| **iOS Support** | Field Book/KDSmart are Android-only | PWA works on all platforms |
| **Disease Reference Images** | No tool has built-in visual scoring guides | Built-in 1-5 scale images for ergot/anthracnose |
| **Sorghum-Specific Templates** | All tools require trait configuration | Pre-configured sorghum traits ready to use |
| **Learning Curve** | Field Book is powerful but complex | Simple, focused UI requiring minimal training |
| **iOS PWA Reliability** | GridScore has 7-day data deletion issue | Designed with iOS limitations in mind |

### 2.4 Positioning Statement

> *"SorghumField is the mobile-first phenotyping app designed specifically for sorghum researchers, featuring visual disease scoring guides and pre-configured trait templates that work on any device."*

### 2.5 Competitive Advantage Summary

1. **Visual Disease Scoring** - No existing tool includes built-in reference images for disease severity (unique feature)
2. **Sorghum-Specific** - Pre-built trait templates vs. generic tools requiring setup
3. **True Cross-Platform** - Works reliably on iOS, Android, desktop
4. **Focused Simplicity** - Opinionated design that requires minimal training

---

## 3. Research Context & Background

### 3.1 Sorghum Research at UGA

The University of Georgia has a rich history in sorghum research:

- **Institute for Integrative Precision Agriculture (IIPA)**: Established in 2022 with 70+ faculty and 80+ graduate students focusing on next-generation agricultural technologies
- **Perennial Sorghum Research**: Led by the Plant Genome Mapping Laboratory (PGML), UGA has been developing drought-resistant perennial sorghum varieties since 2009
- **Research Locations**: Southwest Georgia Research and Education Center (Plains), Tifton Campus, Griffin Campus, and others
- **Key Crops**: Sorghum is tested alongside corn, cotton, peanuts, and soybeans across Georgia's multiple climate zones

### 3.2 Ergot Disease in Sorghum

Ergot (caused by *Claviceps africana*) is a significant disease affecting sorghum:

**Disease Characteristics:**
- Attacks unfertilized ovaries in sorghum panicles
- Produces sticky honeydew droplets as a visible symptom
- Severity measured as percentage of infected florets (typically at milk stage, 10-12 days after 50% flowering)
- Environmental factors: temperature, humidity, and stigma wetness significantly impact infection

**Severity Scoring Methods:**
| Scale | Description |
|-------|-------------|
| 1 | No ergot/sphacelia |
| 2 | 1-10% infected spikelets |
| 3 | 11-25% infected spikelets |
| 4 | 26-50% infected spikelets |
| 5 | >50% infected spikelets |

**Impact:**
- Losses up to 80% reported in India
- 12-25% annual losses in Zimbabwe (sometimes 100%)
- 45% of hybrid seed production fields in Texas Panhandle affected in 1997

**Correlation Factors:**
- Days to 50% flowering
- Pollen quantity
- Pre-flowering cold stress
- Stigma wetness period (4.5-6 hours optimal for infection)

### 3.3 Current Phenotyping Challenges

Based on research into current practices:

1. **Fragmented Data Collection**: Paper forms, multiple spreadsheets, inconsistent formats
2. **Manual Error-Prone Processes**: Transcription errors from paper to digital
3. **No Real-Time Visibility**: Lab leads cannot see field progress in real-time
4. **Limited Mobile Support**: Existing UGA apps (SmartIrrigation, CropFit) focus on irrigation, not phenotyping
5. **No Standardized Disease Scoring Interface**: Researchers use ad-hoc methods

### 3.4 Existing UGA Agricultural Technology

| Tool | Purpose | Gap for Phenotyping |
|------|---------|---------------------|
| SmartIrrigation CropFit | Irrigation scheduling | No phenotyping features |
| UGA Smart Sensor Array | Soil moisture monitoring | Hardware-focused, no disease tracking |
| Irrigator Pro | Irrigation recommendations | Crop management only |
| UGA Extension Spreadsheets | Data recording | Not mobile-friendly, no validation |

**Identified Gap**: No mobile-first phenotyping data collection tool exists at UGA, especially for disease severity scoring.

---

## 4. Problem Statement

### 4.1 Primary Problem
Sorghum researchers at UGA currently lack a unified, mobile-friendly tool for collecting phenotyping data in the field, leading to:
- Data scattered across paper forms and multiple spreadsheets
- Transcription errors during manual data entry
- Delayed data availability for analysis
- Inconsistent scoring methods across team members
- No real-time collaboration or progress visibility

### 4.2 User Pain Points

| Pain Point | Current Workaround | Impact |
|------------|-------------------|--------|
| No mobile data entry | Paper forms → later spreadsheet entry | 2-3 hours extra work per field day |
| No offline support | Delay entry until connectivity | Data loss risk, memory errors |
| Inconsistent disease scoring | Training + paper reference guides | Inter-rater variability |
| No team visibility | Email/Slack updates | Coordination delays |
| No instant statistics | Manual Excel analysis | Delayed decision-making |

### 4.3 Opportunity
Build a tool that:
1. Serves immediate research needs (your perennial sorghum/ergot work)
2. Demonstrates precision agriculture software skills
3. Can scale to other UGA research groups
4. Potentially publishable as a methods/tools paper

---

## 5. Product Vision & Goals

### 5.1 Vision Statement
*"Enable sorghum researchers to capture, validate, and analyze phenotyping data seamlessly from field to publication."*

### 5.2 MVP Goals (2-Week Scope)

| Goal | Success Criteria | Priority |
|------|------------------|----------|
| **G1**: Mobile-first data collection | App works on iOS/Android browsers | P0 |
| **G2**: Disease severity scoring | Built-in 1-5 scale with visual reference images | P0 |
| **G3**: Core trait collection | Ergot severity, flowering date, plant height | P0 |
| **G4**: Plot management | CSV import, search, sequential navigation | P0 |
| **G5**: Data export | CSV export for R/Python analysis | P0 |
| **G6**: Summary statistics | Mean, min, max, count per trait (numbers only) | P0 |
| **G7**: Edit observations | Ability to modify previous entries | P0 |

### 5.3 Non-Goals (Out of Scope for MVP)
- Offline functionality (requires complex sync logic)
- User authentication (single-user mode for demo)
- Team collaboration / multi-user
- Charts, histograms, heatmaps (simple numbers sufficient)
- Cloud deployment (localhost for demo)
- Image capture and ML-based disease detection
- GPS-based plot mapping
- Integration with external sensors
- Advanced statistical analysis (ANOVA, etc.)
- Native mobile apps (will use Progressive Web App instead)

---

## 6. User Personas

### 6.1 Primary Persona: Graduate Researcher

**Name:** Alex Chen  
**Role:** PhD Student, Crop & Soil Sciences  
**Research Focus:** Perennial sorghum breeding, ergot resistance  

**Context:**
- Conducts field trials at Tifton and Plains research stations
- Manages 200+ plots across multiple experiments
- Records data 3-4 times per week during growing season
- Collaborates with 2-3 other lab members

**Goals:**
- Quickly record observations without carrying paper
- Ensure data quality with validation
- Share progress with advisor in real-time
- Export clean data for R/Python analysis

**Pain Points:**
- Phone battery dies in the field
- Spotty cell coverage at research stations
- Handwriting becomes illegible in heat/humidity
- Spends weekends transcribing paper notes

**Quote:** *"I just want to tap a few buttons and know my data is saved correctly."*

---

### 6.2 Secondary Persona: Lab Principal Investigator (Post-MVP)

**Name:** Dr. Sarah Martinez  
**Role:** Associate Professor, Sorghum Breeding Program  

**Context:**
- Oversees 5 graduate students and 3 technicians
- Manages 10+ concurrent experiments
- Needs summary data for grant reports and publications
- Reviews data quality weekly

**Goals:**
- See real-time progress across all trials
- Ensure consistent data collection methods
- Generate quick summary statistics
- Export publication-ready data

**Pain Points:**
- Receives data in inconsistent formats
- Discovers data entry errors months later
- Cannot assess field progress remotely
- Spends hours consolidating spreadsheets

**Quote:** *"I need to trust the data my team collects without micromanaging."*

---

### 6.3 Tertiary Persona: Research Technician (Post-MVP)

**Name:** Marcus Johnson  
**Role:** Senior Research Technician  

**Context:**
- Supports multiple PIs and projects
- Conducts routine measurements (height, flowering dates)
- Trains new students on data collection
- Works across multiple research stations

**Goals:**
- Standardized interface across all projects
- Quick training for new team members
- Reliable offline operation
- Bulk data entry for efficiency

**Pain Points:**
- Different PIs want different spreadsheet formats
- Students make inconsistent scoring decisions
- Paper forms get damaged in field conditions

**Quote:** *"Give me something that just works every time."*

---

## 7. Feature Requirements

### 7.1 MVP Features (Must Have for Demo)

#### F1: Trial & Plot Management
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F1.1 | Create Trial | Define new experiment with metadata (name, crop, location, dates) | P0 |
| F1.2 | Define Plots | Add plots with ID, genotype, rep, row, column | P0 |
| F1.3 | Import Plots | Bulk import from CSV (headers: plot_id, genotype, rep, row, column) | P0 |
| F1.4 | Plot Navigation | Search/filter by plot ID or genotype, sequential row navigation | P0 |
| F1.5 | Auto-Advance | After saving, automatically advance to next unscored plot | P0 |

#### F2: Data Collection
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F2.1 | Observation Entry | Record phenotypic measurements for a plot | P0 |
| F2.2 | Disease Severity Scoring | 1-5 **button selector** with visual reference images (placeholder OK) | P0 |
| F2.3 | Flowering Date | Date picker for 50% flowering date | P0 |
| F2.4 | Plant Height | Numeric input in cm | P0 |
| F2.5 | Notes/Comments | Free-text notes per observation | P0 |
| F2.6 | Timestamp | Auto-record date/time of each observation | P0 |
| F2.7 | Edit Previous | Ability to go back and edit any previous observation (critical) | P0 |

#### F3: Data Export & Statistics
| ID | Feature | Description | Priority |
|----|---------|-------------|----------|
| F3.1 | CSV Export | Download all trial data as CSV | P0 |
| F3.2 | Summary Statistics | Mean, SD, min, max, count per trait (numbers only, no charts) | P0 |
| F3.3 | Progress Indicator | Show X/Y plots scored | P0 |

### 7.2 Post-MVP Features (V1.1+)

| ID | Feature | Description | Phase |
|----|---------|-------------|-------|
| F4.1 | Offline Support | IndexedDB storage with background sync | V1.1 |
| F4.2 | User Authentication | JWT login/register | V1.1 |
| F4.3 | Team Collaboration | Trial sharing, role-based access | V1.1 |
| F4.4 | Distribution Charts | Histograms for numeric traits | V1.1 |
| F4.5 | Disease Heatmap | Visual plot-level severity map | V1.1 |
| F4.6 | Excel Export | Formatted .xlsx with multiple sheets | V1.1 |
| F5.1 | Image Capture | Attach photos to observations | V1.2 |
| F5.2 | GPS Tagging | Auto-record location per observation | V1.2 |
| F5.3 | Barcode/QR Scanning | Scan plot tags for quick navigation | V1.2 |
| F5.4 | Weather Integration | Auto-fetch weather data for observation time | V1.2 |
| F5.5 | API Access | REST API for R/Python integration | V1.2 |
| F6.1 | ML Disease Scoring | Suggest severity score from photo | V2.0 |
| F6.2 | Statistical Analysis | Built-in ANOVA, correlation analysis | V2.0 |
| F6.3 | BrAPI Integration | Connect to BreedBase and other systems | V2.0 |

---

## 8. Technical Architecture

### 8.1 MVP Architecture Overview (Simplified)

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIENT (React SPA)                        │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │   React 18 + TypeScript │  │      Tailwind CSS           │  │
│  │   + React Router        │  │      (Mobile-first)         │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ HTTP / REST API (localhost)
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                        SERVER                                    │
│  ┌─────────────────────────┐  ┌─────────────────────────────┐  │
│  │   FastAPI (Python)      │  │      SQLite Database        │  │
│  │   Auto-generated docs   │  │      (Single file)          │  │
│  └─────────────────────────┘  └─────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                     DEPLOYMENT (MVP)                             │
│                      Localhost only                              │
│              (Cloud deployment in V1.1)                          │
└─────────────────────────────────────────────────────────────────┘
```

### 8.2 Technology Stack (MVP)

| Layer | Technology | Rationale |
|-------|------------|-----------|
| **Frontend** | React 18 + TypeScript | Component-based, large ecosystem |
| **Styling** | Tailwind CSS | Rapid UI development, mobile-first |
| **State Management** | React useState/useContext | Simple, no external library needed for MVP |
| **Routing** | React Router v6 | Standard routing solution |
| **Backend** | FastAPI (Python) | Fast, async, auto-docs (Swagger UI) |
| **Database** | SQLite | Single file, no server setup, upgradeable to PostgreSQL |
| **ORM** | SQLAlchemy | Python standard, easy migrations |
| **Testing** | Chrome DevTools | Mobile emulation for responsive testing |

### 8.3 Post-MVP Technology Additions

| Feature | Technology | Phase |
|---------|------------|-------|
| Offline Storage | IndexedDB via Dexie.js | V1.1 |
| PWA/Service Worker | Workbox | V1.1 |
| Authentication | JWT + bcrypt | V1.1 |
| Production Database | PostgreSQL | V1.1 |
| Cloud Hosting | Vercel + Railway | V1.1 |
| Charts | Chart.js or Recharts | V1.1 |

---

## 9. Data Model

### 9.1 Entity Relationship Diagram (MVP - Simplified)

```
┌──────────────┐       ┌──────────────┐       ┌──────────────┐
│    Trial     │       │     Plot     │       │ Observation  │
├──────────────┤       ├──────────────┤       ├──────────────┤
│ id (PK)      │───┐   │ id (PK)      │───┐   │ id (PK)      │
│ name         │   │   │ trial_id(FK) │   │   │ plot_id (FK) │
│ crop         │   │   │ plot_id      │   │   │ trait_name   │
│ location     │   │   │ genotype     │   │   │ value        │
│ start_date   │   │   │ rep          │   │   │ recorded_at  │
│ end_date     │   │   │ row          │   │   │ notes        │
│ created_at   │   │   │ column       │   │   └──────────────┘
└──────────────┘   │   │ notes        │   │
                   │   └──────────────┘   │
                   │                      │
                   └──────────────────────┘

Note: User, TrialMember, and TraitDef entities removed for MVP.
Authentication and custom trait definitions added in V1.1.
```

### 9.2 Core Entities (MVP)

#### Trial
```json
{
  "id": 1,
  "name": "Perennial Sorghum Ergot Trial 2026",
  "crop": "sorghum",
  "location": "Tifton, GA",
  "start_date": "2026-04-01",
  "end_date": "2026-10-31",
  "created_at": "2026-02-04T10:00:00Z"
}
```

#### Plot
```json
{
  "id": 1,
  "trial_id": 1,
  "plot_id": "T1-R1-C5",
  "genotype": "IS8525",
  "rep": 1,
  "row": 1,
  "column": 5,
  "notes": "Border plot"
}
```

#### Observation
```json
{
  "id": 1,
  "plot_id": 1,
  "trait_name": "ergot_severity",
  "value": "3",
  "recorded_at": "2026-06-15T14:32:00Z",
  "notes": "Honeydew visible on lower panicle"
}
```

**Note:** For MVP, traits are hardcoded (ergot_severity, flowering_date, plant_height).
TraitDefinition entity with custom traits added in V1.1.

### 9.3 Pre-Defined Trait Templates (Sorghum)

#### MVP Traits (Hardcoded)
| Trait | Type | Unit | Validation | Notes |
|-------|------|------|------------|-------|
| ergot_severity | categorical | - | 1-5 scale | Large buttons with reference images |
| flowering_date | date | - | Valid date | Date picker for 50% anthesis |
| plant_height | numeric | cm | 50-400 | Numeric input |

#### Disease Severity Scale (Ergot)
| Score | Label | Description |
|-------|-------|-------------|
| 1 | None (0%) | No visible honeydew or sphacelia |
| 2 | Low (1-10%) | Few droplets on lower florets |
| 3 | Moderate (11-25%) | Multiple droplets, spread across panicle |
| 4 | High (26-50%) | Heavy honeydew, visible mold growth |
| 5 | Severe (>50%) | Entire panicle affected, sclerotia forming |

#### Post-MVP Traits (V1.1+)
| Trait | Type | Unit | Validation | Notes |
|-------|------|------|------------|-------|
| anthracnose_severity | categorical | - | 1-5 scale | With reference images |
| panicle_length | numeric | cm | 5-50 | From base to tip |
| days_to_flowering | numeric | days | 30-120 | From planting |
| lodging_score | categorical | - | 1-5 | 1=erect, 5=flat |
| stand_count | numeric | plants | 0-100 | Plants per plot |
| grain_yield | numeric | g | 0-5000 | Per plot |
| biomass_yield | numeric | kg | 0-50 | Per plot |

---

## 10. User Interface Design

### 10.1 Design Principles

1. **Mobile-First**: Design for phone screens, adapt up to tablet/desktop
2. **Thumb-Friendly**: Key actions in bottom 2/3 of screen
3. **High Contrast**: Readable in bright sunlight
4. **Minimal Taps**: Most common actions in ≤3 taps
5. **Forgiving**: Undo actions, confirm destructive operations

### 10.2 Key Screens

#### Screen 1: Home / Trial List
```
┌─────────────────────────────────┐
│ ☰  SorghumField         🔔  👤 │
├─────────────────────────────────┤
│                                 │
│  My Trials                      │
│  ─────────────────────────────  │
│  ┌─────────────────────────┐   │
│  │ 🌾 Perennial Ergot 2026 │   │
│  │    Tifton · 240 plots   │   │
│  │    Last: 2 hours ago    │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ 🌾 Drought Trial 2026   │   │
│  │    Plains · 180 plots   │   │
│  │    Last: 3 days ago     │   │
│  └─────────────────────────┘   │
│                                 │
│  Shared With Me                 │
│  ─────────────────────────────  │
│  ┌─────────────────────────┐   │
│  │ 🌾 Aphid Resistance     │   │
│  │    Griffin · 120 plots  │   │
│  └─────────────────────────┘   │
│                                 │
├─────────────────────────────────┤
│     [  + New Trial  ]           │
└─────────────────────────────────┘
```

#### Screen 2: Trial Dashboard
```
┌─────────────────────────────────┐
│ ←  Perennial Ergot 2026    ⚙️  │
├─────────────────────────────────┤
│                                 │
│  Progress                       │
│  ┌─────────────────────────┐   │
│  │ ████████████░░░░░  72%  │   │
│  │ 173/240 plots scored    │   │
│  └─────────────────────────┘   │
│                                 │
│  Quick Stats                    │
│  ┌────────┐ ┌────────┐         │
│  │  3.2   │ │  67    │         │
│  │Avg Ergot│ │Flowering│        │
│  └────────┘ └────────┘         │
│                                 │
│  Recent Activity                │
│  • Alex scored Plot T1-R3-C2   │
│  • Maria added 12 observations │
│                                 │
├─────────────────────────────────┤
│  [📝 Record]  [📊 View]  [📤]  │
└─────────────────────────────────┘
```

#### Screen 3: Plot Selection
```
┌─────────────────────────────────┐
│ ←  Select Plot           🔍    │
├─────────────────────────────────┤
│ ┌─────────────────────────────┐│
│ │ Search: T1-R3              ││
│ └─────────────────────────────┘│
│                                 │
│  Filter: [All ▼] [Unscored ▼]  │
│                                 │
│  ┌─────────────────────────┐   │
│  │ T1-R3-C1  ·  IS8525     │ ✓ │
│  │ Scored today            │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ T1-R3-C2  ·  IS14131    │   │
│  │ Not scored              │   │
│  └─────────────────────────┘   │
│  ┌─────────────────────────┐   │
│  │ T1-R3-C3  ·  ATx623     │   │
│  │ Not scored              │   │
│  └─────────────────────────┘   │
│                                 │
│  ... (scrollable)              │
│                                 │
└─────────────────────────────────┘
```

#### Screen 4: Observation Entry
```
┌─────────────────────────────────┐
│ ←  T1-R3-C2               💾   │
│     IS14131 · Rep 3             │
├─────────────────────────────────┤
│                                 │
│  Ergot Severity                 │
│  ┌─────────────────────────┐   │
│  │  1    2    3    4    5  │   │
│  │  ○    ○    ●    ○    ○  │   │
│  │ None Low  Mod High Sev  │   │
│  └─────────────────────────┘   │
│  [View Reference Images]        │
│                                 │
│  Flowering Date                 │
│  ┌─────────────────────────┐   │
│  │ 📅  June 12, 2026       │   │
│  └─────────────────────────┘   │
│                                 │
│  Plant Height (cm)              │
│  ┌─────────────────────────┐   │
│  │        142              │   │
│  └─────────────────────────┘   │
│                                 │
│  Notes                          │
│  ┌─────────────────────────┐   │
│  │ Honeydew on lower...    │   │
│  └─────────────────────────┘   │
│                                 │
├─────────────────────────────────┤
│  [Save & Next →]                │
└─────────────────────────────────┘
```

#### Screen 5: Disease Severity Reference (Modal)
```
┌─────────────────────────────────┐
│    Ergot Severity Reference  ✕ │
├─────────────────────────────────┤
│                                 │
│  ┌─────┐  1 - None (0%)        │
│  │ IMG │  No visible honeydew   │
│  └─────┘  or sphacelia         │
│                                 │
│  ┌─────┐  2 - Low (1-10%)      │
│  │ IMG │  Few droplets on      │
│  └─────┘  lower florets        │
│                                 │
│  ┌─────┐  3 - Moderate (11-25%)│
│  │ IMG │  Multiple droplets,   │
│  └─────┘  spread across panicle│
│                                 │
│  ┌─────┐  4 - High (26-50%)    │
│  │ IMG │  Heavy honeydew,      │
│  └─────┘  visible mold growth  │
│                                 │
│  ┌─────┐  5 - Severe (>50%)    │
│  │ IMG │  Entire panicle       │
│  └─────┘  affected, sclerotia  │
│                                 │
└─────────────────────────────────┘
```

### 10.3 Color Palette

| Color | Hex | Usage |
|-------|-----|-------|
| Primary Green | #2E7D32 | Headers, primary buttons |
| Light Green | #81C784 | Success states, healthy indicators |
| Warning Yellow | #FFC107 | Pending sync, warnings |
| Error Red | #D32F2F | Errors, high severity |
| Neutral Gray | #616161 | Text, borders |
| Background | #FAFAFA | Page background |
| Card White | #FFFFFF | Cards, inputs |

### 10.4 Accessibility Considerations

- Minimum touch target: 44x44px
- Color contrast ratio: ≥4.5:1 for text
- Support for system font scaling
- Screen reader labels for all interactive elements

---

## 11. Implementation Plan

### 11.1 Timeline Overview (2 Weeks - Simplified MVP)

```
Week 1: Foundation + Core Features
├── Day 1-2: Project setup, data models, basic API
├── Day 3-4: Trial & plot management UI
├── Day 5-6: Observation entry with disease scoring
└── Day 7: Buffer / catch-up

Week 2: Polish + Export
├── Day 8-9: Data export & summary statistics
├── Day 10-11: Testing & bug fixes
├── Day 12-13: UI polish & mobile responsiveness
└── Day 14: Demo preparation
```

**Key Simplifications from Original Plan:**
- ❌ Removed: Offline storage (Day 6)
- ❌ Removed: Authentication (Day 8)
- ❌ Removed: Team collaboration (Day 9)
- ❌ Removed: Cloud deployment (Day 13)
- ✅ Added: More buffer time for learning curve

### 11.2 Detailed Day-by-Day Plan (Simplified MVP)

#### **Day 1-2: Project Setup & Backend**
| Task | Deliverable |
|------|-------------|
| Initialize React project with TypeScript | Working dev environment |
| Configure Tailwind CSS | Styled base components |
| Set up project structure (frontend + backend) | Folder organization |
| Initialize FastAPI backend with SQLite | Running API server |
| Implement Trial model & API | CRUD for trials |
| Implement Plot model & API | CRUD for plots |
| Implement Observation model & API | CRUD for observations |
| API documentation (auto-generated Swagger) | Swagger docs at /docs |

#### **Day 3-4: Frontend - Trial & Plot Management**
| Task | Deliverable |
|------|-------------|
| Home screen with trial list | List of trials |
| Create trial form | New trial creation |
| Trial dashboard with progress indicator | Trial overview |
| Plot list view with search/filter | Searchable plot list |
| CSV import for plots | Bulk plot creation |
| Sequential plot navigation (auto-advance) | Next plot after save |

#### **Day 5-6: Observation Entry & Disease Scoring**
| Task | Deliverable |
|------|-------------|
| Observation entry form | Multi-trait form |
| Disease severity selector (1-5 buttons) | Large tappable buttons |
| Reference image modal (placeholder images OK) | Ergot reference guide |
| Date picker for flowering | Date input |
| Plant height numeric input | Height in cm |
| Notes field | Free-text input |
| Edit previous observations | Go back and modify |
| "Save & Next" flow | Auto-advance to next unscored plot |

#### **Day 7: Buffer & Review**
| Task | Deliverable |
|------|-------------|
| Fix bugs from days 1-6 | Bug fixes |
| Code cleanup | Cleaner codebase |
| Test on Chrome DevTools mobile emulation | Mobile responsiveness check |

#### **Day 8-9: Data Export & Statistics**
| Task | Deliverable |
|------|-------------|
| CSV export functionality | Download trial data as CSV |
| Summary statistics calculation | Mean, SD, min, max, count |
| Statistics display on dashboard | Numbers displayed (no charts) |
| Progress indicator (X/Y plots scored) | Visual progress |

#### **Day 10-11: Testing & Bug Fixes**
| Task | Deliverable |
|------|-------------|
| Manual testing of all features | Test checklist completed |
| Mobile responsiveness testing | Works on phone-sized screens |
| Bug fixes | All critical issues resolved |
| Error handling improvements | User-friendly error messages |

#### **Day 12-13: UI Polish**
| Task | Deliverable |
|------|-------------|
| Mobile responsiveness refinements | Better touch targets, spacing |
| Loading states | Feedback during API calls |
| Form validation messages | Clear error/success feedback |
| Overall visual polish | Professional appearance |
| Create sample demo data | Pre-populated trial for demo |

#### **Day 14: Demo Preparation**
| Task | Deliverable |
|------|-------------|
| Create demo script | Step-by-step walkthrough |
| Practice the demo flow | Smooth delivery |
| Prepare backup screenshots | Fallback if something breaks |
| Final bug fixes | Last-minute issues |

### 11.3 Risk Mitigation

| Risk | Probability | Impact | Mitigation |
|------|-------------|--------|------------|
| Learning curve (React + FastAPI) | High | Medium | Build incrementally with reviews; use simple patterns |
| Time overrun on features | Medium | High | MVP scope already simplified; focus on P0 only |
| Mobile responsiveness issues | Medium | Medium | Use Tailwind mobile-first; test early with Chrome DevTools |
| API integration issues | Medium | Medium | Use FastAPI auto-docs; test endpoints individually |
| Demo day technical issues | Low | High | Run on localhost; prepare backup screenshots |

### 11.4 Minimum Viable Demo (Absolute Minimum)

If time runs short, the **absolute minimum** for a successful demo:

1. ✅ Create a trial with plots (manual entry OK if CSV import incomplete)
2. ✅ Record observations with 1-5 disease severity buttons
3. ✅ View basic statistics (mean, count)
4. ✅ Export to CSV
5. ✅ Works on phone-sized screen (Chrome DevTools emulation OK)

### 11.5 Development Approach

- **Incremental development:** Build features in small chunks with review at each step
- **Testing:** Use Chrome DevTools for mobile emulation (no physical device required)
- **Deployment:** Localhost only for MVP (reduces complexity)
- **Data:** CSV import with headers: `plot_id, genotype, rep, row, column`
- **Disease scoring:** Large buttons (no slider), placeholder reference images acceptable

---

## 12. Testing Strategy (MVP)

### 12.1 MVP Testing Approach

For the 2-week MVP, focus on **manual testing** rather than automated tests:

```
                    ┌───────────────┐
                    │ Manual Testing│  (90%)
                    │ + DevTools    │
                   ─┴───────────────┴─
                  ┌───────────────────┐
                  │  Basic API Tests  │  (10%)
                  │  (FastAPI /docs)  │
                 ─┴───────────────────┴─
```

### 12.2 Manual Testing Checklist (MVP)

#### Core Functional Tests
- [ ] Can create a new trial with name, location, dates
- [ ] Can import plots from CSV file
- [ ] Can search/filter plots by ID or genotype
- [ ] Can navigate sequentially through plots
- [ ] Can record ergot severity (1-5 buttons work)
- [ ] Can view reference images modal
- [ ] Can enter flowering date
- [ ] Can enter plant height
- [ ] Can add notes to observation
- [ ] Can save observation and auto-advance to next plot
- [ ] Can go back and edit a previous observation
- [ ] Can view trial statistics (mean, min, max, count)
- [ ] Can export trial data to CSV
- [ ] CSV export contains all expected columns

#### Mobile Responsiveness (Chrome DevTools)
- [ ] Trial list readable on iPhone SE (375px width)
- [ ] Plot list scrollable and tappable
- [ ] Severity buttons are large enough to tap (44x44px minimum)
- [ ] Forms don't break on small screens
- [ ] Text is readable without zooming

### 12.3 API Testing

Use FastAPI's built-in Swagger UI at `/docs` to test:
- [ ] GET /trials - returns list of trials
- [ ] POST /trials - creates new trial
- [ ] GET /trials/{id}/plots - returns plots for trial
- [ ] POST /trials/{id}/plots/import - imports CSV
- [ ] POST /observations - creates observation
- [ ] PUT /observations/{id} - updates observation
- [ ] GET /trials/{id}/stats - returns statistics
- [ ] GET /trials/{id}/export - returns CSV

### 12.4 Test Data

```csv
# Sample CSV for plot import (plots.csv)
plot_id,genotype,rep,row,column
T1-R1-C1,IS8525,1,1,1
T1-R1-C2,IS14131,1,1,2
T1-R1-C3,ATx623,1,1,3
T1-R2-C1,IS8525,2,2,1
T1-R2-C2,IS14131,2,2,2
T1-R2-C3,ATx623,2,2,3
```

### 12.5 Post-MVP Testing (V1.1+)

| Test Type | Tools | Phase |
|-----------|-------|-------|
| Unit Tests (Backend) | pytest | V1.1 |
| Unit Tests (Frontend) | React Testing Library | V1.1 |
| E2E Tests | Playwright or Cypress | V1.2 |
| Offline Tests | Manual + Service Worker debugging | V1.1 |
| Cross-Browser | BrowserStack or manual | V1.1 |

---

## 13. Success Metrics

### 13.1 MVP Success Criteria (Seminar Demo)

| Metric | Target | Measurement |
|--------|--------|-------------|
| Feature Completion | 100% of P0 features | Checklist |
| Demo Reliability | Zero crashes during demo | Manual |
| Mobile Usability | All features work on phone-sized screen | Chrome DevTools |
| Load Time | < 3 seconds on localhost | Manual |
| Disease Scoring UI | Visual 1-5 buttons with reference images | Visual inspection |

### 13.2 Demo Success Definition

The demo is successful if you can show:
1. **Create trial** → Enter trial name, location, dates
2. **Import plots** → Upload CSV, see plots in list
3. **Score disease** → Tap 1-5 buttons, view reference images
4. **Enter observations** → Flowering date, plant height, notes
5. **Auto-advance** → Save and move to next plot automatically
6. **Edit previous** → Go back and modify an earlier observation
7. **View stats** → See mean, min, max for severity and height
8. **Export CSV** → Download file with all data

### 13.3 Post-MVP Success Metrics (If Adopted)

| Metric | Target (3 months) | Measurement |
|--------|-------------------|-------------|
| Active Users | 5+ researchers | Usage logs |
| Trials Created | 10+ trials | Database query |
| Observations Recorded | 1,000+ | Database query |
| Data Export Usage | 20+ exports | Usage logs |

---

## 14. Future Roadmap

### 14.1 Version 1.1 - Production Ready (Month 2-3)

| Feature | Description | Priority |
|---------|-------------|----------|
| Offline Support | IndexedDB + Service Worker + background sync | High |
| User Authentication | JWT login/register | High |
| Team Collaboration | Trial sharing, role-based access | High |
| Cloud Deployment | Vercel + Railway with PostgreSQL | High |
| Charts/Visualization | Histograms, disease heatmap | Medium |

### 14.2 Version 1.2 - Enhanced Collection (Month 4-6)

| Feature | Description | Priority |
|---------|-------------|----------|
| Image Capture | Attach photos to observations | High |
| GPS Tagging | Auto-record plot location | High |
| Barcode/QR Scanning | Scan plot tags for navigation | Medium |
| Weather Integration | Auto-fetch weather data | Medium |
| API Access | REST API for R/Python integration | Medium |

### 14.3 Version 2.0 - Advanced Features (Month 6-12)

| Feature | Description | Priority |
|---------|-------------|----------|
| ML Disease Scoring | Suggest severity from photo | High |
| BrAPI Integration | Connect to BreedBase and other systems | High |
| Statistical Analysis | Built-in ANOVA, correlation | Medium |
| Multi-Crop Support | Extend to cotton, peanut, corn | Medium |
| UGA SSO Integration | Login with UGA credentials | Low |

---

## 15. Appendix

### 15.1 Glossary

| Term | Definition |
|------|------------|
| **Ergot** | Fungal disease of sorghum caused by *Claviceps africana* |
| **Panicle** | The grain-bearing head of sorghum |
| **Honeydew** | Sticky sugary exudate produced by ergot infection |
| **Phenotyping** | Measuring observable plant characteristics |
| **Genotype** | The genetic makeup of a plant variety |
| **Rep** | Replication; repeated planting of same genotype |
| **PWA** | Progressive Web App; web app with native-like features |
| **IndexedDB** | Browser-based database for offline storage |

### 15.2 References

1. Bandyopadhyay, R., et al. (1998). Ergot: a new disease threat to sorghum in the Americas and Australia. Plant Disease 82, 356-367.
2. Dahlberg, J., et al. (2001). Evaluation of sorghum germplasm used in US breeding programmes for sources of sugary disease resistance. Plant Pathology.
3. Lin, Z., Guo, W. (2020). Sorghum Panicle Detection and Counting Using Unmanned Aerial System Images and Deep Learning. Frontiers in Plant Science.
4. UGA Institute for Integrative Precision Agriculture. https://iipa.uga.edu/
5. UGA SmartIrrigation Apps. https://smartirrigationapps.org/

### 15.3 Competitive Analysis Sources

#### Field Book
- [PhenoApps Apps](https://phenoapps.org/apps/)
- [Field Book GitHub](https://github.com/PhenoApps/Field-Book)

#### KDSmart
- [Diversity Arrays - KDSmart](https://www.diversityarrays.com/software/kddart-platform/kdsmart/)
- [KDSmart on Google Play](https://play.google.com/store/apps/details?id=com.diversityarrays.kdsmart)

#### GridScore
- [GridScore Official Site](https://gridscore.hutton.ac.uk/)
- [GridScore GitHub](https://github.com/cropgeeks/gridscore-next-client)

#### BreedBase
- [BreedBase Official Site](https://breedbase.org/)
- [Breedbase: A Digital Ecosystem (Oxford Academic)](https://academic.oup.com/g3journal/article/12/7/jkac078/6564228)

### 15.4 Contact Information

| Role | Name | Email |
|------|------|-------|
| Product Owner | [Your Name] | [your.email]@uga.edu |
| Technical Lead | [Your Name] | [your.email]@uga.edu |
| Research Advisor | [PI Name] | [pi.email]@uga.edu |

---

*Document Version History:*
| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-02-04 | [Your Name] | Initial PRD creation |
| 1.1 | 2026-02-05 | [Your Name] | Added competitive analysis; Simplified MVP scope (removed offline, auth, team features); Updated implementation plan; Added positioning statement |

---

**END OF DOCUMENT**
