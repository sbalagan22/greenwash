import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";
import { tavily } from "@tavily/core";

export const maxDuration = 60;

const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY! });

interface ClaimEntities {
    companies?: string[];
    regions?: string[];
    metrics?: string[];
    time_period?: string;
    suppliers?: string[];
}

export async function POST(request: NextRequest) {
    try {
        const { claimId, claimText, entities, category } = await request.json();
        const supabase = getServiceSupabase();

        const ents = entities as ClaimEntities;
        const companyNames = ents?.companies?.join(", ") || "the company";
        const year = ents?.time_period || "recent years";

        // Build search queries based on category
        const searchQueries: string[] = [];

        if (category === "carbon") {
            searchQueries.push(`${companyNames} emissions data ${year}`);
            searchQueries.push(`${companyNames} carbon greenwashing`);
        } else if (category === "sourcing") {
            const suppliers = ents?.suppliers?.join(", ") || companyNames;
            searchQueries.push(`${suppliers} environmental violation`);
            searchQueries.push(`${companyNames} supply chain controversy`);
        } else if (category === "water") {
            searchQueries.push(`${companyNames} water pollution ${year}`);
        } else if (category === "labor") {
            searchQueries.push(`${companyNames} labor violation workplace safety ${year}`);
        } else {
            searchQueries.push(`${companyNames} ${category} controversy ${year}`);
        }

        // Always add a greenwashing query
        searchQueries.push(`${companyNames} greenwashing sustainability claims`);

        // Take up to 2 queries
        const queries = searchQueries.slice(0, 2);

        interface EvidenceRow {
            claim_id: string;
            source_name: string;
            source_url: string | null;
            snippet: string;
            supports: boolean;
        }
        const evidenceRows: EvidenceRow[] = [];

        for (const query of queries) {
            try {
                const results = await tvly.search(query, {
                    maxResults: 3,
                    searchDepth: "basic",
                    includeAnswer: false,
                });

                if (results.results && results.results.length > 0) {
                    for (const result of results.results) {
                        // Determine if the result supports or contradicts the claim
                        const snippetLower = (result.content || "").toLowerCase();
                        const claimLower = claimText.toLowerCase();

                        // Simple heuristic: if snippet mentions violations/controversy/false/misleading, likely contradicts
                        const contradictionKeywords = [
                            "violation", "fine", "penalty", "lawsuit", "misleading",
                            "false", "greenwashing", "accused", "scandal", "controversy",
                            "failed", "pollution", "contamination", "investigation",
                        ];
                        const hasContradiction = contradictionKeywords.some((kw) =>
                            snippetLower.includes(kw)
                        );

                        // Check if snippet is even relevant to the claim
                        const companyMentioned = (ents?.companies || []).some(
                            (company) => snippetLower.includes(company.toLowerCase())
                        );

                        if (!companyMentioned && !snippetLower.includes(claimLower.slice(0, 30).toLowerCase())) {
                            continue; // Skip irrelevant results
                        }

                        evidenceRows.push({
                            claim_id: claimId,
                            source_name: result.title || new URL(result.url).hostname,
                            source_url: result.url,
                            snippet: result.content?.slice(0, 500) || "",
                            supports: !hasContradiction,
                        });
                    }
                }
            } catch (searchErr) {
                console.warn(`Tavily search failed for "${query}":`, searchErr);
            }
        }

        // Deduplicate by URL
        const seen = new Set<string>();
        const uniqueEvidence = evidenceRows.filter((ev) => {
            if (!ev.source_url || seen.has(ev.source_url)) return false;
            seen.add(ev.source_url);
            return true;
        });

        // Cap at 5 evidence items
        const finalEvidence = uniqueEvidence.slice(0, 5);

        if (finalEvidence.length > 0) {
            await supabase.from("evidence").insert(finalEvidence);
        }

        return NextResponse.json({ success: true, count: finalEvidence.length });
    } catch (err) {
        console.error("News verifier error:", err);
        // Don't fail the entire pipeline
        return NextResponse.json({ success: true, count: 0 });
    }
}
