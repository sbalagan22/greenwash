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
                                                category: { type: "string", enum: ["carbon", "sourcing", "water", "labor", "governance", "other"] },
                                                page_reference: { type: ["number", "null"] },
                                                bbox: {
                                                    type: ["object", "null"],
                                                    properties: {
                                                        x: { type: "number" },
                                                        y: { type: "number" },
                                                        width: { type: "number" },
                                                        height: { type: "number" }
                                                    },
                                                    required: ["x", "y", "width", "height"],
                                                    additionalProperties: false
                                                },
                                                entities_mentioned: { type: "array", items: { type: "string" } }
                                            },
                                            required: ["text", "category", "page_reference", "bbox", "entities_mentioned"],
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
                            content: `You are an ESG analyst. Extract every explicit sustainability claim from this document segment.

Rules:
- Only EXPLICIT claims (quantitative statements, specific commitments, measurable assertions)
- Do NOT extract vague aspirational language
- Categorize: carbon | sourcing | water | labor | governance
- Include the exact quote from the document
- For each claim, also return the page number (1-indexed) and the bounding box of the claim text as a percentage of the page dimensions (x, y, width, height from top-left). If you cannot determine the exact bounding box, return your best estimate based on where in the document the text appears.`,
                        },
                        {
                            role: "user",
                            content: `Extract sustainability claims:\n\n${chunk}`,
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

    const finalClaims = uniqueClaims.slice(0, 40);

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

    interface ClaimEntities {
        companies?: string[];
        regions?: string[];
        time_period?: string;
        suppliers?: string[];
    }

    const limit = pLimit(10);
    await Promise.all(
        claims.map((claim, i) =>
            limit(async () => {
                const ents = claim.entities as ClaimEntities | null;
                const companyNames = ents?.companies?.join(", ") || "the company";
                const year = ents?.time_period || "recent";

                let query = `${companyNames} ${claim.claim_text.slice(0, 80)}`;
                if (claim.category === "carbon") {
                    query = `${companyNames} emissions greenwashing ${year}`;
                } else if (claim.category === "water") {
                    query = `${companyNames} water pollution violation ${year}`;
                } else if (claim.category === "labor") {
                    query = `${companyNames} labor safety violation ${year}`;
                }

                try {
                    const results = await tvly.search(query, {
                        maxResults: 3,
                        searchDepth: "basic",
                    });

                    if (results.results && results.results.length > 0) {
                        const contradictionKeywords = [
                            "violation", "fine", "penalty", "lawsuit", "misleading",
                            "false", "greenwashing", "accused", "scandal", "controversy",
                            "failed", "pollution", "contamination", "investigation",
                        ];

                        const evidenceRows = results.results
                            .filter((r) => r.content && r.content.length > 50)
                            .slice(0, 3)
                            .map((result) => {
                                const snippetLower = (result.content || "").toLowerCase();
                                const hasContradiction = contradictionKeywords.some((kw) =>
                                    snippetLower.includes(kw)
                                );

                                return {
                                    claim_id: claim.id,
                                    source_name: result.title || new URL(result.url).hostname,
                                    source_url: result.url,
                                    snippet: result.content?.slice(0, 500) || "",
                                    supports: !hasContradiction,
                                };
                            });

                        if (evidenceRows.length > 0) {
                            await supabase.from("evidence").insert(evidenceRows);
                        }
                    }
                } catch (searchErr) {
                    console.warn(`Search failed for claim ${claim.id}:`, searchErr);
                }

                const progress = 65 + Math.round(((i + 1) / claims.length) * 20);
                await supabase
                    .from("jobs")
                    .update({ progress, updated_at: new Date().toISOString() })
                    .eq("id", jobId);
            })
        )
    );
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

SCORING ZONES (confidence is 0.0 to 1.0):
- RED ZONE (0.00-0.30): The evidence CLEARLY CONTRADICTS the claim. Use 0.00-0.15 if evidence unanimously contradicts, 0.15-0.30 if mostly contradicting with minor caveats.
- YELLOW ZONE (0.30-0.70): The evidence is MIXED or CONFLICTING — some sources support, others contradict, or the claim is partially true. Use this range when reality is complicated.
- GREEN ZONE (0.70-1.00): The evidence CLEARLY SUPPORTS the claim. Use 0.85-1.00 if evidence unanimously supports with no caveats, 0.70-0.85 if mostly supporting with minor gaps.
- GREY (null): ZERO evidence found — cannot assess.

VERDICT RULES:
- confidence < 0.30 → verdict MUST be "contradicted"
- confidence >= 0.30 and < 0.70 → verdict MUST be "mixed" (conflicting/unclear)
- confidence >= 0.70 → verdict MUST be "supported"
- confidence is null (no evidence) → verdict MUST be "unverified"

Be DECISIVE. If evidence flat-out contradicts a claim, give it 0.05-0.15, not 0.25. If evidence fully supports with documentation, give 0.90-1.00, not 0.72. Only use the yellow zone when sources genuinely conflict.`,
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

    const claimsSummary = claims
        .map(
            (c, i) =>
                `Claim ${i + 1}: ${c.claim_text}\nCategory: ${c.category}\nVerdict: ${c.verdict}\nReasoning: ${c.reasoning}`
        )
        .join("\n\n");

    // Compute per-category scores from claim data
    const categoryMap: Record<string, { total: number; sum: number }> = {};
    for (const c of claims) {
        const cat = c.category || "other";
        if (!categoryMap[cat]) categoryMap[cat] = { total: 0, sum: 0 };
        categoryMap[cat].total++;
        if (c.confidence !== null && c.confidence !== undefined) {
            categoryMap[cat].sum += Number(c.confidence);
        }
    }
    const categoryScores: Record<string, number | null> = {};
    for (const [cat, data] of Object.entries(categoryMap)) {
        categoryScores[cat] = data.total > 0 ? Math.round((data.sum / data.total) * 100) : null;
    }

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
                            overall_score: { type: "number" },
                            overall_analysis: { type: "string" }
                        },
                        required: ["overall_score", "overall_analysis"],
                        additionalProperties: false
                    }
                }
            },
            messages: [
                {
                    role: "system",
                    content: `You are a strict ESG auditor. Based on the assessments of individual claims from a sustainability report, provide an overall credibility score (0 to 100) for the report and a detailed analysis explaining why.

SCORING RULES:
- Weight contradicted claims heavily — a single verified lie significantly drops the score.
- Unverified claims (no evidence) are treated as yellow flags, not green.
- Supported claims only raise the score if backed by strong evidence.
- A report full of contradictions should score below 30.
- A well-evidenced report should score above 70.
- Mixed reports should score 30-70.

'overall_analysis' should be a detailed, multi-paragraph plain text assessment. DO NOT use markdown formatting — no #, **, -, or * characters. Write in plain paragraphs separated by blank lines. Each paragraph should address a specific aspect: contradictions found, verified positive claims, areas lacking evidence, and final verdict.`,
                },
                {
                    role: "user",
                    content: `Assess the overall report based on these claims:\n\n${claimsSummary}`,
                },
            ],
        });

        const content = response.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);

        const score = typeof parsed.overall_score === "number" ? parsed.overall_score : 0;
        const analysis = typeof parsed.overall_analysis === "string" ? parsed.overall_analysis : "Analysis could not be completed.";

        await supabase
            .from("reports")
            .update({
                overall_score: score,
                overall_analysis: analysis,
                category_scores: categoryScores,
            })
            .eq("id", reportId);

        console.log(`[Pipeline] Overall analysis saved: score=${score}, categories=${JSON.stringify(categoryScores)}`);
    } catch (err) {
        console.error("Overall analysis failed:", err);
        // Fallback: save computed score from claims so overview always renders
        const allConfidences = claims.filter(c => c.confidence !== null).map(c => Number(c.confidence));
        const fallbackScore = allConfidences.length > 0 ? Math.round((allConfidences.reduce((a, b) => a + b, 0) / allConfidences.length) * 100) : 0;
        await supabase
            .from("reports")
            .update({
                overall_score: fallbackScore,
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
