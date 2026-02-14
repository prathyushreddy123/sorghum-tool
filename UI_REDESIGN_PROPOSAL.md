# SorghumField UI Redesign Proposal

## Research Sources
- Field Book (PhenoApps), KDSmart, GridScore, PhenoApp
- Material Design 3, Apple HIG, Nielsen Norman Group
- Agricultural phenotyping UX case studies

---

## Current State: What Works Well

- 44px+ touch targets throughout
- Green primary color (high luminance, good for outdoor LCD visibility)
- Auto-advance to next unscored plot via "Save & Next"
- CollectRedirect for smart "jump to first unscored"
- Inline AI severity prediction from photos
- Good mobile viewport handling (320px min, max-w-2xl)

---

## The Problems

### 1. ObservationEntry is a scroll-heavy wall of inputs

This is the screen researchers use **240+ times per trial**. Currently it requires scrolling through:
- Plot header + GPS + weather
- Panicle photo section
- AI prediction status
- Severity selector (5 buttons)
- Reference images link
- Flowering date input
- Height measurement (2 method buttons + result)
- Plant height number input
- Notes textarea
- Save buttons (2)
- Prev/Next navigation

On an iPhone SE (375x667), this requires **3+ scroll lengths** to see everything. The "Save & Next" button — the most critical action — is buried at the bottom.

### 2. No fixed bottom action bar

"Save & Next" and "Prev/Next" navigation disappear when scrolling. Every competitor app (Field Book, KDSmart, GridScore) uses a **sticky bottom bar** for navigation. Researchers lose time scrolling to find the save button.

### 3. All traits treated equally (no progressive disclosure)

Severity scoring happens on **every** plot. Height and flowering date are often collected on **subsets** or at different times. Yet all traits are shown with equal visual weight, cluttering the primary task.

### 4. Severity selector lacks inline reference images

Research shows that **showing the reference image for the selected severity inline** significantly improves scoring accuracy and inter-rater consistency. Currently, reference images require tapping a link to open a separate modal — an extra tap that most users will skip after the first few plots.

### 5. No spatial progress overview

Researchers working a physical field want to see **where** they've scored and where gaps remain. The heatmap exists but is a separate page. KDSmart and GridScore make the field-plan grid the **primary** navigation surface.

### 6. No dark/high-contrast mode for field conditions

At noon in Tifton, GA in July, screen glare is severe. The app has no high-contrast or dark mode toggle.

### 7. Navigation is header-back-arrow only

No bottom tab bar, no breadcrumbs. The only way "back" is the header arrow (which uses `navigate(-1)` and can behave unpredictably after Save & Next replaces history entries).

---

## Proposed UI Redesign

### A. Observation Entry — The 2-Tap Scoring Screen

This is the highest-impact change. Redesign for the common case: **score severity and advance in 2 taps**.

```
┌─────────────────────────────────────┐
│ ← Plot 47/240          TX-430 Rep 2 │  ← Compact header (always visible)
│   R3 C12 · 32°C 65%RH              │
├─────────────────────────────────────┤
│                                     │
│  ┌─────────────────────────────┐    │
│  │  [Reference image for       │    │  ← Shows image for selected
│  │   currently selected score] │    │     severity (or placeholder
│  │         ~200px tall         │    │     if none selected)
│  └─────────────────────────────┘    │
│                                     │
│  ┌───┐ ┌───┐ ┌───┐ ┌───┐ ┌───┐    │
│  │ 1 │ │ 2 │ │ 3 │ │ 4 │ │ 5 │    │  ← Large severity buttons
│  │   │ │   │ │███│ │   │ │   │    │     (selected = filled green)
│  │Non│ │Low│ │Mod│ │Hi │ │Sev│    │     Each 60px+ tall
│  └───┘ └───┘ └───┘ └───┘ └───┘    │
│                                     │
│  📸 Panicle photos: [thumb][thumb]+ │  ← Compact photo row
│                                     │
│  ▼ More Traits ──────────── (2/3)  │  ← Collapsible, shows count
│  ┌─────────────────────────────┐    │     of filled traits
│  │ Flowering: [Today][Yest][___]│   │
│  │ Height:  [📐Phone][📷AI] 142cm│  │
│  │ Notes:   [________________] │    │
│  └─────────────────────────────┘    │
│                                     │
├─────────────────────────────────────┤
│  [◄ Prev]     47/240    [Save & ►] │  ← STICKY bottom bar
│                                     │     (never scrolls away)
└─────────────────────────────────────┘
```

**Key changes:**

| Change | Why |
|--------|-----|
| **Inline reference image** for selected severity | Improves scoring accuracy (Estimate App research). No extra tap needed. |
| **Sticky bottom bar** with Save & Next + Prev/Next + counter | Most critical action always reachable. Every competitor does this. |
| **Collapsible "More Traits"** section | Progressive disclosure — severity-only scoring = zero scrolling. Shows badge count of filled secondary traits. |
| **Compact plot header** (single line) | Saves vertical space. Genotype + rep on same line as plot number. GPS/weather as tiny inline badges. |
| **Photo thumbnails inline** with severity | Panicle photos directly below severity (the AI connection is obvious). |
| **Flowering date shortcuts** | "Today" / "Yesterday" buttons + date picker. PhenoApp proved this saves significant time. |

### B. Bottom Tab Navigation

Replace the header-only back arrow with a persistent bottom tab bar on main screens:

```
┌─────────────────────────────────────┐
│  🏠 Trials  │  📊 Dashboard  │  ⚙️  │
└─────────────────────────────────────┘
```

During observation entry (the scoring flow), the bottom bar transforms into the **action bar** (Save & Next, Prev/Next). This is the pattern used by KDSmart and most modern mobile apps.

### C. Severity Selector with Color Coding

Currently all selected severity buttons are the same green. Match the heatmap/histogram color scale for visual consistency:

| Score | Color | Label |
|-------|-------|-------|
| 1 | `#4CAF50` (green) | None |
| 2 | `#8BC34A` (lime) | Low |
| 3 | `#FFC107` (amber) | Moderate |
| 4 | `#FF9800` (orange) | High |
| 5 | `#D32F2F` (red) | Severe |

This creates a **semantic color scale** — the user instantly associates color with severity across the entire app (buttons, heatmap, histogram, dashboard).

### D. Dashboard Field-Plan Grid (Mini Heatmap)

Add a **mini field-plan grid** directly on the trial dashboard. The field plan is the physical layout of the trial — a grid matching how plots are planted in rows and columns in the actual field. This replaces navigating to a separate heatmap page.

**Behavior adapts to trial size:**

| Plot Count | Cell Content | Interaction |
|------------|-------------|-------------|
| **< 30 plots** | Full plot ID inside cell (e.g., "P001") | Tap cell → go to that plot's observation entry |
| **30-100 plots** | Abbreviated ID (e.g., "01") | Tap cell → go to that plot's observation entry |
| **100+ plots** | Color-coded dot only (scored=severity color, unscored=gray) | Tap cell → popup showing plot ID + genotype + severity → tap popup to navigate |

**Color coding:** Scored cells use the severity color scale (green→red for 1→5). Unscored cells are gray. This matches the existing heatmap colors.

```
┌─────────────────────────────────────┐
│  Trial Progress         128/240 53% │
│  ████████████░░░░░░░░░░             │
│                                     │
│  Field Plan                         │
│  ┌────┬────┬────┬────┬────┐        │
│  │P001│P002│P003│P004│P005│  R1    │  ← Small trial (<30):
│  │ 🟢 │ 🟡 │ 🟠 │ ⬜ │ ⬜ │        │     plot ID + color inside cell
│  ├────┼────┼────┼────┼────┤        │     Tap → goes to plot directly
│  │P006│P007│P008│P009│P010│  R2    │
│  │ 🔴 │ 🟢 │ ⬜ │ ⬜ │ ⬜ │        │
│  └────┴────┴────┴────┴────┘        │
│   C1   C2   C3   C4   C5           │
│                                     │
│  [▶ Resume Scoring]                 │  ← Goes to next unscored
│  [📊 Full Heatmap]                  │
└─────────────────────────────────────┘

┌─────────────────────────────────────┐
│  Large trial (100+):                │
│  ┌─┬─┬─┬─┬─┬─┬─┬─┬─┬─┐           │
│  │●│●│●│●│●│○│○│○│○│○│  R1        │  ← Color dots only
│  │●│●│●│●│○│○│○│○│○│○│  R2        │     ● = scored (severity color)
│  │●│●│●│○│○│○│○│○│○│○│  R3        │     ○ = unscored (gray)
│  └─┴─┴─┴─┴─┴─┴─┴─┴─┴─┘           │
│                                     │
│  Tap a cell → popup:                │
│  ┌──────────────────────┐           │
│  │ P047 · TX-430 Rep 2  │           │
│  │ Severity: 3 (Mod)    │           │
│  │ [Go to Plot →]       │           │
│  └──────────────────────┘           │
└─────────────────────────────────────┘
```

This gives researchers the **spatial awareness** that GridScore proved is critical. They can see where they left off, which field sections still need scoring, and jump directly to any plot.

### E. Swipe Navigation Between Plots

During observation entry, support **left swipe = next plot**, **right swipe = previous plot**. This is the natural gesture equivalent of "flipping through" plots. Implementation notes:
- Use 20px edge gutters to avoid conflicting with iOS back-swipe
- Show a subtle slide animation
- Auto-save on swipe (with haptic confirmation)
- Can be toggled off in settings

### F. High-Contrast / Sunlight Mode

A toggle in settings (or auto-detect via ambient light sensor) that:
- Increases font weight to bold across the board
- Bumps body text to 18px
- Removes shadows, gradients, and subtle gray borders
- Uses pure black text on pure white background (21:1 contrast)
- Makes severity buttons even larger (72px tall)

### G. Toast → Snackbar with Undo

Replace the current 2-second auto-dismiss toast with a Material Design 3 snackbar pattern:

```
┌─────────────────────────────────────────────┐
│  ✓ Saved Plot 47 (Severity: 3)       [UNDO] │
└─────────────────────────────────────────────┘
```

Shows what was saved, provides an undo option for 4 seconds. This gives researchers confidence their data was recorded correctly without interrupting flow.

### H. Observation Entry — Detailed Interaction Improvements

| Current | Proposed | Rationale |
|---------|----------|-----------|
| Height: two buttons + number input (confusing linkage) | Single "Height" row: `[📐 Phone] [📷 AI] [142] cm` all inline | Clear that all three relate to the same field |
| Notes: separate textarea at bottom | Notes icon in header bar, opens bottom sheet | Notes are rare — don't waste permanent screen space |
| GPS shown as coordinates | GPS shown as colored dot (green=captured, yellow=pending, red=denied) | Coordinates are meaningless to users in the field |
| Weather shown as text | Weather as tiny icon+number badge in header: `🌡32° 💧65%` | Informational, shouldn't take a full line |
| "Save & Next" + "Save (Stay Here)" both full-width | Primary: "Save & Next" in sticky bar. "Save (Stay)" as long-press on Save or in overflow menu | Two save buttons cause decision fatigue 240 times |
| Separate "View Reference Images" link | Reference image auto-shows inline when severity selected | Eliminates an extra tap; proven to improve accuracy |

### I. Settings & Onboarding

- Move "Settings" from the trial list page to the bottom tab bar (gear icon)
- Add a **first-run tutorial** overlay (3 slides max) showing: how to score, how to use the clinometer, how to navigate between plots
- Store tutorial-seen flag in localStorage

---

## Priority Ranking

| Priority | Change | Impact | Effort |
|----------|--------|--------|--------|
| **P0** | Sticky bottom action bar (Save & Next + nav) | Eliminates scroll-to-save on every plot | Low |
| **P0** | Progressive disclosure (collapsible "More Traits") | Severity-only scoring = zero scroll | Medium |
| **P1** | Inline reference image for selected severity | Proven accuracy improvement | Medium |
| **P1** | Severity buttons with semantic colors (match heatmap) | Visual consistency, faster cognition | Low |
| **P1** | Compact plot header (single line) | Saves ~80px vertical space | Low |
| **P2** | Bottom tab navigation (Trials / Dashboard / Settings) | Proper app-like navigation | Medium |
| **P2** | Flowering date shortcuts (Today / Yesterday buttons) | Fewer taps per plot | Low |
| **P2** | Snackbar with undo (replace toast) | Confidence + error recovery | Low |
| **P2** | Mini field-plan grid on dashboard | Spatial progress awareness | Medium |
| **P3** | Swipe navigation between plots | Faster one-handed use | Medium |
| **P3** | High-contrast / sunlight mode | Field usability in bright sun | Medium |
| **P3** | Height input unification (inline row) | Reduces confusion | Low |

---

## Tap Count Comparison

**Current flow (severity only):**
Score severity (1) → scroll down (1-2 swipes) → tap Save & Next (1) → **3-4 interactions**

**Proposed flow (severity only):**
Score severity (1) → tap Save & Next in sticky bar (1) → **2 interactions**

**Current flow (full data collection):**
Photo (1) → wait for AI → maybe change severity (1) → scroll → flowering (2+) → scroll → height method (1) → enter height (2+) → scroll → notes (2+) → scroll → Save & Next (1) → **10+ interactions with 4+ scrolls**

**Proposed flow (full data collection):**
Score severity (1) → photo (1) → expand More Traits (1) → tap Today for flowering (1) → phone height (1) → Save & Next (1) → **6 interactions, 0 scrolls**

---

## Competitor App Patterns Reference

### Field Book (PhenoApps)
- Custom trait layouts per data type (numeric, categorical, date, photo)
- Plot-sequential navigation with toolbar arrows + "Quick GoTo" dialog
- Configurable InfoBars for plot metadata
- Inline photo capture within workflow

### KDSmart
- Three scoring modes: Sheet, Path (sequential), Field (spatial grid)
- Auto-advance after scoring (user-toggleable)
- Left/right-handed mode toggle
- Dark/light mode for glare
- Barcode scanning for plot navigation

### GridScore
- Grid-based overview mirrors physical field layout (primary UI)
- Color-coded progress dots per trait (colorblind-safe)
- Guided walk mode (8 navigation patterns including serpentine)
- Speech recognition for data entry (glove-friendly)
- Text-to-speech confirmation of recorded values

### PhenoApp
- Zigzag navigation matching physical field walking pattern
- "First empty" jump button for next unscored
- Inline descriptor reference images during scoring
- Date shortcuts: "Today", "Yesterday", "Day before yesterday"
- Remarks button for quick notes

---

## Research-Backed Design Principles

### Outdoor/Field Conditions
- Minimum 7:1 contrast ratio (WCAG AAA) for outdoor readability
- Light backgrounds + dark text outperform dark mode in sunlight
- Bold sans-serif fonts, 16px+ body text, 18-24px+ for labels/scores
- Minimize UI chrome (shadows, gradients) that reduce contrast

### One-Handed / Glove Use
- Primary actions in bottom 2/3 of screen (thumb zone)
- 48x48dp minimum touch targets with 8dp spacing (glove-compatible)
- Full-width buttons for primary actions
- Swipe gestures as complement to button taps
- Support speech input as fallback (post-MVP)

### Progressive Disclosure (Nielsen Norman Group)
- Limit to exactly 2 layers: primary (always visible) + secondary (expandable)
- Primary: severity + save (the 240x-per-trial actions)
- Secondary: height, flowering, photos, notes (subset/occasional)
- Make secondary layer discoverable with clear label + count badge

### Wizard/Step Flows
- Progress indicator always visible (plot X/Y counter)
- Sticky bottom bar for navigation controls
- Haptic feedback on save (light pulse) and score selection
- Auto-save on navigation to prevent data loss

---

*Document created: Feb 2026*
*Based on research of Field Book, KDSmart, GridScore, PhenoApp, Material Design 3, Apple HIG, and Nielsen Norman Group guidelines.*
