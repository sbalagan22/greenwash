"use client";

import React, { useCallback, useState } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import Image from "next/image";
import {
  Upload,
  FileText,
  ArrowRight,
  Shield,
  Search,
  BarChart3,
  CheckCircle2,
  XCircle,
  AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

export default function HomePage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(
    async (acceptedFiles: File[]) => {
      const file = acceptedFiles[0];
      if (!file) return;

      if (file.size > MAX_FILE_SIZE) {
        setError("File size exceeds 50MB limit.");
        return;
      }

      if (file.type !== "application/pdf") {
        setError("Please upload a PDF file.");
        return;
      }

      setError(null);
      setUploading(true);

      try {
        const formData = new FormData();
        formData.append("file", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        if (!res.ok) {
          const data = await res.json();
          throw new Error(data.error || "Upload failed");
        }

        const { reportId, jobId } = await res.json();
        router.push(`/processing/${jobId}?reportId=${reportId}`);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Upload failed");
        setUploading(false);
      }
    },
    [router]
  );

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { "application/pdf": [".pdf"] },
    maxFiles: 1,
    disabled: uploading,
  });

  return (
    <div className="min-h-screen" style={{ background: "var(--bg-base)" }}>
      {/* Navigation */}
      <nav className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto">
        <div className="flex items-center gap-2">
          <Image
            src="/icon.png"
            alt="GreenWash"
            width={28}
            height={28}
          />
          <span
            className="font-display text-xl font-bold"
            style={{ color: "var(--text-primary)" }}
          >
            greenwash
          </span>
        </div>
        <a
          href="#how-it-works"
          className="text-sm font-medium"
          style={{ color: "var(--text-secondary)" }}
        >
          How it works
        </a>
      </nav>

      {/* Hero Section */}
      <main className="max-w-4xl mx-auto px-8 pt-16 pb-24">
        <div className="text-center mb-16">
          <h1
            className="font-display text-5xl md:text-6xl font-extrabold tracking-tight mb-5"
            style={{ color: "var(--text-primary)" }}
          >
            We read the fine print.
          </h1>
          <p
            className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed"
            style={{ color: "var(--text-secondary)" }}
          >
            AI-powered audit of corporate sustainability claims. Every claim
            extracted, every source cross-referenced, every verdict cited.
          </p>
        </div>

        {/* Upload Zone */}
        <div className="max-w-xl mx-auto mb-8">
          <div
            {...getRootProps()}
            className={`upload-zone cursor-pointer p-12 text-center transition-all ${isDragActive ? "active" : ""
              } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              {uploading ? (
                <>
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center animate-gentle-pulse"
                    style={{ background: "var(--brand-subtle)" }}
                  >
                    <FileText
                      size={24}
                      style={{ color: "var(--brand-dark)" }}
                    />
                  </div>
                  <p
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Uploading...
                  </p>
                </>
              ) : (
                <>
                  <div
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "var(--brand-subtle)" }}
                  >
                    <Upload
                      size={24}
                      style={{ color: "var(--brand-dark)" }}
                    />
                  </div>
                  <div>
                    <p
                      className="font-medium mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {isDragActive
                        ? "Drop your PDF here"
                        : "Drag & drop a sustainability report"}
                    </p>
                    <p
                      className="text-sm"
                      style={{ color: "var(--text-muted)" }}
                    >
                      PDF up to 50MB · ESG, CSR, or sustainability report
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {error && (
            <p className="text-sm mt-3 text-center" style={{ color: "var(--score-false)" }}>
              {error}
            </p>
          )}

          <div className="text-center mt-6">
            <Button
              onClick={() => router.push("/report/demo")}
              variant="ghost"
              className="text-sm font-medium gap-1.5"
              style={{ color: "var(--brand-dark)" }}
            >
              Try a demo report
              <ArrowRight size={14} />
            </Button>
          </div>
        </div>

        {/* How It Works */}
        <section id="how-it-works" className="mt-32 mb-16">
          <h2
            className="font-display text-2xl font-bold text-center mb-12"
            style={{ color: "var(--text-primary)" }}
          >
            How it works
          </h2>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: <Search size={22} />,
                title: "Extract Claims",
                desc: "GPT-4o reads your report and identifies every explicit sustainability claim.",
              },
              {
                icon: <Shield size={22} />,
                title: "Cross-Reference",
                desc: "Each claim is checked against news articles and government pollution registries.",
              },
              {
                icon: <BarChart3 size={22} />,
                title: "Grade & Report",
                desc: "Every claim gets a credibility score with cited evidence and AI reasoning.",
              },
            ].map((step, i) => (
              <div
                key={i}
                className="p-6 rounded-xl text-center"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--gw-border)",
                }}
              >
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mx-auto mb-4"
                  style={{
                    background: "var(--brand-subtle)",
                    color: "var(--brand-dark)",
                  }}
                >
                  {step.icon}
                </div>
                <h3
                  className="font-display font-bold text-base mb-2"
                  style={{ color: "var(--text-primary)" }}
                >
                  {step.title}
                </h3>
                <p className="text-sm leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                  {step.desc}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* Preview Card */}
        <section className="max-w-2xl mx-auto">
          <div
            className="rounded-xl overflow-hidden"
            style={{
              background: "var(--bg-surface)",
              border: "1px solid var(--gw-border)",
            }}
          >
            <div
              className="px-6 py-4 flex items-center justify-between"
              style={{ borderBottom: "1px solid var(--gw-border)" }}
            >
              <div>
                <p
                  className="font-display font-bold text-sm"
                  style={{ color: "var(--text-primary)" }}
                >
                  Acme Corp — 2024 ESG Report
                </p>
                <p
                  className="text-xs font-mono-gw"
                  style={{ color: "var(--text-muted)" }}
                >
                  Sample analysis
                </p>
              </div>
              <div
                className="text-xs font-mono-gw"
                style={{ color: "var(--text-secondary)" }}
              >
                47 claims · 18 ✓ · 21 ~ · 8 ✗
              </div>
            </div>
            <div className="px-6 py-4 space-y-3">
              {[
                {
                  text: "\"Reduced Scope 1 emissions by 30% since 2019\"",
                  verdict: "contradicted",
                  score: 22,
                  icon: <XCircle size={14} />,
                  color: "var(--score-false)",
                  bg: "var(--score-false-bg)",
                },
                {
                  text: "\"100% of electricity from renewable sources\"",
                  verdict: "supported",
                  score: 84,
                  icon: <CheckCircle2 size={14} />,
                  color: "var(--score-true)",
                  bg: "var(--score-true-bg)",
                },
                {
                  text: "\"Zero waste-to-landfill across all facilities\"",
                  verdict: "unverified",
                  score: null,
                  icon: <AlertTriangle size={14} />,
                  color: "var(--score-unknown)",
                  bg: "var(--score-unknown-bg)",
                },
              ].map((claim, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between py-2"
                >
                  <div className="flex-1 min-w-0 mr-4">
                    <p
                      className="text-sm font-mono-gw truncate"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {claim.text}
                    </p>
                    <div className="credibility-meter mt-2 w-48">
                      <div
                        className="credibility-meter-fill"
                        style={{
                          width: claim.score !== null ? `${claim.score}%` : "0%",
                          background: claim.color,
                        }}
                      />
                    </div>
                  </div>
                  <span
                    className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full whitespace-nowrap"
                    style={{
                      background: claim.bg,
                      color: claim.color,
                    }}
                  >
                    {claim.icon}
                    {claim.verdict === "contradicted"
                      ? `✗ ${claim.score}/100`
                      : claim.verdict === "supported"
                        ? `✓ ${claim.score}/100`
                        : "— Unverified"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer
        className="py-8 px-8 text-center text-xs"
        style={{
          color: "var(--text-muted)",
          borderTop: "1px solid var(--gw-border)",
        }}
      >
        Built for GenAI Genesis Hackathon · GreenWash © 2026
      </footer>
    </div>
  );
}
