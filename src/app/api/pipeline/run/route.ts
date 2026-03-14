import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import OpenAI from "openai";
import { tavily } from "@tavily/core";

export const maxDuration = 300; // 5 minutes max for full pipeline

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });

// ============================================================
// STEP 1: Extract claims from PDF
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

        // Use the admin client to download, avoiding public bucket restrictions
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
    }

    const allClaims: ExtractedClaim[] = [];

    for (let i = 0; i < chunks.length; i++) {
        const progress = 15 + Math.round((i / chunks.length) * 35);
        await supabase
            .from("jobs")
            .update({ step: "extracting", progress, updated_at: new Date().toISOString() })
            .eq("id", jobId);

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are an ESG analyst. Extract every explicit sustainability claim from this document segment.

Rules:
- Only EXPLICIT claims (quantitative statements, specific commitments, measurable assertions)
- Do NOT extract vague aspirational language
- Categorize: carbon | sourcing | water | labor | governance
- Include the exact quote from the document

Return JSON: { "claims": [{ "text": "exact claim text", "category": "category", "entities_mentioned": ["entity1"] }] }
If none found: { "claims": [] }`,
                },
                {
                    role: "user",
                    content: `Extract sustainability claims:\n\n${chunks[i]}`,
                },
            ],
            max_completion_tokens: 2000,
        });

        try {
            const content = response.choices[0]?.message?.content;
            if (content) {
                const parsed = JSON.parse(content);
                if (parsed.claims && Array.isArray(parsed.claims)) {
                    allClaims.push(...parsed.claims);
                }
            }
        } catch {
            console.error(`Failed to parse claims from chunk ${i}`);
        }
    }

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
        category: claim.category || "governance",
        entities: { entities_mentioned: claim.entities_mentioned || [] },
        seq_index: index,
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
// STEP 2: Disambiguate entities
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

    const BATCH_SIZE = 5;
    for (let i = 0; i < claims.length; i += BATCH_SIZE) {
        const batch = claims.slice(i, i + BATCH_SIZE);

        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `For each claim, extract entities to verify. Return JSON:
{
  "entities": [
    {
      "claim_id": "id",
      "companies": ["list"],
      "regions": ["list"],
      "metrics": ["list"],
      "time_period": "string",
      "suppliers": ["list"]
    }
  ]
}`,
                },
                {
                    role: "user",
                    content: `Extract entities:\n\n${batch
                        .map((c) => `ID: ${c.id}\nClaim: ${c.claim_text}\nCategory: ${c.category}`)
                        .join("\n\n")}`,
                },
            ],
            max_completion_tokens: 2000,
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

        const progress = 55 + Math.round(((i + BATCH_SIZE) / claims.length) * 10);
        await supabase
            .from("jobs")
            .update({ progress, updated_at: new Date().toISOString() })
            .eq("id", jobId);
    }
}

// ============================================================
// STEP 3: Verify via Tavily search + government registries
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

    for (let i = 0; i < claims.length; i++) {
        const claim = claims[i];
        const ents = claim.entities as ClaimEntities | null;
        const companyNames = ents?.companies?.join(", ") || "the company";
        const year = ents?.time_period || "recent";

        // Build search query
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
    }
}

// ============================================================
// STEP 4: Score each claim
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

    for (let i = 0; i < claims.length; i++) {
        const claim = claims[i];

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
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `Assess the credibility of a corporate sustainability claim based on evidence.

RULES:
- ZERO evidence → verdict "unverified", confidence null
- Evidence only SUPPORTS → verdict "supported", confidence 0.65-0.85
- Evidence CONTRADICTS → verdict "contradicted", confidence 0.15-0.35
- Mixed evidence → weigh the balance
- Reasoning must be a clear paragraph

Return JSON: { "verdict": "supported"|"unverified"|"contradicted", "confidence": 0.0-1.0 or null, "reasoning": "paragraph" }`,
                    },
                    {
                        role: "user",
                        content: `CLAIM: "${claim.claim_text}"\nCATEGORY: ${claim.category}\n\nEVIDENCE:\n${evidenceSummary}`,
                    },
                ],
                max_completion_tokens: 1000,
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

        const progress = 85 + Math.round(((i + 1) / claims.length) * 13);
        await supabase
            .from("jobs")
            .update({ progress, updated_at: new Date().toISOString() })
            .eq("id", jobId);
    }
}

// ============================================================
// STEP 5: Generate Overall Score
// ============================================================
async function analyzeOverallReport(
    reportId: string,
    jobId: string,
    supabase: ReturnType<typeof getServiceSupabase>
) {
    await supabase
        .from("jobs")
        .update({ step: "scoring", progress: 95, updated_at: new Date().toISOString() })
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

    try {
        const response = await openai.chat.completions.create({
            model: "gpt-4o-mini",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are a strict ESG auditor. Based on the assessments of individual claims from a sustainability report, provide an overall credibility score (0 to 100) for the report and a detailed analysis/outline explaining why.

RULES:
- A high score means the report is well-supported by evidence.
- A low score means the report contains greenwashing, contradictions, or unverified aspirational claims.
- 'overall_analysis' should be a detailed, multi-paragraph plain text assessment evaluating the report's credibility. DO NOT use markdown formatting.

Return JSON: { "overall_score": 0-100, "overall_analysis": "plain text assessment" }`,
                },
                {
                    role: "user",
                    content: `Assess the overall report based on these claims:\n\n${claimsSummary}`,
                },
            ],
            max_completion_tokens: 1500,
        });

        const content = response.choices[0]?.message?.content || "{}";
        const parsed = JSON.parse(content);

        await supabase
            .from("reports")
            .update({
                overall_score: parsed.overall_score || 0,
                overall_analysis: parsed.overall_analysis || "Analysis could not be completed.",
            })
            .eq("id", reportId);
    } catch (err) {
        console.error("Overall analysis failed:", err);
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
