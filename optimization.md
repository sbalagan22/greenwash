# GreenWash — Pipeline Optimization Guide
**For:** Vibe coder  
**Goal:** Cut pipeline runtime from ~3 minutes to under 60 seconds  
**Source:** Official OpenAI Docs (developers.openai.com/api/docs/models)

---

## 1. Current Model Landscape (March 2026)

The latest OpenAI flagship is `gpt-5.2`. The GPT-5 family has fully replaced GPT-4 as the recommended default. Here's every model relevant to this project:

| Model | API String | Best For | Speed |
|-------|-----------|----------|-------|
| GPT-5.2 | `gpt-5.2` | Most complex reasoning | Slowest |
| GPT-5 mini | `gpt-5-mini` | Balanced speed + quality | Medium |
| GPT-5 nano | `gpt-5-nano` | Fastest GPT-5, cheapest | Fast |
| GPT-4.1 | `gpt-4.1` | Smartest non-reasoning model | Medium |
| GPT-4.1 mini | `gpt-4.1-mini` | Fast, non-reasoning | Fast |
| GPT-4.1 nano | `gpt-4.1-nano` | Fastest non-reasoning | Fastest |

---

## 2. Why the Pipeline Is Slow Right Now

`gpt-5-mini` is a **reasoning model** — it thinks step-by-step before every response. That's great for quality but adds significant latency per call. GreenWash fires 60–80 API calls per report. Using a reasoning model for every single call is the root cause of the 3-minute runtime.

**The fix:** Split the pipeline by task complexity. Only use the reasoning model where it actually matters.

---

## 3. Recommended Model Split

| Pipeline Stage | Current | Change To | Why |
|---------------|---------|-----------|-----|
| Claim extraction | `gpt-5-mini` | `gpt-4.1-mini` | Structured JSON output — no deep reasoning needed |
| Entity disambiguation | `gpt-5-mini` | `gpt-4.1-nano` | Pure classification — use the fastest model possible |
| Evidence synthesis / credibility scoring | `gpt-5-mini` | `gpt-5-mini` + `reasoning: { effort: "low" }` | Keep quality here, but reduce reasoning effort |
| PDF Vision fallback (scanned PDFs) | any | `gpt-4o` | Only model supporting vision in this context |

This split alone should reduce total pipeline time by **40–60%**.

---

## 4. Critical API Rules for Reasoning Models

`gpt-5-mini`, `gpt-5`, and `gpt-5.2` are all reasoning models. They do **not** support the same parameters as GPT-4. Passing unsupported parameters throws a `400` error and crashes the pipeline.

### ❌ Remove These Parameters Entirely

```ts
temperature: 0.1        // UNSUPPORTED — remove, do not replace
top_p: 0.9              // UNSUPPORTED — remove
presence_penalty: 0     // UNSUPPORTED — remove
frequency_penalty: 0    // UNSUPPORTED — remove
```

### ✅ Use `reasoning_effort` Instead

For reasoning models, use this to control speed vs quality:

```ts
// Add this to gpt-5-mini calls only
reasoning: { effort: "low" }     // fastest — recommended for GreenWash scoring
reasoning: { effort: "medium" }  // default if omitted
reasoning: { effort: "high" }    // slowest, most thorough — not needed here
```

**For GreenWash:** Set `reasoning: { effort: "low" }` on all `gpt-5-mini` scoring calls. Quality is still good enough for a hackathon demo and latency drops significantly.

---

## 5. Switch to the Responses API

The new Responses API is faster than `chat.completions.create` for all GPT-5 models. Migrate every call in the pipeline:

```ts
// ❌ OLD — Chat Completions (slower)
const response = await openai.chat.completions.create({
  model: "gpt-5-mini",
  messages: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]
})
const text = response.choices[0].message.content

// ✅ NEW — Responses API (faster)
const response = await openai.responses.create({
  model: "gpt-5-mini",
  reasoning: { effort: "low" },
  input: [
    { role: "system", content: systemPrompt },
    { role: "user", content: userPrompt }
  ]
})
const text = response.output_text
```

---

## 6. Run Claims in Parallel — Biggest Speed Win

This is the single most impactful change. If claims are processed sequentially, every claim waits for the previous one to finish. 30 claims × 3s each = 90s minimum just waiting.

**Switch to `Promise.all` with a concurrency cap:**

```ts
// ❌ SLOW — sequential (current likely implementation)
for (const claim of claims) {
  await processClaim(claim)
}

// ✅ FAST — parallel with p-limit
import pLimit from 'p-limit'

const limit = pLimit(10) // max 10 concurrent calls — avoids rate limit 429s

await Promise.all(
  claims.map(claim => limit(() => processClaim(claim)))
)
```

Install p-limit:
```bash
npm install p-limit
```

**Expected speedup:** For 30 claims processed 3 at a time previously vs 10 at a time now, this alone cuts the evidence-gathering phase by ~70%.

---

## 7. Structured Outputs (Faster JSON Parsing)

For claim extraction and entity disambiguation, use OpenAI's structured outputs instead of `response_format: { type: "json_object" }`. Structured outputs are faster to parse and eliminate JSON validation errors:

```ts
// ❌ OLD
response_format: { type: "json_object" }

// ✅ NEW — use with gpt-4.1-mini and gpt-4.1-nano
response_format: {
  type: "json_schema",
  json_schema: {
    name: "claims_extraction",
    strict: true,
    schema: {
      type: "object",
      properties: {
        claims: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string" },
              category: { type: "string", enum: ["carbon", "sourcing", "water", "labor", "governance"] },
              entities_mentioned: { type: "array", items: { type: "string" } }
            },
            required: ["text", "category", "entities_mentioned"],
            additionalProperties: false
          }
        }
      },
      required: ["claims"],
      additionalProperties: false
    }
  }
}
```

---

## 8. Cap Max Tokens Per Call

Reasoning models bill for thinking tokens too. Cap `max_output_tokens` to prevent runaway costs and slow responses:

```ts
// Claim extraction — needs moderate output
max_output_tokens: 2000

// Entity disambiguation — short output
max_output_tokens: 500

// Evidence scoring — needs reasoning paragraph
max_output_tokens: 800
```

---

## 9. Full Updated Call Examples

### Claim Extraction (`gpt-4.1-mini`)
```ts
const response = await openai.responses.create({
  model: "gpt-4.1-mini",
  max_output_tokens: 2000,
  response_format: { type: "json_schema", json_schema: { /* schema above */ } },
  input: [
    { role: "system", content: "You are an ESG analyst. Extract every explicit sustainability claim from this document as structured JSON. Only extract explicit claims, not general statements of intent. Max 40 claims." },
    { role: "user", content: pdfText }
  ]
})
```

### Entity Disambiguation (`gpt-4.1-nano`)
```ts
const response = await openai.responses.create({
  model: "gpt-4.1-nano",
  max_output_tokens: 500,
  response_format: { type: "json_schema", json_schema: { /* entity schema */ } },
  input: [
    { role: "system", content: "Extract specific companies, regions, suppliers, and metrics referenced in this sustainability claim." },
    { role: "user", content: claimText }
  ]
})
```

### Credibility Scoring (`gpt-5-mini`)
```ts
const response = await openai.responses.create({
  model: "gpt-5-mini",
  reasoning: { effort: "low" },
  max_output_tokens: 800,
  input: [
    { role: "system", content: "You are a fact-checker. Given a sustainability claim and evidence retrieved, assess credibility. Think step by step. Return verdict (supported | partially_supported | contradicted | unverified), confidence (0-100), and one paragraph of reasoning." },
    { role: "user", content: `Claim: ${claim}\n\nEvidence:\n${evidence}` }
  ]
})
```

---

## 10. Summary Checklist

Apply every change below in `src/app/api/pipeline/run/route.ts`:

- [ ] Remove ALL `temperature`, `top_p`, `presence_penalty`, `frequency_penalty` parameters
- [ ] Change claim extraction calls from `gpt-5-mini` → `gpt-4.1-mini`
- [ ] Change entity disambiguation calls from `gpt-5-mini` → `gpt-4.1-nano`
- [ ] Keep credibility scoring on `gpt-5-mini`, add `reasoning: { effort: "low" }`
- [ ] Switch all calls from `openai.chat.completions.create` → `openai.responses.create`
- [ ] Update response parsing from `response.choices[0].message.content` → `response.output_text`
- [ ] Wrap claim processing loop in `Promise.all` + `pLimit(10)`
- [ ] Install `p-limit`: `npm install p-limit`
- [ ] Switch `response_format` from `json_object` to `json_schema` with strict schemas
- [ ] Add `max_output_tokens` caps per call type (extraction: 2000, disambiguation: 500, scoring: 800)

**Expected result after all changes: pipeline runtime under 60 seconds for a 30-claim report.**
