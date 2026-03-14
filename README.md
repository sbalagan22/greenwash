# greenwash 🌿
> **ESG Evidence Verification Pipeline**

<p align="center">
  <img src="public/greenwash_logo_whitebg.png" alt="greenwash Logo" width="600" />
</p>

greenwash is a premium ESG (Environmental, Social, and Governance) analytics platform that uses AI and real-time web verification to audit sustainability claims in corporate reports. It moves beyond simple extraction by actively searching for independent evidence to validate or contradict corporate sustainability promises.

## ✨ Features

- **Automated Claim Extraction**: Parses long PDF sustainability reports to find specific, verifiable ESG claims.
- **Real-time Verification**: Uses the Tavily search engine to find independent evidence across the web for every claim.
- **Mathematical Scoring**: Computes a strict credibility score (0-100) based on the weight of supporting and contradicting evidence.
- **Category Dashboards**: Visualizes performance across Carbon, Sourcing, Water, and Labor.
- **Qualitative Analysis**: AI-generated reports that explain the "why" behind the scores, citing specific sources.
- **Premium UI**: Modern, glassmorphic design built with Next.js, Framer Motion, and Tailwind CSS.

## 🛠️ Tech Stack

- **Frontend**: Next.js 15+, React 19, Tailwind CSS, Framer Motion, Lucide React
- **Backend**: Next.js API Routes (App Router)
- **Database/Storage**: Supabase (PostgreSQL, Storage buckets)
- **AI/LLM**: GPT-4o-mini (Extraction, Relevancy, Scoring, Analysis)
- **Search Engine**: Tavily API (Targeted ESG verification)
- **PDF Processing**: `pdf-parse`, `pdfjs-dist`

## 🚀 Getting Started

### Prerequisites

- Node.js 18+
- A Supabase project
- OpenAI API Key
- Tavily API Key

### Environment Variables

Create a `.env` file in the root directory:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key

OPENAI_API_KEY=your_openai_api_key
TAVILY_API_KEY=your_tavily_api_key
```

### Installation

1. **Clone the repository**:
   ```bash
   git clone https://github.com/yourusername/greenwash.git
   cd greenwash
   ```

2. **Install dependencies**:
   ```bash
   npm install
   ```

3. **Database Setup**:
   The project requires a Supabase database with the following tables:
   - `reports`: Stores report metadata and overall scores.
   - `claims`: Stores extracted ESG claims and their verdicts.
   - `evidence`: Stores third-party sources linked to claims.
   - `jobs`: Tracks pipeline progress.

4. **Run the development server**:
   ```bash
   npm run dev
   ```

## 📂 Project Structure

- `src/app/page.tsx`: Landing page with smooth-scrolling navigation and FAQ.
- `src/app/report/[reportId]/page.tsx`: Main analysis dashboard for a specific report.
- `src/app/api/pipeline/run/route.ts`: Core orchestrator for the analysis pipeline.
- `src/lib/supabase.ts`: Supabase client configuration.

## 📜 Documentation

For a deep dive into the underlying architecture and logic, see [PIPELINE.md](PIPELINE.md).

## 📄 License

This project is licensed under the MIT License.
