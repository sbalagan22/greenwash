import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import OpenAI from "openai";

export const maxDuration = 120;

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(request: NextRequest) {
    try {
        const { reportId } = await request.json();
        const supabase = getServiceSupabase();

        // Fetch all claims for this report
        const { data: claims, error } = await supabase
            .from("claims")
            .select("id, claim_text, category, entities")
            .eq("report_id", reportId)
            .order("seq_index", { ascending: true });

        if (error || !claims) {
            return NextResponse.json({ error: "Failed to fetch claims" }, { status: 500 });
        }

        await supabase
            .from("jobs")
            .update({ step: "disambiguating", progress: 55, updated_at: new Date().toISOString() })
            .eq("report_id", reportId);

        // Process claims in batches of 5 for cost efficiency
        const BATCH_SIZE = 5;
        for (let i = 0; i < claims.length; i += BATCH_SIZE) {
            const batch = claims.slice(i, i + BATCH_SIZE);
            const progress = 55 + Math.round(((i + BATCH_SIZE) / claims.length) * 10);

            const response = await openai.chat.completions.create({
                model: "gpt-4o",
                response_format: { type: "json_object" },
                messages: [
                    {
                        role: "system",
                        content: `You are an ESG research analyst. For each sustainability claim, identify the specific entities that should be verified against external data sources.

For each claim, extract:
- companies: company names mentioned or implied (include parent companies)
- regions: geographic locations mentioned
- metrics: specific numeric metrics or targets mentioned
- time_period: time range referenced
- suppliers: any supplier or vendor names

Return JSON: {
  "entities": [
    {
      "claim_id": "the claim id",
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
                        content: `Extract entities from these claims:\n\n${batch
                            .map((c) => `ID: ${c.id}\nClaim: ${c.claim_text}\nCategory: ${c.category}`)
                            .join("\n\n")}`,
                    },
                ],
                temperature: 0.1,
                max_tokens: 2000,
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
            } catch (parseErr) {
                console.error("Entity parse error:", parseErr);
            }

            await supabase
                .from("jobs")
                .update({ progress, updated_at: new Date().toISOString() })
                .eq("report_id", reportId);
        }

        return NextResponse.json({ success: true });
    } catch (err) {
        console.error("Disambiguate error:", err);
        return NextResponse.json({ error: "Disambiguation failed" }, { status: 500 });
    }
}
