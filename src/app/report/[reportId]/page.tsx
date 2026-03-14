"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import {
    CheckCircle2,
    XCircle,
    AlertTriangle,
    MinusCircle,
    ExternalLink,
    ChevronDown,
    ChevronUp,
    Filter,
    ArrowLeft,
    Link2,
    Copy,
    FileText,
    ListChecks,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";

interface Claim {
    id: string;
    report_id: string;
    claim_text: string;
    category: string;
    entities: Record<string, unknown> | null;
    verdict: "supported" | "unverified" | "contradicted" | null;
    confidence: number | null;
    reasoning: string | null;
    seq_index: number;
}

interface Evidence {
    id: string;
    claim_id: string;
    source_name: string;
    source_url: string | null;
    snippet: string;
    supports: boolean;
}

interface Report {
    id: string;
    company_name: string;
    report_year: number | null;
    pdf_url: string;
    pdf_text: string | null;
    status: string;
    created_at: string;
    overall_score?: number | null;
    overall_analysis?: string | null;
}

type VerdictFilter = "all" | "supported" | "unverified" | "contradicted";
type ViewMode = "overview" | "document" | "claims";

function getVerdictColor(verdict: string | null) {
    switch (verdict) {
        case "supported":
            return { color: "var(--score-true)", bg: "var(--score-true-bg)", label: "✓ Supported", tag: "TRUE" };
        case "contradicted":
            return { color: "var(--score-false)", bg: "var(--score-false-bg)", label: "✗ Contradicted", tag: "FALSE" };
        case "unverified":
            return { color: "var(--score-unknown)", bg: "var(--score-unknown-bg)", label: "— Unverified", tag: "UNKNOWN" };
        default:
            return { color: "var(--score-unknown)", bg: "var(--score-unknown-bg)", label: "— Pending", tag: "PENDING" };
    }
}

const CATEGORIES = ["carbon", "sourcing", "water", "labor", "governance"];

// ============================================================
// DOCUMENT VIEW — PDF text with inline highlighted claims
// ============================================================
function DocumentView({
    pdfText,
    claims,
    evidence,
    verdictFilter,
    categoryFilter,
    onClaimClick,
}: {
    pdfText: string;
    claims: Claim[];
    evidence: Record<string, Evidence[]>;
    verdictFilter: VerdictFilter;
    categoryFilter: string;
    onClaimClick: (claimId: string) => void;
}) {

    // Filter claims
    const filteredClaims = useMemo(() => {
        return claims.filter((c) => {
            if (verdictFilter !== "all" && c.verdict !== verdictFilter) return false;
            if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
            return true;
        });
    }, [claims, verdictFilter, categoryFilter]);

    // Build highlighted text segments
    const segments = useMemo(() => {
        if (!pdfText) return [];

        // Find all claim positions in the text
        interface ClaimMatch {
            start: number;
            end: number;
            claim: Claim;
        }

        const matches: ClaimMatch[] = [];

        for (const claim of filteredClaims) {
            // Try to find exact match first
            const claimTextNorm = claim.claim_text.replace(/\s+/g, " ").trim();
            const pdfTextNorm = pdfText.replace(/\s+/g, " ");

            // Try exact substring match
            let idx = pdfTextNorm.toLowerCase().indexOf(claimTextNorm.toLowerCase());
            if (idx >= 0) {
                matches.push({ start: idx, end: idx + claimTextNorm.length, claim });
                continue;
            }

            // Try partial match (first 50 chars)
            const partial = claimTextNorm.slice(0, 50).toLowerCase();
            idx = pdfTextNorm.toLowerCase().indexOf(partial);
            if (idx >= 0) {
                // Find the end of the sentence from this point
                let endIdx = idx + claimTextNorm.length;
                if (endIdx > pdfTextNorm.length) endIdx = Math.min(idx + 200, pdfTextNorm.length);
                matches.push({ start: idx, end: endIdx, claim });
            }
        }

        // Sort by start position
        matches.sort((a, b) => a.start - b.start);

        // Remove overlapping matches
        const filtered: ClaimMatch[] = [];
        for (const match of matches) {
            if (filtered.length === 0 || match.start >= filtered[filtered.length - 1].end) {
                filtered.push(match);
            }
        }

        // Build segments (text + highlighted)
        const normalizedText = pdfText.replace(/\s+/g, " ");
        interface Segment {
            type: "text" | "claim";
            content: string;
            claim?: Claim;
        }

        const result: Segment[] = [];
        let cursor = 0;

        for (const match of filtered) {
            if (match.start > cursor) {
                result.push({
                    type: "text",
                    content: normalizedText.slice(cursor, match.start),
                });
            }
            result.push({
                type: "claim",
                content: normalizedText.slice(match.start, match.end),
                claim: match.claim,
            });
            cursor = match.end;
        }

        if (cursor < normalizedText.length) {
            result.push({
                type: "text",
                content: normalizedText.slice(cursor),
            });
        }

        return result;
    }, [pdfText, filteredClaims]);

    // If no PDF text, show a message
    if (!pdfText) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Full document text is not available for this report.
                </p>
            </div>
        );
    }

    return (
        <ScrollArea className="h-full">
            <div className="max-w-3xl mx-auto px-8 py-10 leading-relaxed text-[15px]"
                style={{ color: "var(--text-secondary)" }}>
                {segments.map((seg, i) => {
                    if (seg.type === "text") {
                        // Render text with paragraph breaks
                        return (
                            <React.Fragment key={i}>
                                {seg.content.split(/\n\n+/).map((para, j) => (
                                    <p key={`${i}-${j}`} className="mb-4 whitespace-pre-wrap">
                                        {para}
                                    </p>
                                ))}
                            </React.Fragment>
                        );
                    }

                    // Render highlighted claim
                    const claim = seg.claim!;
                    const verdict = getVerdictColor(claim.verdict);

                    return (
                        <span key={i} className="relative inline">
                            <mark
                                className="px-1.5 py-0.5 rounded cursor-pointer transition-all duration-200 hover:ring-2 hover:ring-offset-1"
                                style={{
                                    background: verdict.bg,
                                    color: "var(--text-primary)",
                                    borderBottom: `2px solid ${verdict.color}`,
                                    fontWeight: 500,
                                }}
                                onClick={() => onClaimClick(claim.id)}
                                title="Click to view evidence"
                            >
                                {seg.content}
                                <span
                                    className="inline-flex items-center ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-bold font-mono-gw align-middle shadow-sm hover:scale-105 transition-transform"
                                    style={{
                                        background: verdict.color,
                                        color: "#fff",
                                        letterSpacing: "0.05em",
                                    }}
                                >
                                    {verdict.tag}
                                </span>
                            </mark>
                        </span>
                    );
                })}
            </div>
        </ScrollArea>
    );
}

// ============================================================
// OVERVIEW VIEW — Overall Score & Analysis Header
// ============================================================
function OverviewView({ report }: { report: Report }) {
    if (report.overall_score === undefined || report.overall_score === null) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Overall report analysis is not available or still processing.
                </p>
            </div>
        );
    }

    let verdictColor = "var(--score-true)";
    if (report.overall_score < 40) verdictColor = "var(--score-false)";
    else if (report.overall_score < 70) verdictColor = "var(--score-unknown)";

    return (
        <ScrollArea className="h-full">
            <div className="max-w-4xl mx-auto px-8 py-12 flex flex-col gap-10">
                <div
                    className="p-8 rounded-2xl border text-center"
                    style={{
                        background: "var(--bg-surface)",
                        borderColor: "var(--gw-border)",
                        boxShadow: "0 8px 30px rgba(0,0,0,0.04)"
                    }}
                >
                    <h2 className="text-sm font-bold uppercase tracking-widest mb-4" style={{ color: "var(--text-muted)" }}>
                        Overall Credibility Score
                    </h2>
                    <div className="text-7xl font-mono-gw font-bold mb-4" style={{ color: verdictColor }}>
                        {report.overall_score}%
                    </div>
                    <div className="w-full max-w-md mx-auto h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                        <div
                            className="h-full transition-all duration-1000"
                            style={{ width: `${report.overall_score}%`, background: verdictColor }}
                        />
                    </div>
                </div>

                <div>
                    <h3 className="text-xl font-display font-bold mb-6 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand-dark)" }} />
                        Why This Score?
                    </h3>
                    <div className="space-y-4">
                        {(report.overall_analysis || 'No detailed analysis available.').split('\n\n').map((paragraph, i) => (
                            <p
                                key={i}
                                className="text-[15px] leading-relaxed"
                                style={{ color: "var(--text-secondary)" }}
                            >
                                {paragraph.trim()}
                            </p>
                        ))}
                    </div>
                </div>
            </div>
        </ScrollArea>
    );
}

// ============================================================
// CLAIMS ANALYSIS VIEW — Cards list + Evidence panel
// ============================================================
function ClaimsAnalysisView({
    claims,
    evidence,
    verdictFilter,
    categoryFilter,
    selectedClaimId,
    setSelectedClaimId,
}: {
    claims: Claim[];
    evidence: Record<string, Evidence[]>;
    verdictFilter: VerdictFilter;
    categoryFilter: string;
    selectedClaimId: string | null;
    setSelectedClaimId: (id: string) => void;
}) {

    const filteredClaims = useMemo(() => {
        return claims.filter((c) => {
            if (verdictFilter !== "all" && c.verdict !== verdictFilter) return false;
            if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
            return true;
        });
    }, [claims, verdictFilter, categoryFilter]);

    // Auto-select first claim
    useEffect(() => {
        if (filteredClaims.length > 0 && !selectedClaimId) {
            const contradicted = filteredClaims.find((c) => c.verdict === "contradicted");
            setSelectedClaimId(contradicted?.id || filteredClaims[0].id);
        }
    }, [filteredClaims, selectedClaimId]);

    const selectedClaim = claims.find((c) => c.id === selectedClaimId);
    const selectedEvidence = selectedClaimId ? evidence[selectedClaimId] || [] : [];

    return (
        <div className="flex flex-1 overflow-hidden">
            {/* Left Panel - Claim List */}
            <div
                className="w-2/5 min-w-[400px] xl:w-[480px] shrink-0 overflow-hidden flex flex-col"
                style={{
                    borderRight: "1px solid var(--gw-border)",
                }}
            >
                <ScrollArea className="flex-1 h-full">
                    <div className="py-2">
                        {filteredClaims.map((claim) => {
                            const isSelected = claim.id === selectedClaimId;
                            const verdict = getVerdictColor(claim.verdict);
                            const score = claim.confidence !== null ? Math.round(claim.confidence * 100) : null;

                            return (
                                <div
                                    key={claim.id}
                                    className="px-5 py-4 cursor-pointer transition-all border-l-4 hover:bg-black/5 dark:hover:bg-white/5"
                                    style={{
                                        borderLeftColor: isSelected ? verdict.color : "transparent",
                                        background: isSelected ? "var(--brand-subtle)" : "transparent",
                                    }}
                                    onClick={() => setSelectedClaimId(claim.id)}
                                >
                                    <div className="flex items-start gap-2 mb-1.5">
                                        <span
                                            className="inline-flex items-center px-1.5 py-0 rounded text-[10px] font-bold font-mono-gw shrink-0 mt-0.5"
                                            style={{
                                                background: verdict.color,
                                                color: "#fff",
                                                letterSpacing: "0.05em",
                                            }}
                                        >
                                            {verdict.tag}
                                        </span>
                                        <p
                                            className="text-sm font-medium line-clamp-2"
                                            style={{ color: "var(--text-primary)" }}
                                        >
                                            {claim.claim_text}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 pl-8">
                                        <Badge variant="outline" className="text-[10px]">
                                            {claim.category}
                                        </Badge>
                                        {score !== null && (
                                            <div className="flex items-center gap-1.5 flex-1">
                                                <div className="credibility-meter flex-1">
                                                    <div
                                                        className="credibility-meter-fill"
                                                        style={{
                                                            width: `${score}%`,
                                                            background: verdict.color,
                                                        }}
                                                    />
                                                </div>
                                                <span className="text-[10px] font-mono-gw" style={{ color: "var(--text-muted)" }}>
                                                    {score}%
                                                </span>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {filteredClaims.length === 0 && (
                            <div className="px-4 py-8 text-center">
                                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                                    No claims match the current filters.
                                </p>
                            </div>
                        )}
                    </div>
                </ScrollArea>
            </div>

            {/* Right Panel - Evidence Detail */}
            <div className="flex-1 overflow-hidden flex flex-col" style={{ background: "var(--bg-base)" }}>
                {selectedClaim ? (
                    <ScrollArea className="flex-1 h-full">
                        <div className="p-8 max-w-6xl mx-auto w-full">
                            {/* Claim header */}
                            <div className="mb-6">
                                <div className="flex items-center gap-2 mb-3">
                                    <Badge variant="outline" className="text-xs">
                                        {selectedClaim.category}
                                    </Badge>
                                    {(() => {
                                        const v = getVerdictColor(selectedClaim.verdict);
                                        return (
                                            <span
                                                className="px-2.5 py-1 rounded font-mono-gw text-xs font-bold shadow-sm"
                                                style={{ background: v.bg, color: v.color }}
                                            >
                                                {v.label}
                                            </span>
                                        );
                                    })()}
                                </div>
                                <h2
                                    className="text-2xl font-display font-bold leading-tight"
                                    style={{ color: "var(--text-primary)" }}
                                >
                                    &ldquo;{selectedClaim.claim_text}&rdquo;
                                </h2>
                            </div>

                            {/* Confidence meter */}
                            {selectedClaim.confidence !== null && (
                                <div className="mb-8 p-4 rounded-xl shadow-sm border" style={{ background: "var(--bg-surface)", borderColor: "var(--gw-border)" }}>
                                    <div className="flex justify-between items-center mb-2">
                                        <span className="text-sm font-semibold" style={{ color: "var(--text-secondary)" }}>
                                            AI Credibility Score
                                        </span>
                                        <span className="font-mono-gw text-lg font-bold" style={{
                                            color: getVerdictColor(selectedClaim.verdict).color
                                        }}>
                                            {Math.round(selectedClaim.confidence * 100)}%
                                        </span>
                                    </div>
                                    <div className="w-full h-2.5 rounded-full" style={{ background: "var(--bg-elevated)" }}>
                                        <div
                                            className="h-full rounded-full transition-all"
                                            style={{
                                                width: `${Math.round(selectedClaim.confidence * 100)}%`,
                                                background: getVerdictColor(selectedClaim.verdict).color,
                                            }}
                                        />
                                    </div>
                                </div>
                            )}

                            {/* Side by side layout for AI Analysis and Evidence */}
                            <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                                {/* Left Column: AI Reasoning (Fills dead space) */}
                                {selectedClaim.reasoning && (
                                    <div className="flex flex-col">
                                        <h3
                                            className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 mb-4"
                                            style={{ color: "var(--brand-dark)" }}
                                        >
                                            <div className="w-2 h-2 rounded-full animate-pulse" style={{ background: "var(--brand-dark)" }} />
                                            AI Auditor Analysis
                                        </h3>
                                        <div
                                            className="p-6 rounded-xl text-[14.5px] leading-relaxed flex-1"
                                            style={{
                                                background: "var(--bg-surface)",
                                                color: "var(--text-secondary)",
                                                border: "1px solid var(--gw-border)",
                                                boxShadow: "0 4px 12px rgba(0,0,0,0.02)",
                                            }}
                                        >
                                            {selectedClaim.reasoning}
                                        </div>
                                    </div>
                                )}

                                {/* Right Column: Cross-Referenced Evidence */}
                                <div className="flex flex-col">
                                    <h3
                                        className="text-xs font-bold uppercase tracking-widest mb-4"
                                        style={{ color: "var(--text-muted)" }}
                                    >
                                        Cross-Referenced Evidence ({selectedEvidence.length} source{selectedEvidence.length !== 1 ? "s" : ""})
                                    </h3>

                                    {selectedEvidence.length === 0 ? (
                                        <div
                                            className="p-6 rounded-xl text-sm border"
                                            style={{ background: "var(--bg-surface)", color: "var(--text-muted)", borderColor: "var(--gw-border)" }}
                                        >
                                            No external evidence was found for this claim.
                                        </div>
                                    ) : (
                                        <div className="space-y-4">
                                            {selectedEvidence.map((ev) => (
                                                <div
                                                    key={ev.id}
                                                    className="p-5 rounded-xl shadow-sm border"
                                                    style={{
                                                        background: "var(--bg-surface)",
                                                        borderColor: "var(--gw-border)",
                                                        borderLeftWidth: "4px",
                                                        borderLeftColor: ev.supports ? "var(--score-true)" : "var(--score-false)"
                                                    }}
                                                >
                                                    <div className="flex items-center gap-2.5 mb-3">
                                                        {ev.supports ? (
                                                            <div className="p-1 rounded-full" style={{ background: "var(--score-true-bg)" }}>
                                                                <CheckCircle2 size={16} style={{ color: "var(--score-true)" }} />
                                                            </div>
                                                        ) : (
                                                            <div className="p-1 rounded-full" style={{ background: "var(--score-false-bg)" }}>
                                                                <XCircle size={16} style={{ color: "var(--score-false)" }} />
                                                            </div>
                                                        )}
                                                        <span
                                                            className="text-[13px] font-bold line-clamp-1"
                                                            style={{ color: "var(--text-primary)" }}
                                                            title={ev.source_name}
                                                        >
                                                            {ev.source_name}
                                                        </span>
                                                        <span
                                                            className="text-[10px] font-mono-gw ml-auto px-2 py-0.5 rounded-full"
                                                            style={{
                                                                background: ev.supports ? "var(--score-true-bg)" : "var(--score-false-bg)",
                                                                color: ev.supports
                                                                    ? "var(--score-true)"
                                                                    : "var(--score-false)",
                                                            }}
                                                        >
                                                            {ev.supports ? "SUPPORTS" : "CONTRADICTS"}
                                                        </span>
                                                    </div>
                                                    <p
                                                        className="text-[13.5px] leading-relaxed mb-3"
                                                        style={{ color: "var(--text-secondary)" }}
                                                    >
                                                        "{ev.snippet}"
                                                    </p>
                                                    {ev.source_url && (
                                                        <a
                                                            href={ev.source_url}
                                                            target="_blank"
                                                            rel="noopener noreferrer"
                                                            className="inline-flex items-center gap-1.5 text-xs font-semibold hover:underline"
                                                            style={{ color: "var(--brand-dark)" }}
                                                        >
                                                            Read original source <ExternalLink size={12} />
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>
                    </ScrollArea>
                ) : (
                    <div className="flex items-center justify-center h-full">
                        <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                            Select a claim to view evidence
                        </p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// MAIN REPORT PAGE
// ============================================================
export default function ReportPage() {
    const params = useParams();
    const router = useRouter();
    const reportId = params.reportId as string;

    const [report, setReport] = useState<Report | null>(null);
    const [claims, setClaims] = useState<Claim[]>([]);
    const [evidence, setEvidence] = useState<Record<string, Evidence[]>>({});
    const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [viewMode, setViewMode] = useState<ViewMode>("claims");
    const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [copied, setCopied] = useState(false);

    const isDemo = reportId === "demo";

    useEffect(() => {
        async function loadReport() {
            if (isDemo) {
                setReport({
                    id: "demo",
                    company_name: "PetroGreen Energy Corp",
                    report_year: 2024,
                    pdf_url: "",
                    pdf_text: null,
                    status: "complete",
                    created_at: new Date().toISOString(),
                    overall_score: 42,
                    overall_analysis: "PetroGreen Energy Corp's 2024 sustainability report demonstrates a pattern of significant greenwashing, presenting aspirational goals and cherry-picked metrics while obscuring contradictory operational realities.\n\nThe company claims a 35% reduction in Scope 1 emissions. However, official government registries (NPRI) show a 14% increase in absolute emissions over the same period. Claimed 90% water recycling rates contradict regulatory filings, which show the actual rate is around 65%, well below the industry average. Assertions of zero fatalities are directly contradicted by public health and safety records documenting two workplace fatalities at the company's facilities in 2024.\n\nDespite the overstatements, independent evidence does support the company's $480 million investment in carbon capture infrastructure (CCS) and its conservation agreements protecting approximately 14,800 hectares of boreal forest.\n\nThe report's credibility is severely undermined by verifiable contradictions in critical environmental and safety metrics. The score of 42% reflects that while some capital investments and conservation efforts are legitimate, the core operational claims are highly misleading.",
                });
                setClaims(DEMO_CLAIMS);
                setEvidence(DEMO_EVIDENCE);
                setLoading(false);
                return;
            }

            const { data: reportData } = await supabase
                .from("reports")
                .select("*")
                .eq("id", reportId)
                .single();

            if (reportData) setReport(reportData);

            const { data: claimsData } = await supabase
                .from("claims")
                .select("*")
                .eq("report_id", reportId)
                .order("seq_index", { ascending: true });

            if (claimsData) {
                setClaims(claimsData);

                const claimIds = claimsData.map((c) => c.id);
                if (claimIds.length > 0) {
                    const { data: evidenceData } = await supabase
                        .from("evidence")
                        .select("*")
                        .in("claim_id", claimIds);

                    if (evidenceData) {
                        const grouped: Record<string, Evidence[]> = {};
                        evidenceData.forEach((e) => {
                            if (!grouped[e.claim_id]) grouped[e.claim_id] = [];
                            grouped[e.claim_id].push(e);
                        });
                        setEvidence(grouped);
                    }
                }
            }

            // Auto-select overview if score is available, otherwise document view
            if (reportData && reportData.overall_score !== null && reportData.overall_score !== undefined) {
                setViewMode("overview");
            } else if (reportData?.pdf_text) {
                setViewMode("document");
            }

            setLoading(false);
        }

        loadReport();
    }, [reportId, isDemo]);

    const verdictCounts = useMemo(() => {
        const counts = { supported: 0, unverified: 0, contradicted: 0 };
        claims.forEach((c) => {
            if (c.verdict && c.verdict in counts) {
                counts[c.verdict as keyof typeof counts]++;
            }
        });
        return counts;
    }, [claims]);

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    if (loading) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
                <div className="text-center">
                    <div className="w-8 h-8 rounded-full animate-gentle-pulse mx-auto mb-3" style={{ background: "var(--brand-subtle)" }} />
                    <p className="text-sm" style={{ color: "var(--text-muted)" }}>Loading report...</p>
                </div>
            </div>
        );
    }

    if (!report) {
        return (
            <div className="min-h-screen flex items-center justify-center" style={{ background: "var(--bg-base)" }}>
                <div className="text-center">
                    <p className="text-lg font-display font-bold mb-2" style={{ color: "var(--text-primary)" }}>
                        Report not found
                    </p>
                    <Button onClick={() => router.push("/")} variant="outline">Go home</Button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen flex flex-col" style={{ background: "var(--bg-base)" }}>
            {/* Top Bar */}
            <header
                className="flex items-center justify-between px-6 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--gw-border)" }}
            >
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost" size="sm"
                        onClick={() => router.push("/")}
                        className="gap-1.5"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        <ArrowLeft size={14} /> Back
                    </Button>
                    <Separator orientation="vertical" className="h-5" />
                    <div className="flex items-center gap-2">
                        <Image src="/icon.png" alt="" width={20} height={20} />
                        <span className="font-display font-bold text-base" style={{ color: "var(--text-primary)" }}>
                            {report.company_name}
                        </span>
                        {report.report_year && (
                            <span className="text-xs font-mono-gw" style={{ color: "var(--text-muted)" }}>
                                {report.report_year}
                            </span>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-3">
                    {/* View mode toggle */}
                    <div
                        className="flex rounded-lg p-0.5"
                        style={{ background: "var(--bg-elevated)" }}
                    >
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                            style={{
                                background: viewMode === "overview" ? "var(--bg-base)" : "transparent",
                                color: viewMode === "overview" ? "var(--text-primary)" : "var(--text-muted)",
                                boxShadow: viewMode === "overview" ? "var(--gw-shadow)" : "none",
                            }}
                            onClick={() => setViewMode("overview")}
                        >
                            <FileText size={12} /> Overview
                        </button>
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                            style={{
                                background: viewMode === "document" ? "var(--bg-base)" : "transparent",
                                color: viewMode === "document" ? "var(--text-primary)" : "var(--text-muted)",
                                boxShadow: viewMode === "document" ? "var(--gw-shadow)" : "none",
                            }}
                            onClick={() => setViewMode("document")}
                        >
                            <FileText size={12} /> Document
                        </button>
                        <button
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-all"
                            style={{
                                background: viewMode === "claims" ? "var(--bg-base)" : "transparent",
                                color: viewMode === "claims" ? "var(--text-primary)" : "var(--text-muted)",
                                boxShadow: viewMode === "claims" ? "var(--gw-shadow)" : "none",
                            }}
                            onClick={() => setViewMode("claims")}
                        >
                            <ListChecks size={12} /> Claims
                        </button>
                    </div>

                    <Separator orientation="vertical" className="h-5" />

                    <div className="text-xs font-mono-gw hidden md:block" style={{ color: "var(--text-secondary)" }}>
                        {claims.length} claims · {verdictCounts.supported} ✓ · {verdictCounts.unverified} ~ · {verdictCounts.contradicted} ✗
                    </div>
                    <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1.5 text-xs">
                        {copied ? <CheckCircle2 size={12} /> : <Link2 size={12} />}
                        {copied ? "Copied!" : "Share"}
                    </Button>
                </div>
            </header>

            {/* Filters bar */}
            <div
                className="flex items-center gap-4 px-6 py-2 shrink-0"
                style={{ borderBottom: "1px solid var(--gw-border)", background: "var(--bg-surface)" }}
            >
                <div className="flex items-center gap-1 mr-1">
                    <Filter size={12} style={{ color: "var(--text-muted)" }} />
                </div>
                {/* Verdict filters */}
                {(["all", "contradicted", "unverified", "supported"] as VerdictFilter[]).map((v) => {
                    const isAll = v === "all";
                    const verdictStyle = isAll ? null : getVerdictColor(v);
                    return (
                        <button
                            key={v}
                            onClick={() => setVerdictFilter(v)}
                            className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-100 opacity-80"
                            style={{
                                background: verdictFilter === v
                                    ? isAll ? "var(--bg-elevated)" : verdictStyle!.bg
                                    : "transparent",
                                color: verdictFilter === v
                                    ? isAll ? "var(--text-primary)" : verdictStyle!.color
                                    : "var(--text-muted)",
                                border: `1px solid ${verdictFilter === v ? (isAll ? "var(--gw-border)" : verdictStyle!.color) : "transparent"}`,
                                opacity: verdictFilter === v ? 1 : undefined,
                            }}
                        >
                            {isAll ? "All Claims" : v.charAt(0).toUpperCase() + v.slice(1)}
                        </button>
                    );
                })}

                <Separator orientation="vertical" className="h-4" />

                {/* Category filters */}
                <div className="flex bg-(--bg-base) p-1 rounded-lg border border-(--gw-border) shadow-sm">
                    <button
                        onClick={() => setCategoryFilter("all")}
                        className="px-3 py-1 rounded text-[11px] font-medium transition-all tracking-wide"
                        style={{
                            background: categoryFilter === "all" ? "var(--bg-surface)" : "transparent",
                            color: categoryFilter === "all" ? "var(--text-primary)" : "var(--text-muted)",
                            boxShadow: categoryFilter === "all" ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                        }}
                    >
                        All Categories
                    </button>
                    {CATEGORIES.map((cat) => (
                        <button
                            key={cat}
                            onClick={() => setCategoryFilter(cat)}
                            className="px-3 py-1 rounded text-[11px] font-medium capitalize transition-all tracking-wide"
                            style={{
                                background: categoryFilter === cat ? "var(--bg-surface)" : "transparent",
                                color: categoryFilter === cat ? "var(--text-primary)" : "var(--text-muted)",
                                boxShadow: categoryFilter === cat ? "0 1px 3px rgba(0,0,0,0.05)" : "none",
                            }}
                        >
                            {cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-hidden">
                {viewMode === "overview" ? (
                    <OverviewView report={report} />
                ) : viewMode === "document" ? (
                    <DocumentView
                        pdfText={report.pdf_text || ""}
                        claims={claims}
                        evidence={evidence}
                        verdictFilter={verdictFilter}
                        categoryFilter={categoryFilter}
                        onClaimClick={(id) => {
                            setSelectedClaimId(id);
                            setViewMode("claims");
                        }}
                    />
                ) : (
                    <ClaimsAnalysisView
                        claims={claims}
                        evidence={evidence}
                        verdictFilter={verdictFilter}
                        categoryFilter={categoryFilter}
                        selectedClaimId={selectedClaimId}
                        setSelectedClaimId={setSelectedClaimId}
                    />
                )}
            </div>
        </div>
    );
}

const DEMO_CLAIMS: Claim[] = [
    {
        id: "demo-1",
        report_id: "demo",
        claim_text: "We reduced our Scope 1 greenhouse gas emissions by 35% compared to our 2019 baseline.",
        category: "carbon",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["Scope 1 GHG emissions", "35% reduction"], time_period: "2019–2024" },
        verdict: "contradicted",
        confidence: 0.18,
        reasoning: "Environment Canada's National Pollutant Release Inventory shows PetroGreen Energy Corp's facilities in Alberta reported increased total emissions of 2.4 million tonnes CO2e in 2023, up from 2.1 million tonnes in 2019 — an increase of approximately 14%. The company's claim of a 35% reduction directly contradicts official government registry data.",
        seq_index: 0,
    },
    {
        id: "demo-2",
        report_id: "demo",
        claim_text: "100% of electricity consumed at our corporate offices comes from renewable energy certificates.",
        category: "carbon",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["100% renewable electricity"], regions: ["Corporate offices"] },
        verdict: "supported",
        confidence: 0.72,
        reasoning: "Renewable Energy Certificate (REC) purchases are documented in PetroGreen's CDP submission. While the claim is technically accurate, this represents less than 2% of the company's total energy consumption.",
        seq_index: 1,
    },
    {
        id: "demo-3",
        report_id: "demo",
        claim_text: "Our supply chain audit program covers 95% of tier-1 suppliers for environmental compliance.",
        category: "sourcing",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["95% tier-1 supplier coverage"] },
        verdict: "unverified",
        confidence: null,
        reasoning: "No independent verification of supplier audit coverage was found. The company does not publish its supplier audit methodology or results publicly.",
        seq_index: 2,
    },
    {
        id: "demo-4",
        report_id: "demo",
        claim_text: "We achieved zero fatalities and a 40% reduction in recordable incidents across all operations in 2024.",
        category: "labor",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["Zero fatalities", "40% incident reduction"], time_period: "2024" },
        verdict: "contradicted",
        confidence: 0.25,
        reasoning: "Media reports from CBC News in August 2024 documented a fatal incident at PetroGreen's Fort McMurray facility. Alberta OHS records show two workplace fatalities in 2024.",
        seq_index: 3,
    },
    {
        id: "demo-5",
        report_id: "demo",
        claim_text: "PetroGreen invested $500 million in carbon capture and storage technology in 2024.",
        category: "carbon",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["$500M CCS investment"], time_period: "2024" },
        verdict: "supported",
        confidence: 0.68,
        reasoning: "PetroGreen's 2024 annual financial filing confirms a $480M capital expenditure allocation to CCS projects. The claim is substantially supported with minor rounding discrepancy.",
        seq_index: 4,
    },
    {
        id: "demo-6",
        report_id: "demo",
        claim_text: "Our water recycling program recovers 90% of water used in extraction processes.",
        category: "water",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["90% water recycling rate"], regions: ["Extraction operations"] },
        verdict: "contradicted",
        confidence: 0.3,
        reasoning: "Alberta Energy Regulator data shows PetroGreen's water recycling rates average approximately 65% — well below the claimed 90%. NPRI data also shows significant water discharge volumes inconsistent with a 90% rate.",
        seq_index: 5,
    },
    {
        id: "demo-7",
        report_id: "demo",
        claim_text: "We have committed to achieving net-zero Scope 1 and 2 emissions by 2040.",
        category: "governance",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["Net-zero by 2040"] },
        verdict: "unverified",
        confidence: null,
        reasoning: "This is a forward-looking commitment rather than a verifiable current claim. No interim targets or detailed transition plan was found publicly.",
        seq_index: 6,
    },
    {
        id: "demo-8",
        report_id: "demo",
        claim_text: "PetroGreen's biodiversity offset program has protected over 15,000 hectares of boreal forest in Northern Alberta.",
        category: "sourcing",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["15,000 hectares protected"], regions: ["Northern Alberta"] },
        verdict: "supported",
        confidence: 0.78,
        reasoning: "Alberta Biodiversity Monitoring Institute records confirm conservation agreements covering approximately 14,800 hectares in the Athabasca region.",
        seq_index: 7,
    },
];

const DEMO_EVIDENCE: Record<string, Evidence[]> = {
    "demo-1": [
        {
            id: "ev-1a", claim_id: "demo-1",
            source_name: "Environment Canada — NPRI",
            source_url: "https://www.canada.ca/en/services/environment/pollution-waste-management/national-pollutant-release-inventory.html",
            snippet: "PetroGreen Energy Corp facilities reported total GHG emissions of 2,412,000 tonnes CO2e for 2023, up from 2,115,000 tonnes in 2019 — an increase of approximately 14%.",
            supports: false,
        },
        {
            id: "ev-1b", claim_id: "demo-1",
            source_name: "GHG Reporting Program — Canada.ca",
            source_url: "https://www.canada.ca/en/environment-climate-change/services/climate-change/greenhouse-gas-emissions/facility-reporting.html",
            snippet: "Federal greenhouse gas reporting data for large emitters confirms PetroGreen Energy Corp as reporting increased emissions across its Alberta and Saskatchewan operations between 2019 and 2023.",
            supports: false,
        },
    ],
    "demo-2": [
        {
            id: "ev-2a", claim_id: "demo-2",
            source_name: "CDP Climate Questionnaire 2024",
            source_url: "https://www.cdp.net/en",
            snippet: "PetroGreen disclosed purchase of RECs equivalent to 100% of corporate office electricity consumption (approximately 12,000 MWh) for the 2023-2024 period.",
            supports: true,
        },
    ],
    "demo-3": [],
    "demo-4": [
        {
            id: "ev-4a", claim_id: "demo-4",
            source_name: "Alberta OHS — Incident Reports",
            source_url: "https://www.alberta.ca/occupational-health-safety",
            snippet: "Two workplace fatalities recorded at PetroGreen Energy Corp operations during 2024 fiscal year. Both incidents under investigation.",
            supports: false,
        },
    ],
    "demo-5": [
        {
            id: "ev-5a", claim_id: "demo-5",
            source_name: "Reuters",
            source_url: "https://www.reuters.com/business/energy/",
            snippet: "PetroGreen Energy announced a $480 million investment in carbon capture infrastructure at its Alberta operations, one of the largest CCS commitments by a Canadian energy company in 2024.",
            supports: true,
        },
    ],
    "demo-6": [
        {
            id: "ev-6a", claim_id: "demo-6",
            source_name: "Alberta Energy Regulator",
            source_url: "https://www.aer.ca/providing-information/data-and-reports",
            snippet: "Water recycling rates for PetroGreen's SAGD operations averaged 65.2% across all facilities in 2023, below the industry average of 72% for thermal oil sands operations.",
            supports: false,
        },
    ],
    "demo-7": [],
    "demo-8": [
        {
            id: "ev-8a", claim_id: "demo-8",
            source_name: "Alberta Biodiversity Monitoring Institute",
            source_url: "https://www.abmi.ca/home/data-analytics",
            snippet: "Conservation agreements associated with PetroGreen Energy Corp cover approximately 14,800 hectares in the Athabasca boreal region.",
            supports: true,
        },
    ],
};
