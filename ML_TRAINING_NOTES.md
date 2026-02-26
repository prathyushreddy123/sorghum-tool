# ML Training — Decisions & Rationale

Captures key Q&A discussions about the AI training architecture for SorghumField.
Use this as a reference when onboarding new team members or making future training decisions.

---

## 1. Who Should Control Training?

**Decision: Admin-only write access, read-only for everyone.**

| Action | Admin | Collector |
|--------|-------|-----------|
| View model status | Yes | Yes |
| View training history & metrics | Yes | Yes |
| View reference images | Yes | Yes |
| Trigger training jobs | Yes | No |
| Upload/delete reference images | Yes | No |
| Cancel training jobs | Yes | No |
| Submit training samples (passive) | Yes | Yes |

**Why not single-person control:**
Locking training to one individual creates a single point of failure. If that person is unavailable (field work, travel), nobody can retrain a degrading model. The `role='admin'` system lets you delegate to trusted collaborators without code changes.

**Why not open to everyone:**
Collectors in the field shouldn't accidentally trigger training jobs or delete reference images that anchor the model's understanding of each severity level.

**Implementation:**
- Backend: `require_admin` dependency on write endpoints (returns 403 for non-admins)
- Frontend: controls hidden for non-admin users based on `user.role`
- Role assigned per user in the database — change via DB or admin UI

---

## 2. Is the Trained Model Shared Across All Users?

**Yes — one model serves everyone using the app.**

- ONNX model lives in `frontend/public/models/<trait>-v1.onnx`
- Every user's browser downloads and runs the same model
- Training samples from **all users across all locations** feed into the same model
- When admin retrains, everyone gets the improved model on next page load

**Why shared is the right default for UGA sorghum research:**
- Ergot severity is biological — a "4" in Tifton looks the same as a "4" in Griffin
- Pooling data from multiple locations gives more diversity (lighting, angles, genotypes)
- A model trained on 500 samples from 3 locations outperforms one trained on 150 from one site

**When per-institution models make sense:**
Only needed if institutions have fundamentally different scoring cultures or crop varieties. The manifest architecture already supports it — add institution-specific keys like `ergot_severity_uga` vs `ergot_severity_purdue` and serve different model URLs per team.

---

## 3. Label Noise Risk

**What it is:**
When different researchers score visually similar images differently, the model receives contradictory training signals and can't learn a clean decision boundary.

**Concrete example:**
```
image_001.jpg  →  Researcher A (Tifton): severity 4  (28% honeydew, scored High)
image_002.jpg  →  Researcher B (Griffin): severity 3  (visually similar, scored Moderate)
```

The model sees nearly identical images with different labels. It becomes uncertain at the 3-4 threshold — exactly where field decisions matter most. Confidence drops below 0.70, so it escalates to the API fallback instead of giving a fast local prediction.

**Feedback loop amplification:**
```
Round 1: Model uncertain → suggests "3" to Griffin researcher
Round 2: They accept it → more "3" labels for borderline panicles
Round 3: Model biased toward "3" → trains on its own wrong suggestions
```
The model learns the researcher's bias, not the actual biology.

**Why risk is LOW for current UGA setup:**
- Single research group, shared scoring protocol
- 27 reference images anchor each severity level visually
- 1-5 scale with explicit percentage ranges (e.g. "High: 26-50%") is objective enough for consistent scoring

---

## 4. Mitigating Label Noise for Multiple Universities

### Option A: AI Agreement Filter (implement now — already wired)
Only use samples where researcher's score matches AI prediction.

```python
# training_samples.source already has this field
source = 'ai_confirmed'   # researcher and AI agreed → use for training
source = 'user_label'     # AI disagreed → exclude from training
```

Filter training export to `source='ai_confirmed'`. Costs nothing to implement.

### Option B: Consensus Labeling (when 3+ institutions)
Only promote a sample to training when 2+ researchers independently give the same score.

Requires: add `user_id` to `TrainingSample`, collect multiple votes before training promotion.
Based on: same principle as Amazon Mechanical Turk and professional labeling platforms.

```
image_001.jpg → Researcher A: 4,  Researcher B: 4  → ✅ consensus → train
image_002.jpg → Researcher A: 4,  Researcher B: 3  → ❌ disagreement → skip
```

### Option C: Calibration Round (when 5+ institutions)
Before a new institution onboards, run a calibration session: show everyone the same 10 reference panicles. Flag institutions whose median deviates > 0.5 from reference answers. Their data gets lower weight or excluded until calibration passes.

Used by: CGIAR, large multi-site breeding networks.

### Option D: Per-Institution Adapter Models (at scale)
Train one shared base model on high-confidence data. Fine-tune a lightweight adapter per institution. Each university gets a model calibrated to their scoring style while benefiting from the shared backbone.

Requires: `institution_id` on `TrainingJob` + `TrainingSample`, multiple model files in manifest.

### Recommended Rollout:
```
Now:          Option A — AI agreement filter (zero cost, already infrastructured)
3+ sites:     Option B — Consensus labeling
5+ sites:     Option C — Calibration round
Scale:        Option D — Per-institution adapters
```

---

## 5. Training Frequency — On-Demand vs Continuous

**Current design: manual, on-demand.**

Admin decides when to train. Nothing triggers automatically.

**Why continuous training is risky for field phenotyping:**
- Bad photos uploaded mid-season → model silently degrades overnight
- Model shifts while researchers are actively scoring → inconsistent suggestions within a trial
- Breaks reproducibility — can't cite which model version produced which suggestions

**What production ML pipelines actually do:**
Scheduled retraining with quality gates, not continuous:
```
When N new samples arrive (e.g. 300+) AND AI agreement rate > 80%:
  → Auto-queue training job for admin to approve
  → Admin reviews, confirms → training runs
```

**For SorghumField specifically:**
Retrain **between seasons, not during**. Every plot in a trial should be scored with the same model version for internal consistency and publication reproducibility.

---

## 6. The Two Photo Flows (Training vs Field Use)

These are completely separate and easy to confuse.

### Flow 1: Training Setup (one-time, pre-season)
```
Admin uploads reference photos to /settings/training
        ↓
Photos stored in backend/reference_images/ergot_severity/
        ↓
Admin clicks "Train Model"
        ↓
train_model.py runs, produces ergot-severity-v1.onnx
        ↓
Model deployed to frontend/public/models/
        ↓
Done. Don't touch again until next season.
```

### Flow 2: Daily Field Use (every plot, every day)
```
Researcher walks to Plot 042
        ↓
Takes panicle photo with phone camera
        ↓
Local ONNX model runs in browser (<200ms, offline)
        ↓
"AI suggests: severity 4 (85% confidence)"
        ↓
Researcher confirms → taps 4 → Save & Next
        ↓
No manual scoring needed
```

**Where manual input comes back:**
Only when AI is wrong or uncertain (confidence below threshold):
```
AI says: severity 3 (58% confidence — below 0.70 threshold)
        ↓
App shows: "Low confidence — please score manually"
        ↓
Researcher scores: 4
        ↓
Correction saved as training sample (source='user_label')
        ↓
Accumulates for next season's retraining
```

---

## 7. Retraining Timeline for This App

**Context:** ~3 UGA locations, ~240 plots/trial, 2-5 researchers, 1-2 seasons/year.

### Realistic Schedule:
```
Year 1, Pre-season (Feb-Mar):
  27 reference images → bootstrap training
  Model accuracy: ~65-70%

Year 1, Post-season (Oct-Nov):
  ~500-800 new labeled samples
  (240 plots × 2-3 rounds × ~30% correction rate)
  Retrain → accuracy: ~82-87%

Year 2, Post-season:
  ~300-500 new samples (fewer corrections now)
  Retrain → accuracy: ~90-93%

Year 3+:
  Retrain only when triggered (see table below)
```

### Trigger Thresholds:
| New samples since last training | Action |
|---------------------------------|--------|
| < 100 | Don't retrain — insufficient signal |
| 100–300 | Retrain only if accuracy visibly dropped |
| 300–500 | Worth retraining — noticeable improvement |
| 500+ | Definitely retrain — significant gains expected |

### Why infrequent retraining is fine here (unlike typical ML apps):
- **Field season is fixed** — ergot scoring window is ~2-3 weeks at milk stage
- **Sample volume is bounded** — 240 plots × 3 locations = 720 max samples/season
- **Biology doesn't change** — ergot on sorghum looks the same in 2025 and 2030

### Retrain mid-season only if:
A severity level was severely underrepresented in training data (e.g. only 1 reference image for severity 1) and you've added significantly more. Don't retrain just because new samples arrived.
