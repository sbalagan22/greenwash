"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
    CheckCircle2, AlertTriangle, ExternalLink,
    Filter, ArrowLeft, Link2, FileText, ListChecks,
    Flame, Package, Droplets, Users
} from "lucide-react";
import React from "react";

import dynamic from "next/dynamic";

const PDFViewer = dynamic(
    () => import("@/components/PDFViewer"),
    { ssr: false }
);

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
    page_reference?: number | null;
    bbox?: { x: number; y: number; width: number; height: number } | null;
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
    category_scores?: Record<string, number | null> | null;
}

type VerdictFilter = "all" | "supported" | "mixed" | "contradicted" | "unverified";
type ViewMode = "overview" | "claims" | "document";

// ============================================================
// HELPERS
// ============================================================
function getVerdict(score: number | null): 'supported' | 'mixed' | 'contradicted' | 'unverified' {
  if (score === null || score === undefined) return 'unverified';
  const normalized = score <= 1 && score > 0 ? score * 100 : score;
  if (normalized >= 70) return 'supported';
  if (normalized >= 30) return 'mixed';
  return 'contradicted';
}

function getVerdictLabel(verdict: 'supported' | 'mixed' | 'contradicted' | 'unverified') {
    switch (verdict) {
        case "supported": return { label: "✓ Supported", tag: "TRUE" };
        case "contradicted": return { label: "✗ Contradicted", tag: "FALSE" };
        case "mixed": return { label: "⚠ Mixed", tag: "MIXED" };
        case "unverified": return { label: "— Unverified", tag: "UNVERIFIED" };
    }
}

function getScoreColor(score: number | null): string {
  const verdict = getVerdict(score);
  const colors = { supported: '#85C391', mixed: '#E8C84A', contradicted: '#E07070', unverified: '#CCCCCC' };
  return colors[verdict];
}

function getScoreBg(score: number | null): string {
  const verdict = getVerdict(score);
  const bgs = { supported: '#EAF5EC', mixed: '#FDF6E3', contradicted: '#FDECEA', unverified: '#F5F5F5' };
  return bgs[verdict];
}

// unused but kept for possible future dynamic categories
// const CATEGORIES = ["carbon", "sourcing", "water", "labor"];

const categoryConfig: Record<string, { label: string, icon: React.ElementType, color: string, bg: string }> = {
  carbon: { label: 'Carbon', icon: Flame, color: '#E07070', bg: '#FDECEA' },
  sourcing: { label: 'Sourcing', icon: Package, color: '#F0A050', bg: '#FEF3E2' },
  water: { label: 'Water', icon: Droplets, color: '#85C0E0', bg: '#EAF3FB' },
  labor: { label: 'Labor', icon: Users, color: '#A085C3', bg: '#F0EAF8' },
};

// ============================================================
// COMBINED CLAIMS & DOCUMENT VIEW
// ============================================================
function ClaimsAndDocumentView({
    pdfUrl,
    claims,
    verdictFilter,
    categoryFilter,
    selectedClaimId,
    setSelectedClaimId,
    setExpandedClaimId,
    claimRefs,
    setViewMode
}: {
    pdfUrl: string;
    claims: Claim[];
    verdictFilter: VerdictFilter;
    categoryFilter: string;
    selectedClaimId: string | null;
    setSelectedClaimId: (id: string | null) => void;
    setExpandedClaimId: (id: string | null) => void;
    claimRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
    setViewMode: (mode: ViewMode) => void;
}) {
    const visibleClaims = selectedClaimId
      ? claims.filter(c => c.id === selectedClaimId)
      : claims.filter(c => {
          if (verdictFilter !== "all" && getVerdict(c.confidence) !== verdictFilter) return false;
          if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
          return true;
      });

    return (
        <div className="flex w-full h-full" style={{ height: "calc(100vh - 120px)" }}>
            <div className="w-[360px] shrink-0 h-full overflow-y-auto" style={{ borderRight: "1px solid var(--gw-border)", background: "var(--bg-base)", padding: "16px" }}>
                {selectedClaimId && (
                  <button
                    onClick={() => {
                      setSelectedClaimId(null);
                      setExpandedClaimId(null);
                    }}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#85C391',
                      background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 12px 0', fontWeight: 500,
                    }}
                  >
                    ← Back to all claims
                  </button>
                )}

                {visibleClaims.map(claim => {
                    const isSelected = selectedClaimId === claim.id;
                    const verdict = getVerdict(claim.confidence);
                    const scoreColor = getScoreColor(claim.confidence);
                    return (
                        <div
                            key={claim.id}
                            ref={el => { claimRefs.current[claim.id] = el }}
                            onClick={() => {
                                setExpandedClaimId(claim.id);
                                setViewMode("claims");
                            }}
                            style={{
                                background: isSelected ? getScoreBg(claim.confidence) : '#FFFFFF',
                                borderLeft: `3px solid ${scoreColor}`,
                                borderRadius: 10,
                                padding: '14px 16px',
                                cursor: 'pointer',
                                marginBottom: 8,
                                transition: 'background 0.15s ease',
                                border: isSelected ? undefined : '1px solid var(--gw-border)'
                            }}
                        >
                            <p style={{ fontSize: 13, color: '#111', marginBottom: 8 }}>{claim.claim_text}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Badge variant="outline" style={{ background: scoreColor, color: '#fff', fontSize: '10px', padding: '2px 6px', border: 'none' }}>
                                    {getVerdictLabel(verdict).tag}
                                </Badge>
                                <Badge variant="outline" className="capitalize text-[10px]" style={{ padding: '2px 6px' }}>
                                    {claim.category}
                                </Badge>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex-1 h-full overflow-y-auto" style={{ background: '#e4e4e4' }}>
                {pdfUrl ? (
                    <PDFViewer fileUrl={pdfUrl} />
                ) : (
                    <div className="flex items-center justify-center h-full text-sm text-gray-500">
                        PDF not available.
                    </div>
                )}
            </div>
        </div>
    );
}

// ============================================================
// OVERVIEW VIEW
// ============================================================
function OverviewView({ report, claims }: { report: Report; claims: Claim[] }) {
    if (report.overall_score === undefined || report.overall_score === null) {
        return (
            <div className="flex items-center justify-center h-full">
                <p className="text-sm" style={{ color: "var(--text-muted)" }}>
                    Overall report analysis is not available or still processing.
                </p>
            </div>
        );
    }

    const scoreColor = getScoreColor(report.overall_score);
    // const categoryScores = report.category_scores || {};

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
                    <div className="text-7xl font-mono-gw font-bold mb-4" style={{ color: scoreColor }}>
                        {report.overall_score}%
                    </div>
                    <div className="w-full max-w-md mx-auto h-3 rounded-full overflow-hidden" style={{ background: "var(--bg-elevated)" }}>
                        <div
                            className="h-full transition-all duration-1000"
                            style={{ width: `${report.overall_score}%`, background: scoreColor }}
                        />
                    </div>
                    <div className="flex justify-center gap-6 mt-4">
                        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: "var(--score-true)" }} />
                            70-100 Verified
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: "#e6a817" }} />
                            30-70 Mixed
                        </div>
                        <div className="flex items-center gap-1.5 text-[11px]" style={{ color: "var(--text-muted)" }}>
                            <div className="w-2 h-2 rounded-full" style={{ background: "var(--score-false)" }} />
                            0-30 False
                        </div>
                    </div>
                </div>

                <div>
                    <h3 className="text-xl font-display font-bold mb-6 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand-dark)" }} />
                        Category Breakdown
                    </h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        {Object.entries(categoryConfig).map(([key, config]) => {
                            const Icon = config.icon;
                            const categoryClaims = claims.filter(c => c.category === key);
                            const count = categoryClaims.length;
                            
                            // Calculate average score
                            const scores = categoryClaims
                                .map(c => c.confidence)
                                .filter((s): s is number => s !== null && s !== undefined);
                            
                            const avgScore = scores.length > 0
                                ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length * 100)
                                : null;
                            
                            const catScoreColor = avgScore !== null ? getScoreColor(avgScore) : '#CCCCCC';

                            return (
                                <div 
                                    key={key} 
                                    style={{ 
                                        background: "var(--bg-surface)", 
                                        borderRadius: 16, 
                                        padding: '24px',
                                        border: '1px solid var(--gw-border)',
                                        boxShadow: '0 4px 12px rgba(0,0,0,0.02)'
                                    }}
                                >
                                    <div className="flex items-center justify-between mb-4">
                                        <div className="flex items-center gap-2.5">
                                            <div 
                                                className="p-2 rounded-xl" 
                                                style={{ background: config.bg }}
                                            >
                                                <Icon size={18} color={config.color} />
                                            </div>
                                            <span style={{ fontSize: 14, fontWeight: 600, color: "var(--text-primary)" }}>
                                                {config.label}
                                            </span>
                                        </div>
                                        {avgScore !== null && (
                                            <div 
                                                className="text-[10px] font-bold px-2 py-0.5 rounded-full border"
                                                style={{ 
                                                    borderColor: catScoreColor, 
                                                    color: catScoreColor,
                                                    background: `${catScoreColor}10`
                                                }}
                                            >
                                                {getVerdictLabel(getVerdict(avgScore))?.tag}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-baseline gap-1 mb-3">
                                        <span className="text-3xl font-mono-gw font-bold" style={{ color: avgScore !== null ? catScoreColor : "var(--text-muted)" }}>
                                            {avgScore !== null ? avgScore : '--'}
                                        </span>
                                        <span className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>/100</span>
                                    </div>

                                    <div className="w-full h-1.5 rounded-full bg-slate-100 mb-3 overflow-hidden">
                                        <div 
                                            className="h-full transition-all duration-700"
                                            style={{ 
                                                width: avgScore !== null ? `${avgScore}%` : '0%',
                                                background: catScoreColor
                                            }}
                                        />
                                    </div>

                                    <div className="text-[11px] font-medium" style={{ color: "var(--text-muted)" }}>
                                        across {count} {count === 1 ? 'claim' : 'claims'}
                                    </div>
                                </div>
                            )
                        })}
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
// MAIN REPORT PAGE
// ============================================================
export default function ReportPage({ params }: { params: Promise<{ reportId: string }> }) {
    const { reportId } = React.use(params);
    const [report, setReport] = useState<Report | null>(null);
    const [claims, setClaims] = useState<Claim[]>([]);
    const [evidence, setEvidence] = useState<Record<string, Evidence[]>>({});
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    const [viewMode, setViewMode] = useState<ViewMode>("document");
    const [verdictFilter, setVerdictFilter] = useState<VerdictFilter>("all");
    const [categoryFilter, setCategoryFilter] = useState<string>("all");
    const [selectedClaimId, setSelectedClaimId] = useState<string | null>(null);
    const claimRefs = React.useRef<Record<string, HTMLDivElement | null>>({});
    const [expandedClaimId, setExpandedClaimId] = useState<string | null>(null);

    const [copied, setCopied] = useState(false);

    useEffect(() => {
        async function loadReportData() {
            try {
                // Point "demo" to the real H&M report ID
                const activeReportId = reportId === "demo" ? "08362af7-1cf1-4355-aa28-151a2b294e23" : reportId;

                const { supabase } = await import("@/lib/supabase");
                
                const { data: repData, error: repError } = await supabase
                    .from("reports")
                    .select("*")
                    .eq("id", activeReportId)
                    .single();

                if (repError) throw repError;

                const { data: claimsData, error: claimsError } = await supabase
                    .from("claims")
                    .select("*")
                    .eq("report_id", activeReportId)
                    .order("seq_index", { ascending: true });

                if (claimsError) throw claimsError;

                const claimIds = claimsData ? (claimsData as Array<{ id: string }>).map((c) => c.id) : [];
                let evData: Evidence[] = [];
                
                if (claimIds.length > 0) {
                    const { data: evList, error: evError } = await supabase
                        .from("evidence")
                        .select("*")
                        .in("claim_id", claimIds);
                        
                    if (evError) throw evError;
                    evData = evList || [];
                }

                const evsByClaim: Record<string, Evidence[]> = {};
                for (const ev of evData) {
                    if (!evsByClaim[ev.claim_id]) evsByClaim[ev.claim_id] = [];
                    evsByClaim[ev.claim_id].push(ev as Evidence);
                }

                setReport(repData as Report);
                setClaims(claimsData as Claim[]);
                setEvidence(evsByClaim);

            } catch (err: unknown) {
                console.error("Error loading report:", err);
                setError((err as Error).message || "Failed to load report data");
            } finally {
                setLoading(false);
            }
        }
        loadReportData();
    }, [reportId]);

    if (loading) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#FDFDFC]">
                <div className="flex flex-col items-center gap-4">
                    <div className="w-8 h-8 rounded-full border-2 border-(--text-muted) border-t-transparent animate-spin" />
                    <p className="font-mono-gw text-sm text-(--text-muted) tracking-wider">LOADING REPORT DATA</p>
                </div>
            </div>
        );
    }

    if (error || !report) {
        return (
            <div className="flex h-screen items-center justify-center bg-[#FDFDFC]">
                <div className="text-center">
                    <AlertTriangle size={48} className="mx-auto mb-4 text-[#8b0000] opacity-50" />
                    <h2 className="text-xl font-display font-medium text-(--text-primary) mb-2">Error Loading Report</h2>
                    <p className="text-(--text-muted) mb-6">{error || "Report not found"}</p>
                    <Button variant="outline" onClick={() => window.location.href = "/"}>Return to Dashboard</Button>
                </div>
            </div>
        );
    }

    const verdictCounts = {
        supported: claims.filter((c) => getVerdict(c.confidence) === "supported").length,
        unverified: claims.filter((c) => getVerdict(c.confidence) === "unverified").length,
        contradicted: claims.filter((c) => getVerdict(c.confidence) === "contradicted").length,
        mixed: claims.filter((c) => getVerdict(c.confidence) === "mixed").length,
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(window.location.href);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="flex flex-col h-screen overflow-hidden" style={{ background: "var(--bg-base)" }}>
            <header
                className="flex items-center justify-between px-6 py-3 shrink-0"
                style={{ borderBottom: "1px solid var(--gw-border)" }}
            >
                <div className="flex items-center gap-4">
                    <Button
                        variant="ghost" size="sm"
                        onClick={() => window.location.href = "/"}
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
                                background: viewMode === "claims" ? "var(--bg-base)" : "transparent",
                                color: viewMode === "claims" ? "var(--text-primary)" : "var(--text-muted)",
                                boxShadow: viewMode === "claims" ? "var(--gw-shadow)" : "none",
                            }}
                            onClick={() => setViewMode("claims")}
                        >
                            <ListChecks size={12} /> Claims
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
                    </div>

                    <Separator orientation="vertical" className="h-5" />

                    <div className="text-xs font-mono-gw hidden md:block" style={{ color: "var(--text-secondary)" }}>
                        {claims.length} claims · {verdictCounts.supported} ✓ · {verdictCounts.mixed} ⚠ · {verdictCounts.unverified} ~ · {verdictCounts.contradicted} ✗
                    </div>
                    <Button variant="outline" size="sm" onClick={handleCopyLink} className="gap-1.5 text-xs">
                        {copied ? <CheckCircle2 size={12} /> : <Link2 size={12} />}
                        {copied ? "Copied!" : "Share"}
                    </Button>
                </div>
            </header>

            {viewMode !== 'overview' && (
                <div
                    className="flex items-center gap-4 px-6 py-2 shrink-0"
                    style={{ borderBottom: "1px solid var(--gw-border)", background: "var(--bg-surface)" }}
                >
                    <div className="flex items-center gap-1 mr-1">
                        <Filter size={12} style={{ color: "var(--text-muted)" }} />
                    </div>
                    {([{ label: 'All', value: 'all' }, { label: 'Supported', value: 'supported' }, { label: 'Mixed', value: 'mixed' }, { label: 'Contradicted', value: 'contradicted' }, { label: 'Unverified', value: 'unverified' }]).map((filter) => {
                        const isAll = filter.value === "all";
                        const v = filter.value as VerdictFilter;
                        const active = verdictFilter === v;
                        const vColor = isAll ? null : getScoreColor(v === 'mixed' ? 50 : v === 'supported' ? 100 : v === 'contradicted' ? 0 : null);
                        const vBg = isAll ? null : getScoreBg(v === 'mixed' ? 50 : v === 'supported' ? 100 : v === 'contradicted' ? 0 : null);

                        return (
                            <button
                                key={v}
                                onClick={() => setVerdictFilter(v)}
                                className="px-3 py-1.5 rounded-full text-xs font-semibold transition-all hover:opacity-100 opacity-80"
                                style={{
                                    background: (active ? (isAll ? "var(--bg-elevated)" : vBg) : "transparent") || undefined,
                                    color: (active ? (isAll ? "var(--text-primary)" : vColor) : "var(--text-muted)") || undefined,
                                    border: `1px solid ${active ? (isAll ? "var(--gw-border)" : vColor) : "transparent"}`,
                                    opacity: active ? 1 : undefined,
                                }}
                            >
                                {filter.label}
                            </button>
                        );
                    })}

                    <Separator orientation="vertical" className="h-4" />

                    <div className="flex p-1 rounded-lg">
                        <button
                            onClick={() => setCategoryFilter("all")}
                            className="px-3 py-1 rounded text-[11px] font-medium transition-all tracking-wide"
                            style={{
                                background: categoryFilter === "all" ? "var(--bg-surface)" : "transparent",
                                color: categoryFilter === "all" ? "var(--text-primary)" : "var(--text-muted)",
                                border: categoryFilter === "all" ? "1px solid var(--gw-border)" : "1px solid transparent",
                            }}
                        >
                            All Categories
                        </button>
                        {Object.entries(categoryConfig).map(([key, config]) => {
                            const Icon = config.icon;
                            const active = categoryFilter === key;
                            return (
                                <button
                                    key={key}
                                    onClick={() => setCategoryFilter(key)}
                                    style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: 6,
                                        padding: '4px 10px',
                                        borderRadius: 20,
                                        border: '1px solid',
                                        borderColor: active ? config.color : 'transparent',
                                        background: active ? config.bg : 'transparent',
                                        color: active ? config.color : '#555',
                                        fontSize: 12,
                                        fontWeight: 500,
                                        cursor: 'pointer',
                                    }}
                                >
                                    <Icon size={12} />
                                    {config.label}
                                </button>
                            );
                        })}
                    </div>
                </div>
            )}

            <div className="flex-1 overflow-hidden">
                {viewMode === "overview" ? (
                    <OverviewView report={report} claims={claims} />
                ) : viewMode === "claims" ? (
                    <ClaimsView
                        claims={claims}
                        evidence={evidence}
                        verdictFilter={verdictFilter}
                        categoryFilter={categoryFilter}
                        selectedClaimId={selectedClaimId}
                        setSelectedClaimId={setSelectedClaimId}
                        claimRefs={claimRefs}
                    />
                ) : (
                    <ClaimsAndDocumentView
                        pdfUrl={report.pdf_url || ""}
                        claims={claims}
                        verdictFilter={verdictFilter}
                        categoryFilter={categoryFilter}
                        selectedClaimId={selectedClaimId}
                        setSelectedClaimId={setSelectedClaimId}
                        setExpandedClaimId={setExpandedClaimId}
                        claimRefs={claimRefs}
                        setViewMode={setViewMode}
                    />
                )}
            </div>
        </div>
    );
}

// ============================================================
// CLAIMS VIEW
// ============================================================
function ClaimsView({
    claims,
    evidence,
    verdictFilter,
    categoryFilter,
    selectedClaimId,
    setSelectedClaimId,
    claimRefs
}: {
    claims: Claim[];
    evidence: Record<string, Evidence[]>;
    verdictFilter: VerdictFilter;
    categoryFilter: string;
    selectedClaimId: string | null;
    setSelectedClaimId: (id: string | null) => void;
    claimRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
    const visibleClaims = claims.filter(c => {
        if (verdictFilter !== "all" && getVerdict(c.confidence) !== verdictFilter) return false;
        if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
        return true;
    });

    const selectedClaim = claims.find(c => c.id === selectedClaimId) || null;
    const selectedClaimEvidence = selectedClaim ? (evidence[selectedClaim.id] || []) : [];

    return (
        <div className="flex w-full h-full" style={{ height: "calc(100vh - 120px)" }}>
            <div className="w-[360px] shrink-0 h-full overflow-y-auto" style={{ borderRight: "1px solid var(--gw-border)", background: "var(--bg-base)", padding: "16px" }}>
                {visibleClaims.map(claim => {
                    const isSelected = selectedClaimId === claim.id;
                    const verdict = getVerdict(claim.confidence);
                    const scoreColor = getScoreColor(claim.confidence);
                    return (
                        <div
                            key={claim.id}
                            ref={el => { claimRefs.current[claim.id] = el }}
                            onClick={() => setSelectedClaimId(claim.id)}
                            style={{
                                background: isSelected ? getScoreBg(claim.confidence) : '#FFFFFF',
                                borderLeft: `3px solid ${scoreColor}`,
                                borderRadius: 10,
                                padding: '14px 16px',
                                cursor: 'pointer',
                                marginBottom: 8,
                                transition: 'background 0.15s ease',
                                border: isSelected ? undefined : '1px solid var(--gw-border)'
                            }}
                        >
                            <p style={{ fontSize: 13, color: '#111', marginBottom: 8 }} className="line-clamp-3">{claim.claim_text}</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                <Badge variant="outline" style={{ background: scoreColor, color: '#fff', fontSize: '10px', padding: '2px 6px', border: 'none' }}>
                                    {getVerdictLabel(verdict).tag}
                                </Badge>
                                <Badge variant="outline" className="capitalize text-[10px]" style={{ padding: '2px 6px' }}>
                                    {claim.category}
                                </Badge>
                            </div>
                        </div>
                    );
                })}
            </div>

            <div className="flex-1 h-full overflow-y-auto" style={{ background: '#FDFDFC', padding: '40px' }}>
                {!selectedClaim && (
                    <div className="flex items-center justify-center h-full text-sm" style={{ color: "var(--text-muted)" }}>
                        Select a claim from the left to view details.
                    </div>
                )}
                
                {selectedClaim && (
                    <div className="max-w-3xl mx-auto">
                        <div className="mb-8">
                            <h2 className="text-2xl font-display font-medium text-gray-900 leading-relaxed">
                                &quot;{selectedClaim.claim_text}&quot;
                            </h2>
                        </div>
                        
                        {/* Section B — AI Reasoning (MOVED TO TOP) */}
                        <div className="mb-10">
                            <h3 className="text-lg font-display font-bold mb-6 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand-dark)" }} />
                                AI Reasoning
                            </h3>
                            <div style={{ background: '#F7F8F7', borderRadius: '12px', borderLeft: '3px solid #85C391', padding: '32px' }}>
                                <p style={{ fontSize: 15, color: '#333', lineHeight: 1.7 }} className="font-sans">
                                    {selectedClaim.reasoning || "Insufficient data to provide automated reasoning."}
                                </p>
                                
                                <div className="mt-8 pt-6 border-t border-gray-200/60 flex items-center gap-4">
                                    {selectedClaim.confidence !== null ? (
                                        <>
                                            <span className="text-5xl font-mono-gw font-bold tracking-tight" style={{ color: getScoreColor(selectedClaim.confidence) }}>
                                                {Math.round(selectedClaim.confidence <= 1 ? selectedClaim.confidence * 100 : selectedClaim.confidence)}
                                            </span>
                                            <div className="flex flex-col gap-1">
                                                <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Credibility Score</span>
                                                <Badge variant="outline" style={{ background: getScoreColor(selectedClaim.confidence), color: '#fff', fontSize: '11px', padding: '2px 8px', border: 'none', width: 'fit-content' }}>
                                                    {getVerdictLabel(getVerdict(selectedClaim.confidence)).tag}
                                                </Badge>
                                            </div>
                                        </>
                                    ) : (
                                        <span className="text-sm font-semibold uppercase tracking-widest text-gray-500">Unverified / No Score</span>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Section A — Evidence Sources */}
                        <div>
                            <h3 className="text-lg font-display font-bold mb-6 flex items-center gap-2" style={{ color: "var(--text-primary)" }}>
                                <div className="w-2.5 h-2.5 rounded-full" style={{ background: "var(--brand-dark)" }} />
                                Evidence
                            </h3>
                            <div className="space-y-4 mb-10">
                                {selectedClaimEvidence.map((ev, i) => (
                                    <div key={i} style={{
                                        background: '#F9FAFB',
                                        borderRadius: 12,
                                        padding: '24px',
                                        borderLeft: `4px solid ${ev.supports ? '#5A9E67' : '#C05050'}`
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 16 }}>
                                            <strong style={{ color: '#111', fontSize: 15 }}>{ev.source_name}</strong>
                                            <span style={{ color: ev.supports ? '#5A9E67' : '#C05050', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                {ev.supports ? '↑ Supports' : '↓ Contradicts'}
                                            </span>
                                        </div>
                                        <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 14, color: '#444', lineHeight: 1.6 }}>{ev.snippet}</p>
                                        {ev.source_url && (
                                            <a href={ev.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#85C391', display: 'flex', alignItems: 'center', gap: 6, marginTop: 16, fontWeight: 600 }}>
                                                <ExternalLink size={14} /> View source →
                                            </a>
                                        )}
                                    </div>
                                ))}
                                {selectedClaimEvidence.length === 0 && (
                                    <div className="p-6 text-center text-gray-500 bg-gray-50 border border-gray-100 rounded-xl text-sm">
                                        No evidence found for this claim.
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}


