# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

**SorghumField** is a mobile-first web app for sorghum phenotyping data collection, targeting researchers at UGA. It enables visual disease severity scoring (ergot, 1-5 scale with reference images), trait measurement (flowering date, plant height), and CSV data export.

## Context Files — READ THESE FIRST

Before starting work, read the relevant spec files:

| File | When to Read |
|------|--------------|
| `agent_docs/BACKEND_SPEC.md` | Any backend/API work |
| `agent_docs/FRONTEND_SPEC.md` | Any frontend/React work |
| `agent_docs/CURRENT_TASK.md` | **Always** — shows current session goals |
| `agent_docs/COMPLETED.md` | After `/clear` to recover context |
| `prd.md` | For domain understanding or edge cases |

## Tech Stack

- **Frontend**: React 18 + TypeScript, Tailwind CSS, React Router v6, useState/useContext
- **Backend**: FastAPI (Python), SQLAlchemy ORM, SQLite
- **Testing**: Manual via Chrome DevTools mobile emulation (MVP)

## Architecture

```
React SPA (localhost:5173)  →  REST API  →  FastAPI (localhost:8000)  →  SQLite
```

Three core entities: **Trial** → has many **Plot** → has many **Observation**

Traits are hardcoded for MVP:
- `ergot_severity` (categorical 1-5)
- `flowering_date` (date)
- `plant_height` (numeric cm, 50-400)

## MVP Constraints

- **Localhost only** — no cloud deployment
- **Single-user** — no authentication
- **Online-only** — no offline/PWA
- **No charts** — numeric stats only (mean, SD, min, max, count)
- Placeholder reference images acceptable for disease scoring

## Design Principles

1. **Mobile-first**: design for 375px width (iPhone SE), scale up
2. **Thumb-friendly**: critical actions in bottom 2/3 of screen
3. **44x44px minimum** touch targets
4. **High contrast**: ≥4.5:1 ratio, readable in bright sunlight
5. **Minimal taps**: most actions in ≤3 taps

## Color Palette

```
Primary Green:   #2E7D32  (headers, primary buttons)
Light Green:     #81C784  (success states)
Warning Yellow:  #FFC107  (warnings)
Error Red:       #D32F2F  (errors, high severity)
Neutral Gray:    #616161  (text, borders)
Background:      #FAFAFA
Card White:      #FFFFFF
```

## Key User Flows

1. **Create trial** → import plots via CSV → score disease (1-5 buttons) → "Save & Next" auto-advances
2. **View dashboard** with progress (X/Y plots scored) and summary stats
3. **Export** all observation data to CSV

## Code Style

### Python (Backend)
- Use type hints
- Pydantic for request/response schemas
- Keep functions focused and small
- Use FastAPI's dependency injection

### TypeScript (Frontend)
- Strict TypeScript — no `any`
- Functional components with hooks
- Keep components under 150 lines; extract sub-components
- Use Tailwind utility classes only — no custom CSS files

## Commands

```bash
# Backend
cd backend && uvicorn main:app --reload --port 8000

# Frontend  
cd frontend && npm run dev

# API docs
open http://localhost:8000/docs
```

## Domain Context

This tool is for **sorghum breeding research**, specifically ergot disease (*Claviceps africana*) resistance screening:

- **Ergot** produces honeydew droplets on panicles (grain heads)
- Severity measured at milk stage (10-12 days after 50% flowering)
- Typical trial: ~240 plots across multiple replications
- Research locations: UGA campuses in Tifton, Plains, Griffin, GA

## Session Management

This project uses **session-based development**:

1. Each session has a focused goal (see `CURRENT_TASK.md`)
2. Complete and test before moving to next session
3. Use `/clear` between sessions to reset context
4. Update `COMPLETED.md` after each session

**Do not** try to build everything at once. Follow the session plan.
