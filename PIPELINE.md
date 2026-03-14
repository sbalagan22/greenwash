# GreenWash Pipeline Deep Dive 🌊
> **Technical Documentation for the ESG Credibility Engine**

The GreenWash pipeline is a multi-stage distributed process designed to transform raw PDF sustainability reports into a verified credibility assessment. It leverages advanced LLM reasoning and real-time search capabilities.

## 🏁 Pipeline Architecture

The entire process is orchestrated by a single API endpoint: `src/app/api/pipeline/run/route.ts`. 

### Stage 1: Ingestion & Claim Extraction
- **PDF Parsing**: The system downloads the PDF from Supabase Storage and uses `pdf-parse` to convert it into raw text.
- **Contextual Anchoring**: Before extraction, GPT-4o-mini scans the first 4000 characters to identify the **Official Company Name**. If the user provided one, it validates it; if not, it extracts it to ground all subsequent search queries.
- **Parallel Chunking**: The text is chunked into 4k character windows with a 200-character overlap.
- **LLM Extraction**: Each chunk is analyzed by GPT-4o-mini with a strict system prompt.
    - **Valid Claims**: Must be explicit (numbers, targets, facts), not marketing fluff.
    - **Categories**: Claims are mapped to `carbon`, `sourcing`, `water`, or `labor`.
- **Deduplication**: Claims are normalized and deduplicated across chunks. We retain the top 40 highest-quality claims (>30 characters).

### Stage 2: Entity Disambiguation
- **Batch Processing**: Claims are batched into groups of 5.
- **Feature Extraction**: GPT identifies specific entities within each claim:
    - **Companies**: Involved partners or subsidiaries.
    - **Regions**: Geographical scope of the claim.
    - **Metrics**: Units of measure (e.g., Tons of CO2, Percentage).
    - **Time Periods**: Baseline years vs. target years.
    - **Suppliers**: Specific third-party companies mentioned.

### Stage 3: Real-Time Verification (Tavily)
- **Selection**: To manage API credits and processing time, we cap verification at the **25 most significant claims**.
- **Search Strategy**: For each claim, we execute two distinct Tavily searches:
    1. **Fact Check**: `"[Company]" [Claim Snippet] fact check verification`
    2. **Contradiction**: `"[Company]" [Category] greenwashing misleading false lawsuit`
- **Tavily Parameters**: We use `searchDepth: "advanced"`, `maxResults: 2`, and exclude the company's own domains (`hm.com`, `coca-cola.com`, etc.) to prevent self-referential evidence.
- **Relevancy Filter**: Every search result snippet is vetted by an LLM to ensure it actually relates to the company's practices.
- **Contradiction Detection**: Snippets are scanned for "red flag" keywords (fines, violations, scandals) to flag potential greenwashing.

### Stage 4: Claim-Level Scoring
- **Evidence Compilation**: All relevant snippets for a claim are compiled into a comprehensive brief.
- **Scoring Logic**: GPT-4o-mini acts as an auditor, assigning a confidence score (0.0 to 1.0) and a verdict.
    - **Supported**: Score ≥ 0.70
    - **Mixed**: 0.31 ≤ Score < 0.70
    - **Contradicted**: Score < 0.31
    - **Unverified**: No evidence found (Strictly null score).

### Stage 5: Report Synthesis & Mathematical Scoring
- **Category Averaging**: Per-category scores are calculated as the average of the individual claim confidences in that category (excluding `unverified` claims).
- **Global Credibility Score**: The overall report score (0-100) is a strict mathematical average of all scored claims. 
- **Qualitative Analysis**: Instead of asking an LLM for a score, we provide the **calculated** score to GPT-4o-mini and ask it to generate a detailed, professional analysis explaining *why* that score was reached based on the verified claims.

---

## 🛠️ Performance Optimizations

- **Concurrency**: Uses `p-limit` to handle search and LLM calls in parallel without hitting rate limits or crashing the server.
- **Budget Control**: Strict caps on searchable claims (25) and search results (2 per query) reduce search engine costs by ~70%.
- **Resilience**: The pipeline uses non-fatal try-catch blocks for disambiguation and analysis, ensuring that even if one stage fails, the user still gets a usable report with individual claim data.

## 📊 Database Schema

### `reports` Table
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key |
| `pdf_url` | TEXT | Link to report |
| `overall_score` | INT | 0-100 Credibility Score |
| `overall_analysis` | TEXT | AI qualitative analysis |
| `category_scores` | JSONB | Map of category averages |

### `claims` Table
| Column | Type | Description |
|--------|------|-------------|
| `id` | UUID | Primary Key |
| `report_id` | UUID | FK to Reports |
| `claim_text` | TEXT | Raw extracted text |
| `verdict` | ENUM | supported, mixed, contradicted, unverified |
| `confidence` | FLOAT | 0.0 - 1.0 weight |
| `reasoning` | TEXT | Auditor's justification |

### `evidence` Table
| Column | Type | Description |
|--------|------|-------------|
| `claim_id` | UUID | FK to Claims |
| `source_name` | TEXT | Website title or host |
| `source_url` | TEXT | Link to evidence |
| `snippet` | TEXT | relevant text segment |
| `supports` | BOOL | Boolean support flag |
