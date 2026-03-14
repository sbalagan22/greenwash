import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import OpenAI from "openai";
import { tavily } from "@tavily/core";
import pLimit from "p-limit";

export const maxDuration = 300; // 5 minutes max for full pipeline

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });

// ============================================================
// STEP 1: Extract claims from PDF — gpt-4.1-mini (fast)
// ============================================================
async function extractClaims(
    reportId: string,
    jobId: string,
    pdfUrl: string,
    supabase: ReturnType<typeof getServiceSupabase>
) {
    await supabase
        .from("jobs")
        .update({ step: "extracting", progress: 5, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    // Download and parse PDF
    let pdfText = "";
    try {
        const fileName = pdfUrl.split("/").pop();
        if (!fileName) throw new Error("Invalid PDF URL");

        const { data: fileData, error: downloadError } = await supabase.storage.from("pdfs").download(fileName);
        if (downloadError || !fileData) {
            throw new Error(`Storage download failed: ${downloadError?.message}`);
        }

        const pdfBuffer = Buffer.from(await fileData.arrayBuffer());
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PDFParse } = require("pdf-parse");
        const parser = new PDFParse({ data: pdfBuffer });
        const parsed = await parser.getText();
        pdfText = parsed.text;
    } catch (err) {
        throw new Error("PDF parse error: " + (err instanceof Error ? err.message : String(err)));
    }

    if (!pdfText || pdfText.trim().length < 100) {
        throw new Error("Could not extract text from PDF. The document may be image-only or corrupted.");
    }

    // Store the full PDF text in the reports table for the UI to show
    await supabase
        .from("reports")
        .update({ pdf_text: pdfText })
        .eq("id", reportId);

    // Extract company name if missing
    const { data: currentReport } = await supabase.from("reports").select("company_name").eq("id", reportId).single();
    let companyName = currentReport?.company_name;

    if (!companyName) {
        const companyResponse = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_completion_tokens: 50,
            messages: [
                { role: "system", content: "Extract only the company name from this sustainability report text. Return only the company name, nothing else." },
                { role: "user", content: pdfText.slice(0, 4000) }
            ]
        });
        companyName = companyResponse.choices[0].message.content?.trim();
        if (companyName) {
            await supabase.from("reports").update({ company_name: companyName }).eq("id", reportId);
        }
    }

    // Chunk the text
    const CHUNK_SIZE = 4000;
    const OVERLAP = 200;
    const chunks: string[] = [];
    for (let i = 0; i < pdfText.length; i += CHUNK_SIZE - OVERLAP) {
        chunks.push(pdfText.slice(i, i + CHUNK_SIZE));
    }

    await supabase
        .from("jobs")
        .update({ step: "extracting", progress: 15, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    interface ExtractedClaim {
        text: string;
        category: string;
        entities_mentioned?: string[];
        page_reference?: number;
        bbox?: { x: number; y: number; width: number; height: number };
    }

    const allClaims: ExtractedClaim[] = [];

    // Process chunks in parallel with concurrency limit
    const limit = pLimit(5);
    await Promise.all(
        chunks.map((chunk, i) =>
            limit(async () => {
                const progress = 15 + Math.round((i / chunks.length) * 35);
                await supabase
                    .from("jobs")
                    .update({ step: "extracting", progress, updated_at: new Date().toISOString() })
                    .eq("id", jobId);

                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    max_completion_tokens: 2000,
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
                                                category: { type: "string", enum: ["carbon", "sourcing", "water", "labor"] },
                                            },
                                            required: ["text", "category"],
                                            additionalProperties: false
                                        }
                                    }
                                },
                                required: ["claims"],
                                additionalProperties: false
                            }
                        }
                    },
                    messages: [
                        {
                            role: "system",
                            content: `You are an ESG analyst. Extract only EXPLICIT, VERIFIABLE sustainability claims from this document segment.

A valid claim MUST:
- Be a complete sentence or clear commitment
- Contain a specific, verifiable assertion — a number, percentage, target, or direct statement of fact
- Be attributable to the company making a promise or reporting an achievement

DO NOT extract:
- Table headers, column labels, or data field names (e.g. "Energy Use – Percentage renewable")
- Section titles or headings
- Vague aspirational language without specifics (e.g. "We are committed to sustainability")
- Statistical data without context (e.g. "41%")
- Legal disclaimers or footnote references
- Definitions or explanatory text

GOOD examples of valid claims:
- "We reduced scope 1 and 2 emissions by 47% compared to our 2019 baseline."
- "100% of our cotton is sourced from sustainable sources."
- "We aim to return more than 100% of the water used in finished products globally by 2030."

BAD examples — do NOT extract these:
- "Energy Use – Percentage renewable (electricity)"
- "Carbon emissions data"
- "We are committed to a sustainable future"
- "See appendix for full methodology"

Categorize each claim into one of exactly these four categories:
- "carbon" — greenhouse gas emissions, carbon footprint, net zero, energy use
- "sourcing" — supply chain, raw materials, supplier audits, packaging, recycled content
- "water" — water usage, recycling, stewardship
- "labor" — workers, wages, human rights, safety, community impact

Return an empty claims array if no valid claims exist in this chunk. Quality over quantity.`,
                        },
                        {
                            role: "user",
                            content: `Extract sustainability claims from this text:\n\n${chunk}`,
                        },
                    ],
                });

                try {
                    const content = response.choices[0]?.message?.content;
                    if (content) {
                        const parsed = JSON.parse(content);
                        if (parsed.claims && Array.isArray(parsed.claims)) {
                            allClaims.push(...parsed.claims);
                        }
                    }
                } catch (err) {
                    console.error(`Failed to parse claims from chunk ${i}:`, err);
                }
            })
        )
    );

    // Deduplicate
    const seen = new Set<string>();
    const uniqueClaims = allClaims.filter((claim) => {
        const normalized = claim.text.toLowerCase().trim();
        if (seen.has(normalized)) return false;
        seen.add(normalized);
        return true;
    });

    // Take up to 40 high-quality claims (must be > 30 chars)
    const finalClaims = uniqueClaims
        .filter(claim => claim.text.length > 30)
        .slice(0, 40);

    // Insert claims
    const claimRows = finalClaims.map((claim, index) => ({
        report_id: reportId,
        claim_text: claim.text,
        category: claim.category?.toLowerCase() === "governance" ? "labor" : (claim.category || "labor"),
        entities: { entities_mentioned: claim.entities_mentioned || [] },
        seq_index: index,
        page_reference: claim.page_reference || null,
        bbox: claim.bbox || null,
    }));

    if (claimRows.length > 0) {
        const { error } = await supabase.from("claims").insert(claimRows);
        if (error) console.error("Claims insert error:", error);
    }

    await supabase
        .from("jobs")
        .update({ step: "extracting", progress: 50, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    return claimRows.length;
}

// ============================================================
// STEP 2: Disambiguate entities — gpt-4.1-nano (fastest)
// ============================================================
async function disambiguateEntities(
    reportId: string,
    jobId: string,
    supabase: ReturnType<typeof getServiceSupabase>
) {
    const { data: claims } = await supabase
        .from("claims")
        .select("id, claim_text, category, entities")
        .eq("report_id", reportId)
        .order("seq_index", { ascending: true });

    if (!claims || claims.length === 0) return;

    await supabase
        .from("jobs")
        .update({ step: "disambiguating", progress: 55, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    // Process all claim batches in parallel
    const BATCH_SIZE = 5;
    const limit = pLimit(5);
    const batches: typeof claims[] = [];
    for (let i = 0; i < claims.length; i += BATCH_SIZE) {
        batches.push(claims.slice(i, i + BATCH_SIZE));
    }

    await Promise.all(
        batches.map((batch, batchIdx) =>
            limit(async () => {
                const response = await openai.chat.completions.create({
                    model: "gpt-4o-mini",
                    max_completion_tokens: 500,
                    response_format: {
                        type: "json_schema",
                        json_schema: {
                            name: "entity_disambiguation",
                            strict: true,
                            schema: {
                                type: "object",
                                properties: {
                                    entities: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: {
                                                claim_id: { type: "string" },
                                                companies: { type: "array", items: { type: "string" } },
                                                regions: { type: "array", items: { type: "string" } },
                                                metrics: { type: "array", items: { type: "string" } },
                                                time_period: { type: "string" },
                                                suppliers: { type: "array", items: { type: "string" } }
                                            },
                                            required: ["claim_id", "companies", "regions", "metrics", "time_period", "suppliers"],
                                            additionalProperties: false
                                        }
                                    }
                                },
                                required: ["entities"],
                                additionalProperties: false
                            }
                        }
                    },
                    messages: [
                        {
                            role: "system",
                            content: `For each claim, extract specific companies, regions, metrics, time periods, and suppliers.`,
                        },
                        {
                            role: "user",
                            content: `Extract entities:\n\n${batch
                                .map((c) => `ID: ${c.id}\nClaim: ${c.claim_text}\nCategory: ${c.category}`)
                                .join("\n\n")}`,
                        },
                    ],
                });

                try {
                    const content = response.choices[0]?.message?.content;
                    if (content) {
                        const parsed = JSON.parse(content);
                        if (parsed.entities && Array.isArray(parsed.entities)) {
                            for (const entity of parsed.entities) {
                                await supabase
                                    .from("claims")
                                    .update({
                                        entities: {
                                            companies: entity.companies || [],
                                            regions: entity.regions || [],
                                            metrics: entity.metrics || [],
                                            time_period: entity.time_period || "",
                                            suppliers: entity.suppliers || [],
                                        },
                                    })
                                    .eq("id", entity.claim_id);
                            }
                        }
                    }
                } catch {
                    console.error("Entity parse error");
                }

                const progress = 55 + Math.round(((batchIdx + 1) / batches.length) * 10);
                await supabase
                    .from("jobs")
                    .update({ progress, updated_at: new Date().toISOString() })
                    .eq("id", jobId);
            })
        )
    );
}

// ============================================================
// STEP 3: Verify via Tavily search — parallel with pLimit(10)
// ============================================================
async function verifyClaims(
    reportId: string,
    jobId: string,
    supabase: ReturnType<typeof getServiceSupabase>
) {
    await supabase
        .from("jobs")
        .update({ step: "verifying", progress: 65, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    const { data: claims } = await supabase
        .from("claims")
        .select("id, claim_text, entities, category")
        .eq("report_id", reportId);

    if (!claims || claims.length === 0) return;

    // Cap to 25 searchable claims to control credits
    const searchableClaims = (claims as any[])
        .filter(c => c.claim_text.length > 40)
        .slice(0, 25)

    const limit = pLimit(10)
    await Promise.all(
        searchableClaims.map((claim, i) =>
            limit(async () => {
                const { data: report } = await supabase.from("reports").select("company_name").eq("id", reportId).single()
                const companyName = report?.company_name || "the company"

                // Fix slug to handle hyphenated names like "Coca-Cola"
                const companySlug = companyName.toLowerCase().replace(/\s+/g, '-')
                const companySlugNoHyphen = companyName.toLowerCase().replace(/[^\w]/g, '')

                const selfDomains = [
                    `${companySlugNoHyphen}.com`,
                    `${companySlugNoHyphen}group.com`,
                    'coca-colacompany.com',
                    'coca-cola.com',
                    'hm.com',
                    'hmgroup.com',
                ]

                const claimSnippet = claim.claim_text.slice(0, 80).trim()

                // 2 queries instead of 3
                const queries = [
                    `"${companyName}" ${claimSnippet} fact check verification`,
                    `"${companyName}" ${claim.category} greenwashing misleading false`,
                ]

                for (const query of queries) {
                    try {
                        const results = await tvly.search(query, {
                            maxResults: 2,           // was 3
                            searchDepth: "advanced", // keep advanced for quality
                            excludeDomains: selfDomains,
                        })

                        if (results.results && results.results.length > 0) {
                            for (const result of results.results) {
                                if (!result.content || result.content.length < 100) continue

                                // Skip company's own URLs
                                const urlLower = result.url.toLowerCase()
                                if (urlLower.includes(companySlug) || urlLower.includes(companySlugNoHyphen)) continue

                                // Simple relevancy filter — same as the original working version
                                const filterResponse = await openai.chat.completions.create({
                                    model: "gpt-4o-mini",
                                    max_completion_tokens: 10,
                                    messages: [
                                        { role: "system", content: "Answer only yes or no." },
                                        {
                                            role: "user",
                                            content: `Does this source relate to ${companyName}'s sustainability or environmental practices?\n\nSource title: ${result.title}\nSource snippet: ${result.content.slice(0, 400)}`
                                        }
                                    ]
                                })

                                const isRelevant = filterResponse.choices[0].message.content?.toLowerCase().includes("yes")
                                if (!isRelevant) continue

                                const contradictionKeywords = [
                                    "violation", "fine", "penalty", "lawsuit", "misleading",
                                    "false", "greenwashing", "accused", "scandal", "controversy",
                                    "failed", "pollution", "contamination", "investigation",
                                ]

                                const snippetLower = result.content.toLowerCase()
                                const hasContradiction = contradictionKeywords.some(kw => snippetLower.includes(kw))

                                await supabase.from("evidence").insert([{
                                    claim_id: claim.id,
                                    source_name: result.title || new URL(result.url).hostname,
                                    source_url: result.url,
                                    snippet: result.content.slice(0, 500),
                                    supports: !hasContradiction,
                                }])
                            }
                        }
                    } catch (searchErr) {
                        console.warn(`Search failed for query "${query}":`, searchErr)
                    }
                }

                const progress = 65 + Math.round(((i + 1) / searchableClaims.length) * 20)
                await supabase
                    .from("jobs")
                    .update({ progress, updated_at: new Date().toISOString() })
                    .eq("id", jobId)
            })
        )
    )

    // Debug log — shows how many claims got evidence
    const { data: evidenceCheck } = await supabase
        .from('evidence')
        .select('claim_id')
        .in('claim_id', searchableClaims.map(c => c.id))

    const claimsWithEvidence = new Set(evidenceCheck?.map(e => e.claim_id) || [])
    console.log(`[Verify] ${claimsWithEvidence.size}/${searchableClaims.length} claims got evidence`)
}

// ============================================================
// STEP 4: Score each claim — gpt-5-mini + low reasoning, parallel
// ============================================================
async function scoreClaims(
    reportId: string,
    jobId: string,
    supabase: ReturnType<typeof getServiceSupabase>
) {
    await supabase
        .from("jobs")
        .update({ step: "scoring", progress: 85, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    const { data: claims } = await supabase
        .from("claims")
        .select("*")
        .eq("report_id", reportId);

    if (!claims || claims.length === 0) return;

    const limit = pLimit(10);
    await Promise.all(
        claims.map((claim, i) =>
            limit(async () => {
                const { data: evidenceList } = await supabase
                    .from("evidence")
                    .select("*")
                    .eq("claim_id", claim.id);

                const evidence = evidenceList || [];

                const evidenceSummary =
                    evidence.length === 0
                        ? "No evidence was found for this claim."
                        : evidence
                            .map(
                                (e, j) =>
                                    `Evidence ${j + 1} (${e.supports ? "SUPPORTING" : "CONTRADICTING"}):\nSource: ${e.source_name}\nURL: ${e.source_url || "N/A"}\nSnippet: ${e.snippet}`
                            )
                            .join("\n\n");

                try {
                    const response = await openai.chat.completions.create({
                        model: "gpt-4o-mini",
                        max_completion_tokens: 800,
                        response_format: {
                            type: "json_schema",
                            json_schema: {
                                name: "claim_scoring",
                                strict: true,
                                schema: {
                                    type: "object",
                                    properties: {
                                        verdict: { type: "string", enum: ["supported", "unverified", "contradicted", "mixed"] },
                                        confidence: { type: ["number", "null"] },
                                        reasoning: { type: "string" }
                                    },
                                    required: ["verdict", "confidence", "reasoning"],
                                    additionalProperties: false
                                }
                            }
                        },
                        messages: [
                            {
                                role: "system",
                                content: `You are a strict ESG auditor scoring a corporate sustainability claim against real evidence.

When determining the credibility score (0.0 to 1.0):
- 0.90–1.00: Multiple independent sources confirm the claim with NO contradicting evidence.
- 0.70–0.89: Sources mostly support the claim with minor gaps.
- 0.31–0.69: Evidence is MIXED — some supporting, some contradicting.
- 0.10–0.30: Evidence mostly contradicts the claim.
- 0.00–0.10: Evidence directly and clearly contradicts the claim.
- null: NO evidence was found at all (Unverified). Do not guess a score.

The score must reflect the weight and quality of evidence, not a default middle value.

VERDICT RULES:
- confidence < 0.31 → verdict MUST be "contradicted"
- confidence >= 0.31 and < 0.70 → verdict MUST be "mixed"
- confidence >= 0.70 → verdict MUST be "supported"
- confidence is null (no evidence) → verdict MUST be "unverified"`,
                            },
                            {
                                role: "user",
                                content: `CLAIM: "${claim.claim_text}"\nCATEGORY: ${claim.category}\n\nEVIDENCE:\n${evidenceSummary}`,
                            },
                        ],
                    });

                    const content = response.choices[0]?.message?.content || "{}";
                    const parsed = JSON.parse(content);

                    await supabase
                        .from("claims")
                        .update({
                            verdict: parsed.verdict || "unverified",
                            confidence: parsed.confidence ?? null,
                            reasoning: parsed.reasoning || "Assessment could not be completed.",
                        })
                        .eq("id", claim.id);
                } catch {
                    await supabase
                        .from("claims")
                        .update({
                            verdict: "unverified",
                            confidence: null,
                            reasoning: "Automated assessment could not be completed.",
                        })
                        .eq("id", claim.id);
                }

                const progress = 85 + Math.round(((i + 1) / claims.length) * 10);
                await supabase
                    .from("jobs")
                    .update({ progress, updated_at: new Date().toISOString() })
                    .eq("id", jobId);
            })
        )
    );
}

// ============================================================
// STEP 5: Generate Overall Score — gpt-5-mini + low reasoning
// ============================================================
async function analyzeOverallReport(
    reportId: string,
    jobId: string,
    supabase: ReturnType<typeof getServiceSupabase>
) {
    await supabase
        .from("jobs")
        .update({ step: "analyzing", progress: 95, updated_at: new Date().toISOString() })
        .eq("id", jobId);

    const { data: claims } = await supabase
        .from("claims")
        .select("claim_text, category, verdict, confidence, reasoning")
        .eq("report_id", reportId);

    if (!claims || claims.length === 0) return;

    // Compute per-category scores — EXCLUDE unverified claims
    const categoryMap: Record<string, { total: number; sum: number }> = {}
    for (const c of claims) {
        if (c.confidence === null || c.confidence === undefined || c.verdict === 'unverified') continue

        const cat = c.category || "other"
        if (!categoryMap[cat]) categoryMap[cat] = { total: 0, sum: 0 }
        categoryMap[cat].total++
        categoryMap[cat].sum += Number(c.confidence)
    }
    const categoryScores: Record<string, number | null> = {}
    for (const [cat, data] of Object.entries(categoryMap)) {
        categoryScores[cat] = data.total > 0 ? Math.round((data.sum / data.total) * 100) : null
    }

    // Calculate mathematical overall score
    const allConfidences = claims
        .filter(c => c.confidence !== null && c.verdict !== 'unverified')
        .map(c => Number(c.confidence));
    const calculatedScore = allConfidences.length > 0
        ? Math.round((allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length) * 100)
        : 0;

    // Only pass scored claims to GPT — exclude unverified
    const scoredClaims = claims.filter(c => c.verdict !== 'unverified' && c.confidence !== null)
    const claimsSummary = scoredClaims
        .map(
            (c, i) =>
                `Claim ${i + 1}: ${c.claim_text}\nCategory: ${c.category}\nVerdict: ${c.verdict}\nScore: ${Math.round(Number(c.confidence) * 100)}/100\nReasoning: ${c.reasoning}`
        )
        .join("\n\n");

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            max_completion_tokens: 1500,
            response_format: {
                type: "json_schema",
                json_schema: {
                    name: "overall_report",
                    strict: true,
                    schema: {
                        type: "object",
                        properties: {
                            overall_analysis: { type: "string" }
                        },
                        required: ["overall_analysis"],
                        additionalProperties: false
                    }
                }
            },
            messages: [
                {
                    role: "system",
                    content: `You are analyzing a sustainability report that has been mathematically scored at ${calculatedScore}/100 based on individual claim verification. Your task is to provide a detailed qualitative analysis of this score.

ANALYSIS RULES:
- Explain why the score is ${calculatedScore}/100 based on the evidence provided in the claims.
- Address specific contradictions found (if any), verified positive claims, and areas lacking evidence.
- Do NOT mention the word "mathematical" or "calculated" - describe it as the "overall credibility score".
- 'overall_analysis' should be a detailed, multi-paragraph plain text assessment. 
- DO NOT use markdown formatting — no #, **, -, or * characters. Write in plain paragraphs separated by blank lines.`,
                },
                {
                    role: "user",
                    content: `Provide a qualitative analysis for the report score of ${calculatedScore}/100 based on these verified claims:\n\n${claimsSummary}`,
                },
            ],
        });

        const content = response.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);

        const analysis = typeof parsed.overall_analysis === "string" ? parsed.overall_analysis : "Analysis could not be completed.";

        await supabase
            .from("reports")
            .update({
                overall_score: calculatedScore,
                overall_analysis: analysis,
                category_scores: categoryScores,
            })
            .eq("id", reportId);

        console.log(`[Pipeline] Overall analysis saved: computed_score=${calculatedScore}, categories=${JSON.stringify(categoryScores)}`);
    } catch (err) {
        console.error("Overall analysis failed:", err);
        // Fallback: save computed score from claims so overview always renders
        await supabase
            .from("reports")
            .update({
                overall_score: calculatedScore,
                overall_analysis: "Automated overall analysis could not be completed. The score shown is an average of individual claim scores.",
                category_scores: categoryScores,
            })
            .eq("id", reportId);
    }
}

// ============================================================
// MAIN ORCHESTRATOR
// ============================================================
export async function POST(request: NextRequest) {
    const supabase = getServiceSupabase();
    let reportId = "";
    let jobId = "";

    try {
        const body = await request.json();
        reportId = body.reportId;
        jobId = body.jobId;
        const pdfUrl = body.pdfUrl;

        // STEP 1: Extract
        await extractClaims(reportId, jobId, pdfUrl, supabase);

        // STEP 2: Disambiguate (non-fatal)
        try {
            await disambiguateEntities(reportId, jobId, supabase);
        } catch (err) {
            console.warn("Disambiguation failed (non-fatal):", err);
        }

        // STEP 3: Verify
        await verifyClaims(reportId, jobId, supabase);

        // STEP 4: Score individual claims
        await scoreClaims(reportId, jobId, supabase);

        // STEP 5: Generate overall report score
        await analyzeOverallReport(reportId, jobId, supabase);

        // STEP 6: Complete
        await supabase
            .from("jobs")
            .update({ step: "complete", progress: 100, updated_at: new Date().toISOString() })
            .eq("id", jobId);

        await supabase.from("reports").update({ status: "complete" }).eq("id", reportId);

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Pipeline error:", err);

        if (jobId) {
            await supabase
                .from("jobs")
                .update({
                    step: "failed",
                    error: err instanceof Error ? err.message : "Pipeline failed",
                    updated_at: new Date().toISOString(),
                })
                .eq("id", jobId);
        }
        if (reportId) {
            await supabase.from("reports").update({ status: "failed" }).eq("id", reportId);
        }

        return NextResponse.json({ error: err instanceof Error ? err.message + "\n\n" + err.stack : "Pipeline failed" }, { status: 500 });
    }
}
