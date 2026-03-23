# GLA Website Content Master
**Version:** Week 3 Close / Week 4 Entry  
**Last Updated:** March 21, 2026  
**Authority:** GLA App Project (this document is updated by the App project and consumed by the Website project)  
**Purpose:** Single source of truth for all website copy, architecture descriptions, specs, and email content. Any architectural or functional change to GLA must be reflected here before the website is updated.

---

## HARD SCOPE BOUNDARY — WEBSITE PROJECT ONLY

You are working on the static marketing website at lieanalyzer.com hosted on Netlify. Your scope is strictly limited to HTML, CSS, JavaScript in the website repo, copy and content updates, and Netlify deployment configuration.

**You are NEVER permitted to:**
- Modify anything in the GLA API (main.py, cloudbuild.yaml, any agent file)
- Modify any GCS bucket contents
- Modify Cloud Run configuration
- Modify any file on the Pi at 100.81.189.18
- Submit any Vertex AI job
- Change any GCP service configuration
- Make any change that touches the inference pipeline

If a requested change would require touching any of the above — stop and flag it to Johnny rather than proceeding. The website reflects what the app does. It does not control it.

---

## SYNC PROTOCOL
When the GLA App project makes a change, update the relevant section below and paste the updated document into the Website project session with the instruction: "Update the website to reflect the changes in the marked sections."

Sections that changed should be marked: `[UPDATED: date]`

---

## 1. WHAT GLA ACTUALLY IS

GLA is an AI-powered golf caddie PWA that uses computer vision to classify the lie condition of a golf ball and deliver skill-adaptive caddie advice. The user points their phone at the ball, captures an image, and receives a club recommendation and shot execution plan tailored to their skill level and the specific lie in front of them.

**What it is not:**
- Not a physics simulator
- Not an on-device / edge inference app
- Not a spin rate calculator
- Not LiDAR-dependent

---

## 2. SYSTEM ARCHITECTURE (ACCURATE — USE THIS)

GLA runs a three-layer pipeline:

### Layer 1 — Computer Vision (Lie Classification)
- **Model:** MobileNetV3Small, converted to TFLite
- **Classes:** 12 lie types (see Section 4)
- **Inference:** Server-side on GCP Cloud Run — the image is sent to the API, not processed on-device
- **Input:** 224×224 RGB image, raw [0,255] pixel values
- **Output:** 12-class softmax with confidence scores
- **Accuracy:** 90.8% overall (Week 3 validated model)
- **Preprocessing:** `preprocess_input` baked into TFLite graph — raw feed only

### Layer 2 — Context Assembly (TrainClaw Pipeline)
The ContextAssembler runs three parallel agents before generating advice:
- **GPSAgent:** Resolves ball position, distance to pin, elevation data
- **WeatherAgent:** Pulls current wind speed and direction via weather API
- **Maps Integration:** Maps Static API for course context (satellite view, kill-switched until beta launch)

**Pi / TrainClaw Infrastructure:**
- A Raspberry Pi 5 at the edge runs the autonomous retraining pipeline
- **n8n** (automation engine) on the Pi orchestrates scheduled DataClaw validation runs and triggers training jobs
- **DataClaw** validates the training dataset nightly — 3,480 images, 12 classes, zero-issue CLEAN status
- **QAClaw** is an AI-assisted image review tool (Flask, port 8080) used to maintain dataset quality
- **Vertex AI** (GCP) executes all model training jobs — submitted from the Pi pipeline
- New models are automatically deployed to Cloud Run via CI/CD (`cloudbuild.yaml`)

### Layer 3 — CaddieAgent (AI Advice Engine)
- **Engine:** Claude Sonnet (Anthropic) — large language model
- **Input:** Lie class, confidence tier, GPS distance, wind context, player skill level, club in hand (optional)
- **Output:** Natural language caddie advice — club recommendation, shot shape, technique cues, ball position, weight distribution
- **Skill tiers:** Beginner / Mid-handicap / Low-handicap — same intelligence, different presentation depth

---

## 3. CONFIDENCE TIER SYSTEM

Every classification returns a confidence tier:

| Tier | Meaning | Action |
|---|---|---|
| HIGH | Model is confident, above per-class floor + 15% | Full advice delivered |
| MEDIUM | Above per-class floor, below HIGH threshold | Advice delivered with note |
| UNCERTAIN | Below global floor (0.45) or per-class floor | Retake prompt returned |

**Per-class confidence floors:**
- rough / roughdeep: 0.70
- hardpan: 0.75
- friedegg / bunker / bunkerplugged: 0.65
- All others: 0.55
- Global floor: 0.45

UNCERTAIN returns HTTP 200 with `retake_prompt` field — same response schema, no client friction.

---

## 4. THE 12-CLASS LIE MATRIX

| Class | Description |
|---|---|
| bunker | Greenside or fairway bunker, clean lie in sand |
| bunkerplugged | Ball plugged / buried in sand — fried egg in bunker |
| divot | Ball sitting in or near a divot |
| fairway | Ball on cut grass, clean lie |
| friedegg | Ball plugged in its own pitch mark, typically on approach |
| hardpan | Bare, compacted earth — no grass |
| leaves | Ball sitting on or surrounded by leaves |
| muddy | Wet, muddy ground contact |
| non_golf | Image is not a golf lie — rejection gate |
| pineneedles | Ball on pine needle mat |
| rough | Ball sitting on top of grass — more than half of ball visible |
| roughdeep | Ball settled into grass — at least half buried or obscured |

**Rough Classification Rule v1.0 (LOCKED):**
- rough = can see more than half the ball looking straight down
- roughdeep = half or more of ball obscured
- Edge cases default to roughdeep
- roughmedium was eliminated in Week 3 — subjective boundary, unreliable detection

---

## 5. CURRENT MODEL PERFORMANCE (Week 3 Validated)

| Metric | Value |
|---|---|
| Overall accuracy | 90.8% |
| Test set | 342-image gold set |
| Training dataset | 3,480 images, 12 classes |
| Architecture | MobileNetV3Small TFLite |
| Deployment | GCP Cloud Run, revision 00023-t22 |
| Weak classes (Week 4 targets) | rough F1 ≥ 0.667, hardpan F1 ≥ 0.783 |

---

## 6. INFRASTRUCTURE REFERENCE

| Component | Detail |
|---|---|
| API endpoint | https://gla-api-553691446830.us-central1.run.app |
| GCP project | silver-area-481014-a1, us-central1 |
| Training data bucket | gs://gla-images-barnachia/training_dataset_gold/ |
| Model bucket | gs://gla-models-barnachia/models/gla_model.tflite |
| Cloud Run concurrency | 4 (matches ThreadPoolExecutor max_workers) |
| Pi hostname | openclaw@raspberrypi (100.81.189.18 via Tailscale) |
| n8n | http://100.81.189.18:5678 |
| QAClaw | http://100.81.189.18:8080 |
| Budget constraint | $2,000 GCP startup credits — cost discipline is first-class |

---

## 7. FEATURES NOT YET BUILT (DO NOT CLAIM ON WEBSITE)

| Feature | Status |
|---|---|
| Physics engine / spin rate calculation | NOT BUILT — CaddieAgent provides LLM advice |
| On-device / edge inference | NOT BUILT — server-side only |
| LiDAR integration | NOT PLANNED |
| Custom domain app.lieanalyzer.com | Deferred post-model stability |
| Satellite map view | Kill-switched OFF until beta launch |
| Elevation API | Kill-switched OFF until beta launch |
| PWA / React frontend | Roadmap item — not yet built |
| TargetClaw camera ring overlay | Backlog — not yet built |

---

## 8. PRODUCT ROADMAP (APPROVED FOR WEBSITE)

1. Complete Week 4 model improvements (rough + hardpan F1 targets)
2. Custom domain: app.lieanalyzer.com
3. non_golf rejection gate (confidence threshold live)
4. Full PWA migration: React frontend + FastAPI
5. TargetClaw: real-time camera ring overlay driven by live model confidence

---

## 9. DATA & PRIVACY (ACCURATE — USE THIS)

- Images are sent to GCP Cloud Run for server-side inference
- Images are retained anonymously for model training improvement
- No PII is attached to training images
- User consents explicitly at beta signup
- Data is never sold or shared with third parties
- Email used solely for beta access notification

---

## 10. APPROVED HERO STATS (USE THESE — NOT FICTIONAL NUMBERS)

| Stat | Value | Notes |
|---|---|---|
| Lie classes | 12 | Locked |
| Overall accuracy | 90.8% | Week 3 validated |
| Training images | 3,480 | Current dataset |
| Inference | Server-side / GCP | Not on-device |
| Model architecture | MobileNetV3Small | Not YOLOv8 |
| Advice engine | AI (Claude Sonnet) | Not a physics engine |

**DO NOT USE:**
- NODES: 4,096 (fictional)
- LATENCY: 12ms (fictional — actual varies)
- 15,000+ images (old/false)
- Physics engine / spin decay / launch angle (not built)
- Edge computing / NPU / on-device (false)

---

## 11. FOUNDER SECTION (APPROVED COPY)

Johnny Barnachia — MBA, PMP, CFCM, LSSBB — 22-year U.S. Coast Guard veteran. Senior Program Manager in Defense & Aerospace (TRU Simulation + Training, Draper/MDA). Solo founder of GLA.

"I am a Defense & Aerospace Program Manager by trade. I spend my days bridging technical innovation with federal compliance — executing high-stakes hardware/software programs for the DoD. I built GLA because I wanted the same level of data-driven situational awareness I use at work, applied to the most difficult shots in golf."

The discipline that ships flight simulators on compressed timelines for the U.S. Navy — risk identification, systems thinking, zero-defect delivery — is the same discipline behind every architectural decision in GLA.

**Credentials to display:** MBA, PMP®, CFCM, LSSBB, USN_COAST_GUARD_22YR, DEFENSE_SECTOR

---

## 12. SECTIONS REQUIRING WEBSITE CORRECTION (AS OF MARCH 21, 2026)

### 🔴 Must fix before beta:

**Hero section:**
- REMOVE: "A physics engine models the shot"
- REPLACE WITH: "A Claude-powered caddie engine synthesizes lie, distance, wind, and skill level into a single executable plan."

**SYSTEM_ARCHITECTURE — Section 02:**
- REMOVE entire PHYSICS_ENGINE card
- REPLACE WITH: ADVICE_ENGINE card describing CaddieAgent / Claude Sonnet

**SYSTEM_ARCHITECTURE — Section 01 (COMPUTER_VISION):**
- Keep — already accurate

**SPECS table — Physics modeling row:**
- REMOVE: "Physics modeling — Launch angle, spin decay"
- REPLACE WITH: "Advice engine — Claude Sonnet (LLM)"

**Decorative hero stats:**
- REMOVE: "NODES: 4,096" and "LATENCY: 12ms"
- REPLACE WITH: "ACCURACY: 90.8%" and "CLASSES: 12"

**Copyright footer:**
- CHANGE: © 2025 → © 2026

### 🟡 Should add (differentiators currently missing):

- TrainClaw / autonomous retraining pipeline paragraph (positions GLA as seriously engineered)
- Confidence tier system description (HIGH/MEDIUM/UNCERTAIN)
- Actual model accuracy stat (90.8%)

---

## 13. EMAIL CONTENT GUIDANCE

Any email referencing GLA architecture must use these approved descriptions:

- **Inference:** "Server-side inference on Google Cloud Run"
- **Advice:** "AI-generated caddie advice powered by Claude Sonnet"
- **Training:** "Autonomous retraining pipeline running on dedicated edge hardware"
- **Data:** "Images retained anonymously for model improvement. No personal data attached."

**Do not use in email:**
- "On-device inference"
- "Physics engine"
- "Zero cloud upload"
- "Edge computing / NPU"

---

*This document is the authoritative source. When in doubt, defer to this document over any other GLA documentation.*
