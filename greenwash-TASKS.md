# GreenWash — Hackathon Task Board

**Timeline:** 36-hour hackathon  
**Team size:** Up to 4  
**Suggested roles:** Frontend (1), Backend/LLM (1–2), Full-stack / Integration (1)  

Status legend: `[ ]` Not started · `[~]` In progress · `[x]` Done  

---

## ⚠️ Hard Rules Before You Write a Line of Code

- [ ] **T-0:** Everyone's local env is set up (Node 20+, Supabase CLI, `.env.local` with API keys)
- [ ] **T-0:** Supabase project created, all 4 tables migrated (`reports`, `claims`, `evidence`, `jobs`)
- [ ] **T-0:** Vercel project linked to repo — auto-deploy from `main` on every push
- [ ] **T-0:** Demo company PDF identified and pre-analysis cached in Supabase (do this in hour 2, not hour 34)
- [ ] **T-0:** One team member owns the demo script. Written down. Practiced. Not improvised.

---

## Phase 1 — Foundation (Hours 0–6)

### 1.1 Project Setup
- [ ] Init Next.js 14 app (App Router, TypeScript)
- [ ] Install and configure Supabase client (`@supabase/supabase-js`)
- [ ] Set up `.env.local`: `OPENAI_API_KEY`, `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `CANADA_OPEN_DATA_KEY`
- [ ] Run Supabase DB migrations (schema from PRD Section 6.2)
- [ ] Set up Supabase Storage bucket: `pdfs` (public read, authenticated write)
- [ ] Configure Vercel deployment — verify CI/CD pipeline works with a hello-world push
- [ ] Set up `shadcn/ui` or raw Tailwind — pick one and commit. Don't mix.

### 1.2 PDF Upload API
- [ ] Build `POST /api/upload` route
  - Accept multipart PDF
  - Upload to Supabase Storage → get public URL
  - Create `reports` row with status `processing`
  - Create `jobs` row with step `queued`
  - Return `{ reportId, jobId }`
- [ ] Test with a real ESG PDF — confirm file lands in Supabase Storage
- [ ] Add 50MB file size guard with clear user-facing error

### 1.3 Upload UI
- [ ] Build homepage layout — hero copy, upload zone, demo button
- [ ] Drag-and-drop PDF upload component (use `react-dropzone`)
- [ ] Client-side file validation: PDF only, size limit
- [ ] On upload success → redirect to `/processing/:jobId`
- [ ] "Try demo report" button → hardcoded route to pre-cached result

---

## Phase 2 — LLM Pipeline (Hours 4–14)

> This is the most critical phase. Backend and LLM engineer should own this block entirely. Frontend continues on UI in parallel.

### 2.1 Claim Extraction
- [ ] Build `POST /api/pipeline/extract` 
  - Accept: `reportId`, `pdfUrl`
  - Extract text from PDF using `pdf-parse` npm package
  - Chunk into 4000-token segments with 200-token overlap
  - Send to GPT-4o with structured output prompt (see PRD Stage 1)
  - Parse response → insert rows into `claims` table
  - Update `jobs` row: step = `extracting`, progress = % complete
- [ ] Test extraction on your demo company PDF — verify claims are sensible
- [ ] Add deduplication: if same claim extracted twice from overlapping chunks, merge
- [ ] Cap at 60 claims max (cost control + quality control)

### 2.2 Entity Disambiguation
- [ ] Build `POST /api/pipeline/disambiguate`
  - For each claim row: call GPT-4o with entity extraction prompt (PRD Stage 2)
  - Write extracted entities back to `claims.entities` (jsonb)
  - Batch calls: 5 claims per GPT-4o call to reduce API cost
- [ ] Verify: a "supplier auditing" claim should extract supplier names and regions
- [ ] Verify: a carbon claim should extract company name, scope, and year

### 2.3 Evidence Routing — News Verifier
- [ ] Build `POST /api/evidence/news`
  - Accept: `claimId`, `entities`
  - Build 2–3 targeted search queries from entity extraction
  - Use OpenAI GPT-4o with `web_search_20250305` tool
  - Parse response → insert rows into `evidence` table
  - Flag each evidence piece: `supports: true/false`
- [ ] Test: a carbon claim about a real company should find relevant news
- [ ] Rate limit: max 3 news searches per claim to control cost

### 2.4 Evidence Routing — Government Registry Verifier
- [ ] Build `POST /api/evidence/registry`
  - Accept: `claimId`, `entities`
  - Query Environment Canada NPRI REST API: `https://data.ec.gc.ca/data/substances/monitor/national-pollutant-release-inventory-npri-dataset/`
  - Filter results by extracted company names
  - If violation records found → insert as `evidence` rows with `supports: false`
  - If clean records found → insert as `evidence` rows with `supports: true`
- [ ] Fallback: if NPRI API is down, log and skip — don't block the pipeline
- [ ] Cache NPRI results by company name in Supabase to avoid repeated hits

### 2.5 Evidence Synthesis — Credibility Scoring
- [ ] Build `POST /api/pipeline/score`
  - Accept: `claimId`
  - Fetch all `evidence` rows for this claim
  - Call GPT-4o with synthesis prompt (PRD Stage 3)
  - Write verdict, confidence, and reasoning back to `claims` table
  - Update `jobs`: step = `scoring`
- [ ] Test: a claim with 0 contradicting evidence should score `unverified`, not `supported`
- [ ] Test: a claim with a direct NPRI violation should score `contradicted`
- [ ] Reasoning field must be a human-readable paragraph, not a JSON blob

### 2.6 Pipeline Orchestrator
- [ ] Build `POST /api/pipeline/run` — master orchestrator
  - Calls extract → disambiguate → [news + registry in parallel per claim] → score
  - Updates `jobs` table at each step with progress %
  - On completion: set `reports.status = 'complete'`
  - On failure: set `reports.status = 'failed'`, log error to `jobs`
- [ ] Trigger this route from the upload flow immediately after PDF upload
- [ ] Total pipeline must complete in < 90 seconds for a 30-claim report — benchmark this

---

## Phase 3 — Results UI (Hours 8–20)

> Frontend engineer owns this. Can be built in parallel with Phase 2 using mock data.

### 3.1 Processing Screen (`/processing/:jobId`)
- [ ] Poll `jobs` table every 2 seconds via Supabase realtime or client-side interval
- [ ] Show current step as human-readable string: "Extracting claims (14/47)..." 
- [ ] Animated progress bar
- [ ] Show growing list of extracted claims appearing in real-time as they're inserted
- [ ] On `status = 'complete'` → auto-redirect to `/report/:reportId`
- [ ] On `status = 'failed'` → show error with "Try again" button

### 3.2 Report Dashboard (`/report/:reportId`)
- [ ] Fetch all claims + evidence for report from Supabase
- [ ] Summary bar: total claims, breakdown by verdict (Supported / Unverified / Contradicted)
- [ ] Left panel: filterable/sortable claim list
  - Verdict badge (colored, per spec in PRD Section 7.3)
  - Category pill (carbon, sourcing, water, labor, governance)
  - Confidence bar
  - Click → loads evidence panel on right
- [ ] Right panel: evidence detail for selected claim
  - Claim text (blockquote style)
  - Verdict + confidence
  - Evidence cards (source name, snippet, supports/contradicts icon, URL if available)
  - GPT-4o reasoning paragraph (collapsible "How we assessed this")
- [ ] Default: most damning `contradicted` claim selected on load (best first impression)
- [ ] Filter bar: filter by verdict and/or category

### 3.3 Design Polish
- [ ] Dark theme: `#0D0F0E` background, `#F0EDEA` text — commit to this, no mode toggle
- [ ] Verdict colors: green `#1A6B3A` · amber `#D4A017` · red `#C0392B`
- [ ] Serif display font for headlines (Google Fonts: Playfair Display or Cormorant)
- [ ] Mono font for claim text and evidence snippets (Fira Code, JetBrains Mono)
- [ ] Smooth transition when switching between claims in left panel
- [ ] Empty state: show skeleton loaders while evidence panel loads

---

//// MY TASKS ////

## Phase 4 — Integration & Demo Prep (Hours 20–30)

### 4.1 End-to-End Test
- [ ] Upload a real PDF → confirm full pipeline runs → confirm results make sense
- [ ] Test with at least 2 different company reports
- [ ] Manually audit 5 claims: does the verdict match the evidence? Fix any obvious errors
- [ ] Confirm pipeline completes in < 90 seconds on a clean run

### 4.2 Demo Company Cache
- [ ] Pre-select one real company with a known controversial sustainability record
  - Good candidates: fast fashion brand, large oil & gas co, major agribusiness
  - Ensure their report has at least 3 legitimately contradictable claims
- [ ] Run full pipeline on this company — confirm at least 3 `contradicted` verdicts
- [ ] Cache the result: save all claims + evidence to Supabase
- [ ] Build demo shortcut: "Try demo" button loads this pre-cached result instantly
- [ ] Test the demo path 5 times. It must work flawlessly. No spinner. No wait.

### 4.3 Error Handling & Edge Cases
- [ ] If PDF is not a sustainability report → detect and show "Unsupported document type" error
- [ ] If OpenAI API call fails → retry once, then mark claim as `unverified` with error note
- [ ] If NPRI API times out → skip silently, don't block the pipeline
- [ ] If PDF has 0 images and 0 text (corrupted) → handle gracefully
- [ ] Test on mobile viewport — it doesn't need to be perfect, just not broken

### 4.4 Sharing
- [ ] Confirm every report URL (`/report/:reportId`) is publicly accessible without auth
- [ ] Add "Copy link" button to report header
- [ ] Add OG meta tags to report pages for social sharing

---

## Phase 5 — Submission (Hours 30–36)

### 5.1 Final Build Check
- [ ] `npm run build` → 0 errors, 0 warnings that could crash demo
- [ ] Deploy to Vercel → smoke test the deployed URL (not localhost)
- [ ] Test demo path on deployed URL, different device, different network
- [ ] Confirm all API keys are in Vercel environment variables (not just `.env.local`)

### 5.2 GitHub
- [ ] All code committed before hackathon start timestamp (confirm with git log)
- [ ] `README.md` written — what it does, how to run it, tech stack, team
- [ ] No API keys in any committed file (`grep -r "sk-" .` to check)
- [ ] Public repo confirmed (judges need to see it)

### 5.3 Devpost Submission
- [ ] Project name: GreenWash
- [ ] Short description written (use the 3-sentence pitch)
- [ ] Long description covers: problem, solution, how it works, what makes it novel
- [ ] Tech stack listed accurately
- [ ] Demo video uploaded (3–4 minutes, follows script below)
- [ ] GitHub repo linked
- [ ] All team members added

### 5.4 Demo Video Script
```
[0:00–0:20] Problem setup — "Corporate sustainability reports are unaudited. 
             The EU just passed a law making false claims illegal. Nobody 
             has built the verification tool."

[0:20–0:40] Show homepage. Explain the product in one sentence.

[0:40–1:30] Upload flow → processing screen with live progress.
            OR cut to pre-cached demo instantly.

[1:30–2:30] Results dashboard. Show summary bar. Navigate to a 
            "Contradicted" claim. Walk through the evidence panel slowly.
            
[2:30–3:00] Show the raw evidence — NPRI record or news article — 
            and the GPT-4o reasoning chain. "The data was always public. 
            We just connected it."

[3:00–3:30] Filter to show all 8 contradicted claims. Zoom out. 
            Let the graded report speak for itself.

[3:30–4:00] Outro: "We're GreenWash. Built to hold corporations 
            accountable." Team intros.
```

---

## API Cost Budget

| Service | Estimated Calls | Estimated Cost |
|---------|----------------|----------------|
| GPT-4o (extraction, disambiguation, scoring) | ~60–80 calls per report | ~$0.30–$0.80 |
| GPT-4o with web_search | ~40 searches per report | ~$0.20–$0.40 |
| Supabase | Free tier | $0 |
| Environment Canada Open Data | Free | $0 |
| **Total per report** | | **~$0.50–$1.20** |
| **Demo budget (20 test runs)** | | **~$10–$24** |

---

## Parallel Work Allocation (Suggested)

| Hour Range | Engineer A (BE/LLM) | Engineer B (FE) | Engineer C (if 3+) |
|------------|---------------------|-----------------|---------------------|
| 0–4 | Project setup, DB migration, upload API | Project setup, homepage + upload UI | Demo company research, PRD review |
| 4–10 | Claim extraction + entity disambiguation | Processing screen, mock results UI | Registry API integration |
| 10–16 | News verifier + scoring | Report dashboard UI | End-to-end integration |
| 16–22 | Pipeline orchestrator + optimization | Design polish, evidence panel | Error handling |
| 22–28 | E2E testing + bug fixes | Demo cache + sharing | README + Devpost draft |
| 28–34 | Final QA | Video recording | Submission |
| 34–36 | Buffer / sleep | Buffer / sleep | Buffer / sleep |

---

## Definition of "Demo Ready"

The product is demo-ready when ALL of these are true:

1. [ ] Pre-cached demo company loads in < 3 seconds from the "Try demo" button
2. [ ] At least 3 `contradicted` claims with real cited evidence are visible in the demo
3. [ ] The evidence panel shows a source URL or data snippet, not just "we checked"
4. [ ] The GPT-4o reasoning paragraph is coherent and non-hallucinated
5. [ ] The full pipeline runs successfully on a fresh PDF upload in < 90 seconds
6. [ ] The deployed Vercel URL works on a device that is not the dev machine
7. [ ] The demo script has been run from start to finish at least twice by whoever is presenting