# GreenWash — Product Requirements Document

**Version:** 1.0  
**Hackathon:** GenAI Genesis (Online Division)  
**Prize Targets:** Google Best Sustainability AI Hack · Top 2 Virtual Teams  

---
 
## 0. Tech Stack
 
| Layer | Technology | Notes |
|-------|-----------|-------|
| **Frontend** | React + Next.js | TypeScript, Tailwind CSS |
| **Backend** | Next.js API Routes | Serverless, no separate backend service |
| **Database** | Supabase (PostgreSQL) | All app data — reports, claims, evidence, jobs |
| **Auth** | Supabase Auth | Google OAuth provider |
| **File Storage** | Supabase Storage | PDF uploads (`pdfs` bucket) |
| **LLM** | OpenAI GPT-4o | Claim extraction, entity disambiguation, credibility scoring, Vision PDF fallback |
| **Search / News** | Tavily API | Web evidence retrieval per claim |
| **Gov Data** | Environment Canada Open Data | NPRI + GHG registry, no key required |
| **Deployment** | Vercel | Auto-deploy from `main`, edge network |
 
---

## 1. Problem Statement


**Regulatory Tailwind:**
- EU Green Claims Directive (effective 2026) imposes legal liability for unsubstantiated sustainability claims
- Canada's Competition Act (amended 2024) explicitly targets greenwashing as deceptive marketing
- SEC climate disclosure rule requires emissions reporting from public companies

**Who suffers today:** Investors making ESG allocation decisions, journalists investigating environmental claims, NGOs holding companies accountable, and regulators who lack automated screening tools.

---

## 2. Solution


---

## 3. Target Users

| User | Primary Job | What They Need |
|------|-------------|----------------|
| Investigative Journalist | Verify specific company claims before publishing | Fast, cited evidence that contradicts or supports a claim |
| ESG Analyst / Investor | Screen portfolio companies for disclosure accuracy | Structured credibility scores exportable to a report |
| NGO / Advocacy Researcher | Identify companies making false environmental claims | Red-flagged claims with source citations |
| Regulator / Policy Team | Automate screening of corporate disclosure filings | Batch processing with audit trail |

**For the hackathon demo:** Focus on the journalist and ESG analyst persona. They are the most concrete, have the clearest workflow, and judges will immediately understand their pain.

---

## 4. Core User Flow

```
Upload PDF → Claim Extraction → Evidence Routing → Credibility Scoring → Graded Report
```

### 4.1 Step-by-Step

1. **Land on homepage** — clean hero explaining what it does, one CTA: "Audit a Report"
2. **Upload** — drag-and-drop PDF upload (ESG/sustainability report)
3. **Processing screen** — real-time status updates as claims are extracted and verified (streaming UI)
4. **Results dashboard** — graded report view with:
   - Summary card (X claims found, Y supported, Z contradicted, W unverifiable)
   - Claim list with inline credibility badges
   - Clickable claim → evidence panel with sources
5. **Evidence panel** — per claim: evidence type, source, raw data snippet, GPT-4o reasoning chain
6. **Export** — download full report as PDF (post-hackathon stretch)

---

## 5. Feature Requirements

### 5.1 MVP (Must Ship by Demo)

| Feature | Description | Priority |
|---------|-------------|----------|
| PDF Upload | Accept ESG/sustainability PDF up to 50MB | P0 |
| Claim Extraction | GPT-4o structured extraction of all explicit sustainability claims | P0 |
| Claim Classification | Tag each claim by category (carbon, sourcing, water, labor, governance) | P0 |
| News Cross-Reference | Web search for contradicting or supporting news coverage per claim | P0 |
| Government Registry Check | Query Environment Canada NPRI / GHG registry for emissions data | P0 |
| Credibility Scoring | Per-claim score: Supported / Unverified / Contradicted | P0 |
| Results Dashboard | Visual report with claim list, badges, and evidence panel | P0 |
| Processing Status Stream | Real-time UI updates during analysis (not a blank spinner) | P0 |
| Demo Company Pre-loaded | At least 1 pre-analyzed real company report cached for demo fallback | P0 |

### 5.2 Should Ship (If Time Allows)

| Feature | Description | Priority |
|---------|-------------|----------|
| Company Comparison | Compare two companies' claim credibility side-by-side | P1 |
| Claim Detail Drill-Down | Full evidence chain with source URLs per claim | P1 |
| Shareable Report Link | Unique URL to share a generated report | P1 |
| Confidence Indicator | LLM confidence score alongside credibility verdict | P1 |

### 5.3 Cut (Post-Hackathon)

- PDF export of report
- Batch processing API
- Slack/email alert for newly filed reports
- Fine-tuned verification model
- Regulatory filing integration (EDGAR, SEDAR)

---

## 6. Technical Architecture

### 6.1 System Overview

```
Client (Next.js)
    │
    ├── /upload          → PDF ingestion + job creation
    ├── /status/:jobId   → SSE stream for real-time progress
    └── /report/:jobId   → Fetch completed report from Supabase

API Layer (Next.js API Routes / Edge Functions)
    │
    ├── claim-extractor     → GPT-4o structured output (claim JSON)
    ├── claim-disambiguator → GPT-4o entity extraction (who/what/where per claim)
    ├── evidence-router     → Dispatches to correct verification module
    ├── news-verifier       → OpenAI web_search tool
    ├── registry-verifier   → Environment Canada NPRI API
    └── score-synthesizer   → GPT-4o evidence reasoning → verdict

Supabase
    ├── Storage     → PDF uploads
    ├── Auth        → Optional (anonymous sessions for demo)
    ├── DB Tables   → reports, claims, evidence, jobs
    └── Edge Fn     → Async job processing
```

### 6.2 Database Schema

```sql
-- Stores each uploaded report and its processing state
reports (
  id            uuid PRIMARY KEY,
  company_name  text,
  report_year   int,
  pdf_url       text,
  status        text CHECK (status IN ('processing', 'complete', 'failed')),
  created_at    timestamptz DEFAULT now()
)

-- One row per extracted claim
claims (
  id            uuid PRIMARY KEY,
  report_id     uuid REFERENCES reports(id),
  claim_text    text,
  category      text,  -- carbon | sourcing | water | labor | governance
  entities      jsonb, -- extracted entities for API lookup
  verdict       text CHECK (verdict IN ('supported', 'unverified', 'contradicted')),
  confidence    float,
  reasoning     text,  -- GPT-4o chain-of-thought explanation
  seq_index     int    -- order in original document
)

-- Evidence pieces attached to a claim
evidence (
  id            uuid PRIMARY KEY,
  claim_id      uuid REFERENCES claims(id),
  source_name   text,
  source_url    text,
  snippet       text,
  supports      boolean -- does this piece support or contradict the claim?
)

-- Async job tracking for streaming UI
jobs (
  id            uuid PRIMARY KEY,
  report_id     uuid REFERENCES reports(id),
  step          text,  -- extract_claims | verify_1_of_N | scoring | complete
  progress      int,   -- 0-100
  updated_at    timestamptz
)
```

### 6.3 LLM Pipeline

**Stage 1 — Claim Extraction**
```
System: You are an ESG analyst. Extract every explicit sustainability claim from this document as structured JSON.
Output format: { claims: [{ text, category, page_reference, entities_mentioned }] }
Constraints: Only explicit claims (not general statements of intent). Max 60 claims.
Model: GPT-4o with structured outputs (JSON mode)
```

**Stage 2 — Entity Disambiguation** (per claim)
```
System: For this sustainability claim, identify the specific companies, suppliers, regions, and metrics referenced.
Output: { companies: [], regions: [], metrics: [], time_period: "" }
This output drives the evidence API queries.
```

**Stage 3 — Evidence Synthesis** (per claim, after evidence gathered)
```
System: You are a fact-checker. Given the claim and the evidence retrieved, assess credibility.
Chain-of-thought: reason step by step before giving verdict.
Output: { verdict: "supported|unverified|contradicted", confidence: 0-1, reasoning: "..." }
Model: GPT-4o with chain-of-thought
```

### 6.4 External Data Sources

| Source | What It Provides | API |
|--------|-----------------|-----|
| OpenAI web_search tool | News cross-referencing per claim entity | Built into GPT-4o |
| Environment Canada NPRI | Pollutant release incidents by company | open.canada.ca REST API (free) |
| Environment Canada GHG Registry | Annual GHG emissions by facility | open.canada.ca REST API (free) |
| EC3 Building Transparency | Embodied carbon EPD data (if building sector) | api.buildingtransparency.org |

### 6.5 Evidence Routing Logic

```
if claim.category == "carbon":
    → query NPRI + GHG registry with extracted company names
    → web search: "[company] emissions violations" + "[company] carbon disclosures"

if claim.category == "sourcing":
    → web search: "[supplier name] environmental violation"
    → query NPRI for any extracted supplier names

if claim.category == "labor" | "governance":
    → web search: "[company] [category] controversy"
    → check for news contradictions only

all claims:
    → web search: "[claim entity] greenwashing" + "[claim entity] false claims [year]"
```

---

## 7. UI/UX Specification

### 7.1 Design System

**Aesthetic:** Clean, modern, professional dark mode. Feels like a high-end analytics tool — not a vibe-coded weekend project. The UI should communicate credibility through restraint: tight spacing, consistent type scale, zero decorative noise. Every element earns its place.

**Color Palette:**

| Token | Hex | Usage |
|-------|-----|-------|
| `--bg-base` | `#FFFFFF` | Page background |
| `--bg-surface` | `#F7F8F7` | Cards, panels, sidebars |
| `--bg-elevated` | `#EFEFEF` | Hover states, selected rows, input fields |
| `--border` | `#E2E5E2` | All borders and dividers |
| `--text-primary` | `#111111` | Headlines, labels |
| `--text-secondary` | `#555555` | Subtext, metadata, timestamps |
| `--text-muted` | `#AAAAAA` | Disabled states, placeholders |
| `--brand` | `#85C391` | Exact brand green — CTAs, active states, logo, accents |
| `--brand-dark` | `#5A9E67` | Hover state on brand elements, text on white |
| `--brand-subtle` | `#EAF5EC` | Brand tint background (selected row, callout bg) |

**Verdict / Score Colors (pastel — readable on white bg):**

| Token | Hex | Verdict | Feel |
|-------|-----|---------|------|
| `--score-true` | `#85C391` | Supported | Brand green — consistent with identity |
| `--score-true-bg` | `#EAF5EC` | Supported background tint | |
| `--score-partial` | `#E8B84B` | Partially Supported | Warm amber |
| `--score-partial-bg` | `#FDF6E3` | Partial background tint | |
| `--score-false` | `#E07070` | Contradicted | Muted red — serious but not violent |
| `--score-false-bg` | `#FDECEA` | Contradicted background tint | |
| `--score-unknown` | `#9B9BB5` | Unverified | Muted lavender-grey |
| `--score-unknown-bg` | `#F3F3F7` | Unverified background tint | |

**Typography:**

| Role | Font | Weight | Notes |
|------|------|--------|-------|
| Display / Logo | **Syne** (Google Fonts) | 700–800 | Geometric, modern, distinctive — not Inter |
| Body / UI | **DM Sans** (Google Fonts) | 400, 500 | Clean, professional, slightly warm |
| Claim text / Evidence | **DM Mono** (Google Fonts) | 400 | Monospaced for quoted claim text and data snippets |

Import in `globals.css`:
```css
@import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:wght@400;500;600&family=DM+Mono:wght@400&display=swap');
```

**Score Indicator — Claim Credibility Meter:**
Each claim gets a numeric score from 0–100 rendered as a horizontal pill meter:
- `0–33` → Contradicted (`--score-false`)
- `34–66` → Partially Supported (`--score-partial`)
- `67–89` → Supported (`--score-true`)
- `90–100` → Strongly Supported (`--score-true`, brighter fill)
- `null` → Unverified (`--score-unknown`)

The meter is a thin `4px` tall bar inside the claim card — fills left to right with the verdict color. Sits beneath the claim text alongside the verdict label pill. This is the primary visual hierarchy anchor in the claim list.

**Component Tokens:**
```css
--radius-sm: 6px;
--radius-md: 10px;
--radius-lg: 16px;
--shadow-surface: 0 1px 3px rgba(0,0,0,0.4);
--transition: 150ms ease;
```

---

### 7.2 Key Screens

**Screen 1 — Homepage**
- Clean white hero with generous whitespace. Logo top-left in Syne: "GreenWash" with `#85C391` on the leaf icon beside the wordmark.
- Single headline: "We read the fine print." in Syne 800, `--text-primary` (near-black)
- Subhead in DM Sans: "AI-powered audit of corporate sustainability claims."
- Upload zone: dashed `--border`, rounded `--radius-lg`, `--bg-surface` fill. On hover → border and background shift to `--brand-subtle` with `--brand` border.
- CTA button: `#85C391` background, `#111111` text, Syne 700 label — "Audit a Report". On hover → `--brand-dark`.
- Below fold: static preview of a report result on a light `--bg-surface` card
- "Try demo →" text link in `--brand-dark` — no button chrome

**Screen 2 — Processing**
- White centered layout, clean. Company name + "Analyzing..." heading in Syne, `--text-primary`.
- Step indicator: vertical list, completed steps show `#85C391` checkmark, active step has pulsing `#85C391` dot, pending in `--text-muted`
- Growing claim count streaming: "14 claims found so far..." in DM Mono, `--text-secondary`
- Thin `3px` progress bar at top of screen in `#85C391`

**Screen 3 — Report Dashboard**
- White top bar with light `--border` bottom. Company name left in Syne, summary counts right (`47 claims · 18 ✓ · 21 ~ · 8 ✗`) in DM Mono small.
- Left panel (360px): `--bg-surface` background. Each claim card:
  - Claim text truncated, DM Sans, `--text-primary`
  - Category pill — `--bg-elevated` background, `--text-secondary` text
  - Credibility meter bar (4px, verdict color, `--bg-elevated` track)
  - Score `72/100` in DM Mono, `--text-secondary`
- Selected claim: `--brand-subtle` background, `2px` `#85C391` left border
- Right panel: white background, evidence detail for selected claim
- Filter bar above list: pill toggles for verdict + category in `--bg-surface`

**Screen 4 — Evidence Panel**
- Claim text in DM Mono blockquote: `--bg-surface` background, `3px` `#85C391` left border, `--text-primary`
- Verdict badge: pill with `--score-*-bg` background, `--score-*` colored text + label ("Contradicted · 18/100")
- Credibility meter bar full-width, `6px` tall, with score number right-aligned
- Entity row: "Entities found: Foxconn · Zhengzhou, China · 2022–2024" in DM Mono, `--text-muted`, `--bg-surface` pill
- Evidence cards: white card, `--border` outline, `--radius-md`. Source name + date header, snippet in DM Mono `--bg-surface`, supports/contradicts tag bottom-right
- Collapsible "AI Reasoning": `--bg-surface` panel, DM Sans, `--text-secondary`

### 7.3 Credibility Score System

| Score | Verdict Label | Color Token | Meter Fill |
|-------|--------------|-------------|------------|
| 0–33 | ✗ Contradicted | `--score-false` (pastel red) | 0–33% red fill |
| 34–66 | ~ Partially Supported | `--score-partial` (pastel amber) | 34–66% amber fill |
| 67–89 | ✓ Supported | `--score-true` (pastel green) | 67–89% green fill |
| 90–100 | ✓✓ Strongly Supported | `--score-true` (brighter) | 90–100% bright green |
| null | — Unverified | `--score-unknown` (lavender-grey) | Empty / dashed |

---

## 8. Demo Plan

**Runtime target:** 3–4 minutes for online submission video.

**Demo script:**
1. Open live app. Show homepage. "Corporate greenwashing costs the planet and costs investors."
2. Upload a real ESG report PDF of a known brand (have this pre-selected, not a 3-minute wait).
3. **Fast path:** trigger pre-cached demo result. Show processing animation briefly, then cut to results.
4. Show summary: "47 claims, 8 contradicted." 
5. Click the single most damning contradicted claim. Walk through the evidence panel.
6. Show the evidence: NPRI violation data + news article + GPT-4o reasoning chain.
7. Zoom out to full claim list — the graded document view.
8. Close: "Every piece of data was public. We just connected it."

**Fallback if live demo breaks:** Have the full report pre-rendered as a static screenshot walkthrough in the slide deck. Never go dark.

---

## 9. Non-Functional Requirements

| Requirement | Target |
|-------------|--------|
| Analysis time for 30-claim report | < 90 seconds (with progress streaming) |
| PDF size limit | 50MB |
| GPT-4o API calls per report | Max 80 (extraction + disambiguation + synthesis) |
| Uptime during demo window | Vercel deployment, tested 24h before submission |
| Cost per report (API) | ~$0.40–$1.20 depending on report size |
| Mobile responsiveness | Not required for hackathon; desktop-first |

---

## 10. Risks & Mitigations

| Risk | Likelihood | Mitigation |
|------|-----------|------------|
| GPT-4o hallucinates fake evidence | High | Always cite real source URLs; LLM only synthesizes, never invents data |
| Environment Canada API is down | Medium | Cache API responses; pre-load demo company data in Supabase |
| Real company's PDF takes 5+ mins to process | High | Pre-cache demo company; show progress streaming |
| Credibility of verdicts questioned by judge | Low | Show the raw evidence, not just the verdict; let the data speak |

---

## 11. Success Criteria

**Hackathon win:**
- Report correctly identifies ≥1 legitimately contradicted claim in the demo company with cited evidence
- Processing completes within 90 seconds on demo machine
- Judges can understand the core value proposition within 60 seconds of seeing the screen

**Post-hackathon:**
- 100 reports processed in first week
- 3 journalists or NGO researchers use it for real investigations
- Featured in sustainability or tech press