import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import OpenAI from "openai";

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
    try {
        const { reportId, pdfUrl } = await request.json();
        const supabase = getServiceSupabase();

        // Update job
        await supabase
            .from("jobs")
            .update({ step: "extracting", progress: 5, updated_at: new Date().toISOString() })
            .eq("report_id", reportId);

        // Download PDF and extract text
        let pdfText = "";
        try {
            const pdfResponse = await fetch(pdfUrl);
            const pdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
            // eslint-disable-next-line @typescript-eslint/no-require-imports
            const { PDFParse } = require("pdf-parse");
            const parser = new PDFParse({ data: pdfBuffer });
            const parsed = await parser.getText();
            pdfText = parsed.text;
        } catch (err) {
            console.error("PDF parse error:", err);
            // Fallback: use GPT-4o vision to read the PDF
            pdfText = "";
        }

        if (!pdfText || pdfText.trim().length < 100) {
            // If no text extracted, mark as failed
            await supabase
                .from("jobs")
                .update({
                    step: "failed",
                    error: "Could not extract text from PDF. The document may be image-only or corrupted.",
                    updated_at: new Date().toISOString()
                })
                .eq("report_id", reportId);
            await supabase
                .from("reports")
                .update({ status: "failed" })
                .eq("id", reportId);
            return NextResponse.json({ error: "PDF text extraction failed" }, { status: 400 });
        }

        // Chunk the text into ~4000 char segments with 200 char overlap
        const CHUNK_SIZE = 4000;
        const OVERLAP = 200;
        const chunks: string[] = [];
        for (let i = 0; i < pdfText.length; i += CHUNK_SIZE - OVERLAP) {
            chunks.push(pdfText.slice(i, i + CHUNK_SIZE));
        }

        await supabase
            .from("jobs")
            .update({ step: "extracting", progress: 15, updated_at: new Date().toISOString() })
            .eq("report_id", reportId);

        // Extract claims from each chunk using GPT-4o
        interface ExtractedClaim {
            text: string;
            category: string;
            page_reference?: string;
            entities_mentioned?: string[];
        }

        const allClaims: ExtractedClaim[] = [];

        for (let i = 0; i < chunks.length; i++) {
            const progress = 15 + Math.round((i / chunks.length) * 35);
            await supabase
                .from("jobs")
                .update({ step: "extracting", progress, updated_at: new Date().toISOString() })
                .eq("report_id", reportId);

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `You are an ESG analyst specializing in identifying corporate sustainability claims. Extract every explicit sustainability claim from this document segment as structured JSON.

Rules:
- Only extract EXPLICIT claims (quantitative statements, specific commitments, measurable assertions)
- Do NOT extract vague aspirational language like "we are committed to sustainability"
- Categorize each claim: carbon | sourcing | water | labor | governance
- Include the exact quote or close paraphrase from the document

Return JSON: { "claims": [{ "text": "exact claim text", "category": "category", "entities_mentioned": ["entity1", "entity2"] }] }
If no claims found in this segment, return: { "claims": [] }`,
                    },
                    {
                        role: "user",
                        content: `Extract sustainability claims from this section:\n\n${chunks[i]}`,
                    },
                ],
                temperature: 0.1,
                max_tokens: 2000,
            });

            try {
                const content = response.choices[0]?.message?.content;
                if (content) {
                    const parsed = JSON.parse(content);
                    if (parsed.claims && Array.isArray(parsed.claims)) {
                        allClaims.push(...parsed.claims);
                    }
                }
            } catch (parseErr) {
                console.error(`Failed to parse claims from chunk ${i}:`, parseErr);
            }
        }

        // Deduplicate claims by similarity (simple approach: exact text match)
        const seen = new Set<string>();
        const uniqueClaims = allClaims.filter((claim) => {
            const normalized = claim.text.toLowerCase().trim();
            if (seen.has(normalized)) return false;
            seen.add(normalized);
            return true;
        });

        // Cap at 60 claims
        const finalClaims = uniqueClaims.slice(0, 60);

        await supabase
            .from("jobs")
            .update({ step: "extracting", progress: 50, updated_at: new Date().toISOString() })
            .eq("report_id", reportId);

        // Insert claims into database
        const claimRows = finalClaims.map((claim, index) => ({
            report_id: reportId,
            claim_text: claim.text,
            category: claim.category || "governance",
            entities: { entities_mentioned: claim.entities_mentioned || [] },
            seq_index: index,
        }));

        if (claimRows.length > 0) {
            const { error: insertError } = await supabase
                .from("claims")
                .insert(claimRows);

            if (insertError) {
                console.error("Claims insert error:", insertError);
            }
        }

        return NextResponse.json({
            success: true,
            claimCount: claimRows.length,
        });
    } catch (err) {
        console.error("Extract error:", err);
        return NextResponse.json(
            { error: "Extraction failed" },
            { status: 500 }
        );
    }
}
