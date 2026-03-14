"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
    CheckCircle2, XCircle, AlertTriangle, MinusCircle, ExternalLink,
    ChevronDown, ChevronUp, Filter, ArrowLeft, Link2, Copy, FileText, ListChecks,
    Flame, Package, Droplets, Users, Sparkles
} from "lucide-react";
import { motion } from "framer-motion";
import React from "react";

import { Worker, Viewer } from '@react-pdf-viewer/core';
import { defaultLayoutPlugin } from '@react-pdf-viewer/default-layout';
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

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

const CATEGORIES = ["carbon", "sourcing", "water", "labor"];

const categoryConfig: Record<string, { label: string, icon: any, color: string, bg: string }> = {
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
    evidence,
    verdictFilter,
    categoryFilter,
    selectedClaimId,
    setSelectedClaimId,
    expandedClaimId,
    setExpandedClaimId,
    claimRefs,
    setViewMode
}: {
    pdfUrl: string;
    claims: Claim[];
    evidence: Record<string, Evidence[]>;
    verdictFilter: VerdictFilter;
    categoryFilter: string;
    selectedClaimId: string | null;
    setSelectedClaimId: (id: string | null) => void;
    expandedClaimId: string | null;
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

    const renderHighlights = (props: any) => {
        const { pageIndex } = props;
        const pageClaims = claims.filter(c => c.page_reference === pageIndex + 1 && c.bbox);
        
        return (
            <>
                {pageClaims.map(claim => {
                    const verdict = getVerdict(claim.confidence);
                    const color = getScoreColor(claim.confidence);
                    const isSelected = selectedClaimId === claim.id;
                    const strokeColor = color; 
                    return (
                        <div
                            key={claim.id}
                            style={{
                                position: 'absolute',
                                left: `${claim.bbox!.x}%`,
                                top: `${claim.bbox!.y}%`,
                                width: `${claim.bbox!.width}%`,
                                height: `${claim.bbox!.height}%`,
                                backgroundColor: isSelected ? 'transparent' : color,
                                border: `1.5px solid ${strokeColor}`,
                                borderRadius: '3px',
                                opacity: isSelected ? 0.7 : 0.35,
                                outline: isSelected ? `2px solid ${strokeColor}` : 'none',
                                cursor: 'pointer',
                                transition: 'opacity 0.15s ease, outline 0.15s ease',
                                zIndex: 10,
                            }}
                            onMouseEnter={e => {
                                if (!isSelected) e.currentTarget.style.opacity = '0.6';
                            }}
                            onMouseLeave={e => {
                                if (!isSelected) e.currentTarget.style.opacity = '0.35';
                            }}
                            onClick={() => {
                                setSelectedClaimId(claim.id);
                                setExpandedClaimId(null);
                                claimRefs.current[claim.id]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                            }}
                        />
                    );
                })}
            </>
        );
    };

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
                    <Worker workerUrl={`https://unpkg.com/pdfjs-dist@3.11.174/build/pdf.worker.min.js`}>
                        <Viewer 
                            fileUrl={pdfUrl} 
                            renderPage={(props) => (
                                <>
                                    {props.canvasLayer.children}
                                    {props.textLayer.children}
                                    {props.annotationLayer.children}
                                    {renderHighlights(props)}
                                </>
                            )}
                        />
                    </Worker>
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
    const categoryScores = report.category_scores || {};

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
                            let count = 0;
                            if (claims) count = claims.filter(c => c.category === key).length;
                            return (
                                <div key={key} style={{ background: config.bg, borderRadius: 10, padding: '14px 16px' }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                        <Icon size={16} color={config.color} />
                                        <span style={{ fontSize: 13, fontWeight: 500, color: config.color }}>{config.label}</span>
                                    </div>
                                    <div style={{ fontSize: 24, fontWeight: 700, color: '#111' }}>{count}</div>
                                    <div style={{ fontSize: 11, color: '#888', marginTop: 2 }}>claims found</div>
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
                if (reportId === "demo") {
                    setReport({
                        id: "demo",
                        company_name: "PetroGreen Energy Corp",
                        report_year: 2024,
                        pdf_url: "https://www.w3.org/WAI/ER/tests/xhtml/testfiles/resources/pdf/dummy.pdf",
                        pdf_text: "Demo report text...",
                        status: "completed",
                        created_at: new Date().toISOString(),
                        overall_score: 34,
                        overall_analysis: "Our analysis indicates significant discrepancies between PetroGreen's sustainability claims and independent verifiable data. Several claims directly contradict official government sources, particularly regarding emissions, safety records, and water use.\n\nThe most severe contradictions were found in the operations safety and emissions categories, where external registries and independent reports tell a fundamentally different story than the company’s corporate communications.\n\nWhile some elements—notably the company's capital investment in CCS (Carbon Capture and Storage) technologies and biodiversity offsets—are verifiable and supported, the overall balance leans heavily toward \"greenwashing,\" as key operating realities are misrepresented.",
                        category_scores: { carbon: 60, sourcing: 85, water: 15, labor: 10 }
                    });
                    setClaims(DEMO_CLAIMS);
                    setEvidence(DEMO_EVIDENCE);
                    return;
                }

                const { supabase } = await import("@/lib/supabase");
                
                const { data: repData, error: repError } = await supabase
                    .from("reports")
                    .select("*")
                    .eq("id", reportId)
                    .single();

                if (repError) throw repError;

                const { data: claimsData, error: claimsError } = await supabase
                    .from("claims")
                    .select("*")
                    .eq("report_id", reportId)
                    .order("seq_index", { ascending: true });

                if (claimsError) throw claimsError;

                const claimIds = claimsData ? claimsData.map((c: any) => c.id) : [];
                let evData: any[] = [];
                
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

            } catch (err: any) {
                console.error("Error loading report:", err);
                setError(err.message || "Failed to load report data");
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
                        expandedClaimId={expandedClaimId}
                        setExpandedClaimId={setExpandedClaimId}
                        claimRefs={claimRefs}
                    />
                ) : (
                    <ClaimsAndDocumentView
                        pdfUrl={report.pdf_url || ""}
                        claims={claims}
                        evidence={evidence}
                        verdictFilter={verdictFilter}
                        categoryFilter={categoryFilter}
                        selectedClaimId={selectedClaimId}
                        setSelectedClaimId={setSelectedClaimId}
                        expandedClaimId={expandedClaimId}
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
    expandedClaimId,
    setExpandedClaimId,
    claimRefs
}: {
    claims: Claim[];
    evidence: Record<string, Evidence[]>;
    verdictFilter: VerdictFilter;
    categoryFilter: string;
    expandedClaimId: string | null;
    setExpandedClaimId: (id: string | null) => void;
    claimRefs: React.MutableRefObject<Record<string, HTMLDivElement | null>>;
}) {
    const visibleClaims = claims.filter(c => {
        if (verdictFilter !== "all" && getVerdict(c.confidence) !== verdictFilter) return false;
        if (categoryFilter !== "all" && c.category !== categoryFilter) return false;
        return true;
    });

    return (
        <div className="w-full h-full overflow-y-auto" style={{ background: "var(--bg-base)" }}>
            <div className="max-w-4xl mx-auto px-6 py-10">
                {visibleClaims.map(claim => {
                    const isExpanded = expandedClaimId === claim.id;
                    const verdict = getVerdict(claim.confidence);
                    const scoreColor = getScoreColor(claim.confidence);
                    const claimEvidence = evidence[claim.id] || [];

                    return (
                        <div
                            key={claim.id}
                            ref={el => { claimRefs.current[claim.id] = el }}
                            onClick={() => {
                                if (isExpanded) {
                                    setExpandedClaimId(null);
                                } else {
                                    setExpandedClaimId(claim.id);
                                }
                            }}
                            style={{
                                background: '#FFFFFF',
                                borderLeft: `6px solid ${scoreColor}`,
                                borderRadius: 16,
                                padding: '24px 32px',
                                cursor: 'pointer',
                                marginBottom: 20,
                                border: '1px solid var(--gw-border)',
                                boxShadow: isExpanded ? '0 12px 40px rgba(0,0,0,0.06)' : '0 4px 12px rgba(0,0,0,0.03)',
                                transition: 'all 0.2s cubic-bezier(0.16, 1, 0.3, 1)'
                            }}
                        >
                            <p style={{ fontSize: 18, color: '#111', marginBottom: 20, fontWeight: 500, lineHeight: 1.5 }}>
                                "{claim.claim_text}"
                            </p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                                <Badge variant="outline" style={{ background: scoreColor, color: '#fff', fontSize: '11px', padding: '4px 10px', border: 'none' }}>
                                    {getVerdictLabel(verdict).tag}
                                </Badge>
                                <Badge variant="outline" className="capitalize text-[11px]" style={{ padding: '4px 10px' }}>
                                    {claim.category}
                                </Badge>
                                {claim.confidence !== null && (
                                    <span style={{ fontSize: 13, color: scoreColor, fontWeight: 700 }}>
                                        Score: {Math.round(claim.confidence <= 1 ? claim.confidence * 100 : claim.confidence)}%
                                    </span>
                                )}
                            </div>

                            {isExpanded && (
                                <motion.div 
                                    initial={{ opacity: 0, height: 0 }} 
                                    animate={{ opacity: 1, height: "auto" }} 
                                    className="overflow-hidden"
                                >
                                    <div style={{ marginTop: 24, borderTop: '1px solid #F0F0F0', paddingTop: 20 }}>
                                        <p style={{ fontSize: 14, color: '#555', marginBottom: 20 }}>
                                            <strong>Entities:</strong> {(claim.entities?.companies as string[] | undefined)?.join(', ') || 'N/A'}
                                        </p>
                                        
                                        <div className="space-y-4">
                                            {claimEvidence.map((ev, i) => (
                                                <div key={i} style={{
                                                    background: '#F9FAFB',
                                                    borderRadius: 12,
                                                    padding: '20px 24px',
                                                    borderLeft: `4px solid ${ev.supports ? '#5A9E67' : '#C05050'}`
                                                }}>
                                                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                                                        <strong style={{ color: '#111', fontSize: 14 }}>{ev.source_name}</strong>
                                                        <span style={{ color: ev.supports ? '#5A9E67' : '#C05050', fontWeight: 700, fontSize: 12, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                                                            {ev.supports ? '↑ Supports' : '↓ Contradicts'}
                                                        </span>
                                                    </div>
                                                    <p style={{ fontFamily: 'var(--font-dm-mono)', fontSize: 13, color: '#444', lineHeight: 1.6 }}>{ev.snippet}</p>
                                                    {ev.source_url && (
                                                        <a href={ev.source_url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: '#85C391', display: 'flex', alignItems: 'center', gap: 6, marginTop: 14, fontWeight: 600 }}>
                                                            <ExternalLink size={14} /> View original source
                                                        </a>
                                                    )}
                                                </div>
                                            ))}
                                            {claimEvidence.length === 0 && (
                                                <div className="p-4 text-center text-gray-500 bg-gray-50 rounded-lg text-sm">
                                                    No direct evidence found for this specific claim.
                                                </div>
                                            )}
                                        </div>
                                        <div style={{ marginTop: 24, background: 'linear-gradient(to right, #F5F7F9, #FFFFFF)', padding: '20px 24px', borderRadius: 12, border: '1px solid #E5E7EB' }}>
                                            <h4 style={{ fontSize: 13, color: '#333', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 800, marginBottom: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                                                <Sparkles size={14} style={{ color: "var(--brand-dark)" }} /> 
                                                AI Reasoning
                                            </h4>
                                            <p style={{ fontSize: 14, color: '#555', lineHeight: 1.7 }}>{claim.reasoning || "Insufficient data to provide automated reasoning."}</p>
                                        </div>
                                    </div>
                                </motion.div>
                            )}
                        </div>
                    );
                })}
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
        confidence: 0.08,
        reasoning: "Environment Canada's National Pollutant Release Inventory shows PetroGreen Energy Corp's facilities in Alberta reported increased total emissions of 2.4 million tonnes CO2e in 2023, up from 2.1 million tonnes in 2019 — an increase of approximately 14%.",
        seq_index: 0,
        page_reference: 1,
        bbox: { x: 10, y: 15, width: 80, height: 5 }
    },
    {
        id: "demo-2",
        report_id: "demo",
        claim_text: "100% of electricity consumed at our corporate offices comes from renewable energy certificates.",
        category: "carbon",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["100% renewable electricity"], regions: ["Corporate offices"] },
        verdict: "supported",
        confidence: 0.88,
        reasoning: "Renewable Energy Certificate (REC) purchases are documented in PetroGreen's CDP submission.",
        seq_index: 1,
        page_reference: 1,
        bbox: { x: 10, y: 25, width: 80, height: 5 }
    },
    {
        id: "demo-3",
        report_id: "demo",
        claim_text: "Our supply chain audit program covers 95% of tier-1 suppliers for environmental compliance.",
        category: "sourcing",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["95% tier-1 supplier coverage"] },
        verdict: "unverified",
        confidence: null,
        reasoning: "No independent verification of supplier audit coverage was found.",
        seq_index: 2,
        page_reference: 2,
        bbox: { x: 10, y: 35, width: 80, height: 5 }
    },
    {
        id: "demo-4",
        report_id: "demo",
        claim_text: "We achieved zero fatalities and a 40% reduction in recordable incidents across all operations in 2024.",
        category: "labor",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["Zero fatalities", "40% incident reduction"], time_period: "2024" },
        verdict: "contradicted",
        confidence: 0.1,
        reasoning: "Media reports from CBC News in August 2024 documented a fatal incident at PetroGreen's Fort McMurray facility. Alberta OHS records show two workplace fatalities in 2024.",
        seq_index: 3,
        page_reference: 2,
        bbox: { x: 10, y: 45, width: 80, height: 5 }
    },
    {
        id: "demo-5",
        report_id: "demo",
        claim_text: "PetroGreen invested $500 million in carbon capture and storage technology in 2024.",
        category: "carbon",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["$500M CCS investment"], time_period: "2024" },
        verdict: "supported",
        confidence: 0.85,
        reasoning: "PetroGreen's 2024 annual financial filing confirms a $480M capital expenditure allocation to CCS projects.",
        seq_index: 4,
        page_reference: 3,
        bbox: { x: 10, y: 55, width: 80, height: 5 }
    },
    {
        id: "demo-6",
        report_id: "demo",
        claim_text: "Our water recycling program recovers 90% of water used in extraction processes.",
        category: "water",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["90% water recycling rate"], regions: ["Extraction operations"] },
        verdict: "contradicted",
        confidence: 0.12,
        reasoning: "Alberta Energy Regulator data shows PetroGreen's water recycling rates average approximately 65%.",
        seq_index: 5,
        page_reference: 3,
        bbox: { x: 10, y: 65, width: 80, height: 5 }
    },
    {
        id: "demo-7",
        report_id: "demo",
        claim_text: "We have committed to achieving net-zero Scope 1 and 2 emissions by 2040.",
        category: "labor",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["Net-zero by 2040"] },
        verdict: "unverified",
        confidence: null,
        reasoning: "This is a forward-looking commitment rather than a verifiable current claim.",
        seq_index: 6,
        page_reference: 4,
        bbox: { x: 10, y: 75, width: 80, height: 5 }
    },
    {
        id: "demo-8",
        report_id: "demo",
        claim_text: "PetroGreen's biodiversity offset program has protected over 15,000 hectares of boreal forest in Northern Alberta.",
        category: "sourcing",
        entities: { companies: ["PetroGreen Energy Corp"], metrics: ["15,000 hectares protected"], regions: ["Northern Alberta"] },
        verdict: "supported",
        confidence: 0.92,
        reasoning: "Alberta Biodiversity Monitoring Institute records confirm conservation agreements covering approximately 14,800 hectares.",
        seq_index: 7,
        page_reference: 4,
        bbox: { x: 10, y: 85, width: 80, height: 5 }
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
