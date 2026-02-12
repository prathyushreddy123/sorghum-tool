# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**SorghumField** is a mobile-first PWA for sorghum phenotyping data collection, targeting researchers at UGA. It enables visual disease severity scoring (ergot, 1-5 scale with reference images), trait measurement (flowering date, plant height), and CSV data export. The full PRD is in `prd.md`.

## Tech Stack

- **Frontend**: React 18 + TypeScript, Tailwind CSS, React Router v6, useState/useContext (no external state lib)
- **Backend**: FastAPI (Python), SQLAlchemy ORM, SQLite
- **Testing**: Manual testing via Chrome DevTools mobile emulation (MVP); pytest and React Testing Library planned post-MVP

## Architecture

```
React SPA (localhost:3000)  →  REST API  →  FastAPI (localhost:8000)  →  SQLite
```

Three core entities: **Trial** → has many **Plot** → has many **Observation**. Traits are hardcoded for MVP: `ergot_severity` (categorical 1-5), `flowering_date` (date), `plant_height` (numeric cm). The API auto-generates Swagger docs at `/docs`.

## MVP Scope Constraints

- Localhost only, single-user (no auth), online-only (no offline/PWA)
- No charts or visualizations — numeric stats only (mean, SD, min, max, count)
- Placeholder reference images acceptable for disease scoring
- CSV import format: `plot_id, genotype, rep, row, column`

## Design Principles

- **Mobile-first**: design for phone screens (test at iPhone SE 375px width), scale up
- **Thumb-friendly**: critical actions in bottom 2/3 of screen, minimum 44x44px touch targets
- **High contrast**: readable in bright sunlight, ≥4.5:1 color contrast ratio
- **Minimal taps**: most common actions in ≤3 taps
- Color palette: Primary Green #2E7D32, Light Green #81C784, Warning Yellow #FFC107, Error Red #D32F2F, Background #FAFAFA

## Key User Flows

1. Create trial → import plots via CSV → score disease severity with 1-5 buttons → "Save & Next" auto-advances to next unscored plot
2. View trial dashboard with progress (X/Y plots scored) and summary stats
3. Export all observation data to CSV for R/Python analysis

## Domain Context

This tool is for sorghum breeding research, specifically ergot disease (caused by *Claviceps africana*) resistance screening. Ergot produces honeydew droplets on panicles, measured at milk stage. A typical trial has ~240 plots. Research is conducted at UGA campuses in Tifton, Plains, and Griffin, GA.
