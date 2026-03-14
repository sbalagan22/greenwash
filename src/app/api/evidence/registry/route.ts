import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export const maxDuration = 30;

// Environment Canada NPRI/GHG registries - free, no API key required
const NPRI_BASE_URL =
    "https://data.ec.gc.ca/data/substances/monitor/national-pollutant-release-inventory-npri-dataset";

export async function POST(request: NextRequest) {
    try {
        const { claimId, entities, category } = await request.json();
        const supabase = getServiceSupabase();

        // Only query registry for carbon/water/sourcing claims
        if (!["carbon", "water", "sourcing"].includes(category)) {
            return NextResponse.json({ success: true, count: 0, skipped: true });
        }

        const companyNames: string[] = entities?.companies || [];
        if (companyNames.length === 0) {
            return NextResponse.json({ success: true, count: 0, skipped: true });
        }

        const evidenceRows: {
            claim_id: string;
            source_name: string;
            source_url: string;
            snippet: string;
            supports: boolean;
        }[] = [];

        // Try to query the NPRI dataset for each company
        for (const company of companyNames.slice(0, 3)) {
            try {
                // Check if we have cached results
                const cacheKey = `npri_${company.toLowerCase().replace(/\s+/g, "_")}`;

                // Query the NPRI API
                const searchUrl = `${NPRI_BASE_URL}/?q=${encodeURIComponent(company)}&format=json`;

                const response = await fetch(searchUrl, {
                    signal: AbortSignal.timeout(10000), // 10s timeout
                    headers: {
                        Accept: "application/json",
                    },
                });

                if (response.ok) {
                    const contentType = response.headers.get("content-type");
                    if (contentType?.includes("json")) {
                        const data = await response.json();

                        // Process NPRI records if found
                        if (data && Array.isArray(data.results) && data.results.length > 0) {
                            evidenceRows.push({
                                claim_id: claimId,
                                source_name: "Environment Canada — NPRI Registry",
                                source_url: NPRI_BASE_URL,
                                snippet: `NPRI records found for "${company}": ${data.results.length} entries in the National Pollutant Release Inventory. This indicates the company has reportable pollutant releases tracked by Environment Canada.`,
                                supports: false,
                            });
                        }
                    }
                }
            } catch (fetchErr) {
                // NPRI API may be down - skip silently as per requirements
                console.warn(`NPRI API query failed for ${company}:`, fetchErr);
            }
        }

        // Also try the GHG Reporting Program
        for (const company of companyNames.slice(0, 2)) {
            try {
                const ghgUrl = `https://data.ec.gc.ca/data/substances/monitor/canada-s-official-greenhouse-gas-inventory/?q=${encodeURIComponent(company)}&format=json`;

                const response = await fetch(ghgUrl, {
                    signal: AbortSignal.timeout(10000),
                    headers: { Accept: "application/json" },
                });

                if (response.ok) {
                    const contentType = response.headers.get("content-type");
                    if (contentType?.includes("json")) {
                        const data = await response.json();

                        if (data && Array.isArray(data.results) && data.results.length > 0) {
                            evidenceRows.push({
                                claim_id: claimId,
                                source_name: "Canada GHG Reporting Program",
                                source_url:
                                    "https://www.canada.ca/en/environment-climate-change/services/climate-change/greenhouse-gas-emissions/facility-reporting.html",
                                snippet: `GHG reporting records found for "${company}" in Canada's official greenhouse gas inventory. Government records indicate the company has emissions reporting obligations under the federal program.`,
                                supports: false,
                            });
                        }
                    }
                }
            } catch (fetchErr) {
                console.warn(`GHG API query failed for ${company}:`, fetchErr);
            }
        }

        // Insert evidence if found
        if (evidenceRows.length > 0) {
            await supabase.from("evidence").insert(evidenceRows);
        }

        return NextResponse.json({ success: true, count: evidenceRows.length });
    } catch (err) {
        console.error("Registry verifier error:", err);
        // Don't fail the pipeline - registry is supplementary
        return NextResponse.json({ success: true, count: 0, skipped: true });
    }
}
