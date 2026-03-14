import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import OpenAI from "openai";

export const maxDuration = 60;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
    try {
        const { claimId } = await request.json();
        const supabase = getServiceSupabase();

        // Fetch the claim
        const { data: claim } = await supabase
            .from("claims")
            .select("*")
            .eq("id", claimId)
            .single();

        if (!claim) {
            return NextResponse.json({ error: "Claim not found" }, { status: 404 });
        }

        // Fetch all evidence for this claim
        const { data: evidenceList } = await supabase
            .from("evidence")
            .select("*")
            .eq("claim_id", claimId);

        const evidence = evidenceList || [];

        // Build evidence summary for GPT-4o
        const evidenceSummary =
            evidence.length === 0
                ? "No evidence was found for this claim."
                : evidence
                    .map(
                        (e, i) =>
                            `Evidence ${i + 1} (${e.supports ? "SUPPORTING" : "CONTRADICTING"}):\nSource: ${e.source_name}\nSnippet: ${e.snippet}`
                    )
                    .join("\n\n");

        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            response_format: { type: "json_object" },
            messages: [
                {
                    role: "system",
                    content: `You are an expert fact-checker assessing the credibility of corporate sustainability claims. Given a claim and the evidence gathered, provide a credibility assessment.

RULES:
- If there is ZERO evidence (no sources found at all), the verdict MUST be "unverified" with confidence null
- If evidence only SUPPORTS the claim but no contradicting evidence exists, verdict = "supported" with confidence 0.67-0.85
- If evidence clearly CONTRADICTS the claim (government data, news reports), verdict = "contradicted" with confidence 0.15-0.35
- If evidence is mixed, verdict depends on the balance: mostly contradicting → "contradicted", mostly supporting → "supported"
- The reasoning must be a clear, human-readable paragraph explaining your assessment
- Do NOT invent or fabricate evidence. Only reason based on what was provided.

Return JSON: {
  "verdict": "supported" | "unverified" | "contradicted",
  "confidence": 0.0-1.0 (null if unverified),
  "reasoning": "Human-readable paragraph explaining the assessment."
}`,
                },
                {
                    role: "user",
                    content: `Assess this sustainability claim:

CLAIM: "${claim.claim_text}"
CATEGORY: ${claim.category}

EVIDENCE GATHERED:
${evidenceSummary}`,
                },
            ],
            temperature: 0.1,
            max_tokens: 500,
        });

        try {
            const content = response.choices[0]?.message?.content || "{}";
            const parsed = JSON.parse(content);

            await supabase
                .from("claims")
                .update({
                    verdict: parsed.verdict || "unverified",
                    confidence: parsed.confidence ?? null,
                    reasoning: parsed.reasoning || "Assessment could not be completed.",
                })
                .eq("id", claimId);

            return NextResponse.json({
                success: true,
                verdict: parsed.verdict,
                confidence: parsed.confidence,
            });
        } catch (parseErr) {
            console.error("Score parse error:", parseErr);
            // Default to unverified if parsing fails
            await supabase
                .from("claims")
                .update({
                    verdict: "unverified",
                    confidence: null,
                    reasoning: "Automated assessment could not be completed due to a processing error.",
                })
                .eq("id", claimId);

            return NextResponse.json({ success: true, verdict: "unverified" });
        }
    } catch (err) {
        console.error("Score error:", err);
        return NextResponse.json({ error: "Scoring failed" }, { status: 500 });
    }
}
