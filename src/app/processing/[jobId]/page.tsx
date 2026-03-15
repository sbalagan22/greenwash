"use client";

import React, { useEffect, useState } from "react";
import { useParams, useSearchParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import Image from "next/image";
import {
    CheckCircle2,
    Circle,
    Loader2,
    AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { SvgLoader } from "@/components/ui/svg-loader";

interface Job {
    id: string;
    report_id: string;
    step: string;
    progress: number;
    error: string | null;
}

const STEPS = [
    { key: "queued", label: "Preparing analysis" },
    { key: "extracting", label: "Extracting claims from PDF" },
    { key: "disambiguating", label: "Identifying entities" },
    { key: "verifying", label: "Cross-referencing evidence" },
    { key: "scoring", label: "Scoring claim credibility" },
    { key: "analyzing", label: "Generating overall report" },
    { key: "complete", label: "Analysis complete" },
];

function getStepIndex(step: string): number {
    const idx = STEPS.findIndex((s) => s.key === step);
    return idx >= 0 ? idx : 0;
}

export default function ProcessingPage() {
    const params = useParams();
    const searchParams = useSearchParams();
    const router = useRouter();
    const jobId = params.jobId as string;
    const reportId = searchParams.get("reportId");

    const [job, setJob] = useState<Job | null>(null);
    const [claimCount, setClaimCount] = useState(0);
    const [failed, setFailed] = useState(false);
    const [startTime] = useState(() => Date.now());
    const [elapsedMs, setElapsedMs] = useState(0);

    useEffect(() => {
        if (failed || job?.step === "complete") return;
        const interval = setInterval(() => {
            setElapsedMs(Date.now() - startTime);
        }, 100);
        return () => clearInterval(interval);
    }, [failed, job?.step, startTime]);

    const formatTime = (ms: number) => {
        const totalSeconds = Math.floor(ms / 1000);
        const mins = Math.floor(totalSeconds / 60);
        const secs = totalSeconds % 60;
        return `${mins}:${secs.toString().padStart(2, "0")}`;
    };

    useEffect(() => {
        if (!jobId) return;

        // Poll job status
        const interval = setInterval(async () => {
            const { data, error } = await supabase
                .from("jobs")
                .select("*")
                .eq("id", jobId)
                .single();

            if (error || !data) return;

            setJob(data);

            if (data.step === "complete" && reportId) {
                clearInterval(interval);
                setTimeout(() => {
                    router.push(`/report/${reportId}`);
                }, 1500);
            }

            if (data.step === "failed" || data.error) {
                setFailed(true);
                clearInterval(interval);
            }

            // Get claim count
            if (data.report_id) {
                const { count } = await supabase
                    .from("claims")
                    .select("*", { count: "exact", head: true })
                    .eq("report_id", data.report_id);
                if (count !== null) setClaimCount(count);
            }

            // Stuck detector: If still 'queued' after 5 seconds, force trigger the pipeline
            if (data.step === "queued" && Date.now() - startTime > 5000) {
                console.log("[Process] Analysis seems stuck in queued, retrying trigger...");
                fetch("/api/pipeline/run", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        reportId: data.report_id,
                        jobId: data.id,
                        pdfUrl: data.pdf_url // Ensure pdf_url is passed if available
                    }),
                }).catch(e => console.error("Retry trigger failed:", e));
            }
        }, 2000);

        return () => clearInterval(interval);
    }, [jobId, reportId, router]);

    const currentStepIndex = job ? getStepIndex(job.step) : 0;
    const progressPercent = job?.progress || Math.min(currentStepIndex * 20, 95);

    return (
        <div
            className="min-h-screen flex flex-col items-center justify-center px-8"
            style={{ background: "var(--bg-base)" }}
        >
            {/* Top progress bar */}
            <div
                className="fixed top-0 left-0 right-0 h-[3px]"
                style={{ background: "var(--bg-elevated)" }}
            >
                <div
                    className="h-full transition-all duration-700 ease-out"
                    style={{
                        width: `${progressPercent}%`,
                        background: failed ? "var(--score-false)" : "var(--brand)",
                    }}
                />
            </div>

            <div className="max-w-md w-full text-center">
                {/* Custom SVG Loader */}
                <SvgLoader />

                {/* Heading */}
                <h1
                    className="font-display text-2xl font-bold mb-2 flex items-center justify-center gap-3"
                    style={{ color: "var(--text-primary)" }}
                >
                    {failed ? "Analysis Failed" : "Analyzing report..."}
                    {!failed && (
                        <span className="font-mono-gw text-lg opacity-60">
                            {formatTime(elapsedMs)}
                        </span>
                    )}
                </h1>
                <p className="text-sm mb-10" style={{ color: "var(--text-secondary)" }}>
                    {failed
                        ? "Something went wrong during analysis."
                        : "This usually takes 30–90 seconds"}
                </p>

                {/* Step indicator */}
                <div className="text-left space-y-4 mb-10">
                    {STEPS.map((step, i) => {
                        const isComplete = currentStepIndex > i;
                        const isActive = currentStepIndex === i && !failed;
                        const isPending = currentStepIndex < i;

                        return (
                            <div key={step.key} className="flex items-center gap-3">
                                {isComplete ? (
                                    <CheckCircle2
                                        size={18}
                                        style={{ color: "var(--brand)" }}
                                    />
                                ) : isActive ? (
                                    <Loader2
                                        size={18}
                                        className="animate-spin"
                                        style={{ color: "var(--brand)" }}
                                    />
                                ) : failed && currentStepIndex === i ? (
                                    <AlertCircle
                                        size={18}
                                        style={{ color: "var(--score-false)" }}
                                    />
                                ) : (
                                    <Circle
                                        size={18}
                                        style={{ color: "var(--text-muted)" }}
                                    />
                                )}
                                <span
                                    className="text-sm font-medium"
                                    style={{
                                        color: isComplete
                                            ? "var(--text-primary)"
                                            : isActive
                                                ? "var(--text-primary)"
                                                : isPending
                                                    ? "var(--text-muted)"
                                                    : "var(--score-false)",
                                    }}
                                >
                                    {step.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {/* Claim count */}
                {claimCount > 0 && !failed && (
                    <p
                        className="text-sm font-mono-gw mb-8"
                        style={{ color: "var(--text-secondary)" }}
                    >
                        {claimCount} claim{claimCount !== 1 ? "s" : ""} found so far...
                    </p>
                )}

                {/* Error actions */}
                {failed && (
                    <div className="flex gap-3 justify-center">
                        <Button
                            onClick={() => router.push("/")}
                            variant="outline"
                            className="text-sm"
                        >
                            Go back
                        </Button>
                        <Button
                            onClick={() => window.location.reload()}
                            className="text-sm"
                            style={{
                                background: "var(--brand)",
                                color: "var(--text-primary)",
                            }}
                        >
                            Try again
                        </Button>
                    </div>
                )}
            </div>
        </div>
    );
}
