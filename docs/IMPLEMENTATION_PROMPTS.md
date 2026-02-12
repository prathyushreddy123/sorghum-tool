# SorghumField Implementation Prompts

Copy-paste these prompts into Claude Code for each session.

---

## Pre-Session Checklist

Before each session:
1. Make sure you're in the project root directory
2. Update `agent_docs/CURRENT_TASK.md` with the correct session number
3. If continuing after a break, review `agent_docs/COMPLETED.md`

---

## SESSION 1: Backend Foundation (Day 1-2)

```
Read agent_docs/BACKEND_SPEC.md and agent_docs/CURRENT_TASK.md first.

Build the complete FastAPI backend for SorghumField. This is Session 1 of 5.

DELIVERABLES:
1. Project structure: backend/ with FastAPI app
2. SQLite database with SQLAlchemy models: Trial, Plot, Observation
3. All CRUD endpoints per the spec
4. CSV import endpoint for plots
5. Statistics endpoint (mean, SD, min, max, count per trait)
6. CSV export endpoint
7. Swagger docs accessible at /docs

CONSTRAINTS:
- Python 3.11+, FastAPI, SQLAlchemy, SQLite
- No authentication (MVP)
- Traits are hardcoded: ergot_severity, flowering_date, plant_height
- Keep it simple — no fancy abstractions

VALIDATION:
After building, test these via Swagger UI:
- POST /trials → create a trial
- POST /trials/{id}/plots/import → upload test CSV
- GET /trials/{id}/plots → list plots
- POST /observations → create observation
- GET /trials/{id}/stats → get statistics
- GET /trials/{id}/export → download CSV

Think hard about the data model relationships before coding.
```

**After Session 1:**
- Update `agent_docs/COMPLETED.md` with what was built
- Update `agent_docs/CURRENT_TASK.md` status to COMPLETE
- Test all endpoints via Swagger
- `/clear` before Session 2

---

## SESSION 2: Frontend Shell + Trial Management (Day 3-4)

```
Read agent_docs/FRONTEND_SPEC.md and agent_docs/CURRENT_TASK.md first.
The backend is complete — API runs at localhost:8000.

Build the frontend shell and trial/plot management. Session 2 of 5.

DELIVERABLES:
1. React 18 + TypeScript project in frontend/ (use Vite)
2. Tailwind CSS configured with our color palette
3. React Router with routes: /, /trials/:id, /trials/:id/plots, /trials/:id/collect, /trials/:id/collect/:plotId
4. API client module for backend calls
5. Trial list page (home)
6. Create trial form
7. Trial dashboard with progress indicator
8. Plot list with search/filter
9. CSV import UI (file upload + API call)

CONSTRAINTS:
- Mobile-first: design for 375px width, scale up
- Use Tailwind utility classes only
- useState/useContext for state (no Redux)
- Touch targets minimum 44x44px

VALIDATION:
- Can create a new trial
- Can import plots from CSV
- Can see plot list and search by plot_id
- Progress shows 0/N plots scored
- Works on Chrome DevTools iPhone SE emulation

Think hard through the component hierarchy before coding.
```

**After Session 2:**
- Update `agent_docs/COMPLETED.md`
- Test the full trial creation → plot import flow
- `/clear` before Session 3

---

## SESSION 3: Observation Entry (Day 5-6) — MOST CRITICAL

```
Read agent_docs/FRONTEND_SPEC.md and agent_docs/CURRENT_TASK.md first.
Trial/plot management is complete. Session 3 of 5.

Build the observation entry flow — this is the core of the app.

DELIVERABLES:
1. Observation entry page at /trials/:id/collect/:plotId
2. Disease severity selector: 5 LARGE buttons (1-5) in a row
   - Buttons show: number + label (None, Low, Mod, High, Sev)
   - Selected button has visual highlight (filled bg)
   - NOT a slider — discrete tappable buttons
3. "View Reference Images" button → modal with placeholder images
   - 5 sections, one per severity level
   - Placeholder: colored boxes with severity description
4. Flowering date picker (native date input is fine)
5. Plant height numeric input (cm) with validation 50-400
6. Notes textarea
7. "Save & Next" button that:
   - Saves all observations via bulk API
   - Auto-advances to next UNSCORED plot
   - Shows success feedback
8. Navigation to go back to previous plots
9. Ability to edit existing observation (load saved values on page load)

CONSTRAINTS:
- Severity buttons must be minimum 60px tall, easily tappable
- Form should be usable with one thumb
- Clear visual feedback on save (toast or similar)
- Handle API errors gracefully with user message
- If no more unscored plots, show completion message

VALIDATION:
- Can score ergot severity by tapping button
- Can enter flowering date via date picker
- Can enter height with validation (rejects <50 or >400)
- Save & Next advances to next unscored plot
- Can go back and edit previous observation (values pre-filled)
- Reference image modal opens and closes
- Works smoothly on iPhone SE emulation

This is the most important feature. Think hard before implementing.
```

**After Session 3:**
- Test the full data collection workflow end-to-end
- Create 5-10 test observations
- Verify edit functionality
- `/clear` before Session 4

---

## SESSION 4: Export & Statistics (Day 8-9)

```
Read agent_docs/FRONTEND_SPEC.md and agent_docs/CURRENT_TASK.md first.
Data collection flow is complete. Session 4 of 5.

Build data export and statistics display.

DELIVERABLES:
1. Trial dashboard improvements:
   - Progress bar: "X/Y plots scored" with visual bar
   - Stats cards showing per-trait statistics:
     - Ergot: mean, SD, min, max, count
     - Height: mean, SD, min, max, count  
     - Flowering: count, earliest date, latest date
   - Stats should refresh when navigating back to dashboard
2. CSV export button on dashboard
   - Triggers file download
   - Filename: {trial_name}_{YYYY-MM-DD}.csv
   - Columns: plot_id, genotype, rep, row, column, ergot_severity, flowering_date, plant_height, notes, recorded_at
3. Loading states while stats calculate
4. Empty states when no observations yet

CONSTRAINTS:
- Stats are numeric display only — NO charts for MVP
- Use the StatCard component pattern from spec
- Handle edge cases: no observations, partial data, missing values

VALIDATION:
- Progress bar shows correct X/Y count
- Stats are accurate (manually verify with 3-4 observations)
- CSV downloads with correct filename
- CSV opens correctly in Excel/Google Sheets
- Stats update after adding new observations
- Empty state shows when no data
```

**After Session 4:**
- Export CSV and verify all columns
- Check stats math manually
- `/clear` before Session 5

---

## SESSION 5: Polish & Demo Prep (Day 10-14)

```
Read agent_docs/CURRENT_TASK.md first.
Core features complete. Session 5 of 5 — polish and demo preparation.

DELIVERABLES:
1. Mobile responsiveness audit:
   - Test ALL screens at 375px width (iPhone SE)
   - Fix any overflow, cut-off text, or touch target issues
   - Ensure buttons are easily tappable
2. Loading states for all API calls
3. Error handling with user-friendly messages
4. Form validation messages (clear feedback)
5. Create demo seed script or manual demo data:
   - 1 trial: "Perennial Ergot Trial 2026", Tifton GA
   - 20 plots with realistic genotype names (IS8525, ATx623, etc.)
   - 12 pre-filled observations with varied severity (1-5 distribution)
6. Create DEMO_SCRIPT.md with step-by-step walkthrough

CONSTRAINTS:
- NO new features — polish only
- Prioritize mobile over desktop appearance
- Demo must run reliably from cold start

VALIDATION:
Complete this demo flow without errors:
1. Start both servers fresh
2. Navigate to home, see trial list
3. Click into trial, see dashboard with stats
4. Click "Record", land on first unscored plot
5. Score severity (tap button), enter height, enter date
6. Save & Next, confirm it advances
7. Go back, edit previous observation
8. Return to dashboard, see updated stats
9. Export CSV, open in spreadsheet app
10. All screens work on iPhone SE emulation
```

---

## Emergency Recovery Prompt

If things go wrong mid-session:

```
Something broke. Let me describe the current state:

WHAT WORKS:
- [list working features]

WHAT'S BROKEN:
- [describe the error/issue]

RECENT CHANGES:
- [what was just changed before it broke]

Please:
1. Diagnose the root cause
2. Propose the minimal fix
3. Implement only the fix, don't refactor other code

Show me the fix before applying it.
```

---

## Tips for Success

1. **Don't skip reading the spec files** — they contain critical details
2. **Test incrementally** — don't write 500 lines then test
3. **Use `/clear` between sessions** — fresh context = better results
4. **Update COMPLETED.md** — future-you will thank past-you
5. **Mobile-first always** — test on iPhone SE emulation early and often
6. **When stuck**: describe the problem clearly, show error messages, share relevant code

Good luck! 🌾
