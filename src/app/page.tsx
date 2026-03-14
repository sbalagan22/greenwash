"use client";

import React, { useCallback, useState, useEffect, useRef } from "react";
import { useDropzone } from "react-dropzone";
import { useRouter } from "next/navigation";
import Image from "next/image";
import { motion, AnimatePresence } from "framer-motion";
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
  Sparkles,
  Zap,
  Eye,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Fonts that "fine print." cycles through before settling
const CYCLING_FONTS = [
  "'Courier New', monospace",
  "'Georgia', serif",
  "'Comic Sans MS', cursive",
  "'Impact', sans-serif",
  "'Palatino Linotype', serif",
  "'Trebuchet MS', sans-serif",
];

const fadeInUp = {
  hidden: { opacity: 0, y: 30 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.15, duration: 0.6 },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.12, delayChildren: 0.3 },
  },
};

export default function HomePage() {
  const router = useRouter();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Font cycling animation state
  const [currentFontIdx, setCurrentFontIdx] = useState(0);
  const [settled, setSettled] = useState(false);
  const [showUnderline, setShowUnderline] = useState(false);
  const cycleInterval = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    let elapsed = 0;
    const CYCLE_SPEED = 300; // ms between font changes
    const TOTAL_DURATION = 2000; // 2 seconds of cycling

    cycleInterval.current = setInterval(() => {
      elapsed += CYCLE_SPEED;
      if (elapsed >= TOTAL_DURATION) {
        setSettled(true);
        if (cycleInterval.current) clearInterval(cycleInterval.current);
        // Show underline after settling
        setTimeout(() => setShowUnderline(true), 400);
      } else {
        setCurrentFontIdx((prev) => (prev + 1) % CYCLING_FONTS.length);
      }
    }, CYCLE_SPEED);

    return () => {
      if (cycleInterval.current) clearInterval(cycleInterval.current);
    };
  }, []);

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
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="flex items-center justify-between px-8 py-5 max-w-6xl mx-auto"
      >
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
        <div className="flex items-center gap-6">
          <a
            href="#how-it-works"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
          >
            How it works
          </a>
          <a
            href="#try-it"
            className="text-sm font-medium transition-colors hover:opacity-80"
            style={{ color: "var(--text-secondary)" }}
          >
            Try it
          </a>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <main className="max-w-5xl mx-auto px-8 pt-20 pb-28">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="text-center mb-20"
        >
          <motion.h1
            variants={fadeInUp}
            custom={0}
            className="font-display text-5xl md:text-7xl font-extrabold tracking-tight mb-6"
            style={{ color: "var(--text-primary)" }}
          >
            We read the{" "}
            <span className="relative inline-block">
              <span
                style={{
                  fontFamily: settled
                    ? "var(--font-syne), sans-serif"
                    : CYCLING_FONTS[currentFontIdx],
                  transition: settled ? "font-family 0.3s ease" : "none",
                  color: "var(--text-primary)",
                }}
              >
                fine print.
              </span>
              {/* Green underline that appears after settling */}
              <span
                className="absolute left-0 bottom-0 h-[4px] rounded-full"
                style={{
                  background: "var(--brand)",
                  width: showUnderline ? "100%" : "0%",
                  transition: "width 0.6s cubic-bezier(0.22, 1, 0.36, 1)",
                  bottom: "-4px",
                }}
              />
            </span>
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            custom={1}
            className="text-lg md:text-xl max-w-2xl mx-auto leading-relaxed mb-10"
            style={{ color: "var(--text-secondary)" }}
          >
            AI-powered audit of corporate sustainability claims. Every claim
            extracted, every source cross-referenced, every verdict cited.
          </motion.p>

          {/* CTA Badges */}
          <motion.div
            variants={fadeInUp}
            custom={2}
            className="flex items-center justify-center gap-4 mb-12 flex-wrap"
          >
            {[
              { icon: <Zap size={14} />, text: "Under 60s analysis" },
              { icon: <Eye size={14} />, text: "Real evidence, not AI fiction" },
              { icon: <Sparkles size={14} />, text: "Powered by GPT-5" },
            ].map((badge, i) => (
              <span
                key={i}
                className="flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold"
                style={{
                  background: "var(--brand-subtle)",
                  color: "var(--brand-dark)",
                  border: "1px solid var(--brand)",
                }}
              >
                {badge.icon}
                {badge.text}
              </span>
            ))}
          </motion.div>
        </motion.div>

        {/* Upload Zone */}
        <motion.div
          id="try-it"
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.6, duration: 0.7 }}
          className="max-w-xl mx-auto mb-8"
        >
          <div
            {...getRootProps()}
            className={`upload-zone cursor-pointer p-12 text-center transition-all ${isDragActive ? "active" : ""
              } ${uploading ? "opacity-60 pointer-events-none" : ""}`}
          >
            <input {...getInputProps()} />
            <div className="flex flex-col items-center gap-4">
              {uploading ? (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "var(--brand-subtle)" }}
                  >
                    <FileText
                      size={24}
                      style={{ color: "var(--brand-dark)" }}
                    />
                  </motion.div>
                  <p
                    className="font-medium"
                    style={{ color: "var(--text-primary)" }}
                  >
                    Uploading...
                  </p>
                </>
              ) : (
                <>
                  <motion.div
                    whileHover={{ scale: 1.05 }}
                    className="w-12 h-12 rounded-full flex items-center justify-center"
                    style={{ background: "var(--brand-subtle)" }}
                  >
                    <Upload
                      size={24}
                      style={{ color: "var(--brand-dark)" }}
                    />
                  </motion.div>
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
            <motion.p
              initial={{ opacity: 0, y: -5 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-sm mt-3 text-center"
              style={{ color: "var(--score-false)" }}
            >
              {error}
            </motion.p>
          )}

          <div className="text-center mt-6">
            <Button
              onClick={() => router.push("/report/demo")}
              variant="ghost"
              className="text-sm font-medium gap-1.5 hover:scale-[1.02] transition-transform"
              style={{ color: "var(--brand-dark)" }}
            >
              Try a demo report
              <ArrowRight size={14} />
            </Button>
          </div>
        </motion.div>

        {/* How It Works */}
        <motion.section
          id="how-it-works"
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true, margin: "-100px" }}
          variants={staggerContainer}
          className="mt-36 mb-20"
        >
          <motion.h2
            variants={fadeInUp}
            custom={0}
            className="font-display text-3xl font-bold text-center mb-4"
            style={{ color: "var(--text-primary)" }}
          >
            How it works
          </motion.h2>
          <motion.p
            variants={fadeInUp}
            custom={1}
            className="text-center text-sm mb-14 max-w-lg mx-auto"
            style={{ color: "var(--text-muted)" }}
          >
            Three steps. No sign-up required. Your report stays private.
          </motion.p>
          <div className="grid md:grid-cols-3 gap-6">
            {[
              {
                icon: <Search size={22} />,
                title: "Extract Claims",
                desc: "AI reads your report and identifies every explicit sustainability claim — emissions, targets, and commitments.",
                step: "01",
              },
              {
                icon: <Shield size={22} />,
                title: "Cross-Reference",
                desc: "Each claim is verified against real news articles, regulatory filings, and government databases via Tavily.",
                step: "02",
              },
              {
                icon: <BarChart3 size={22} />,
                title: "Grade & Report",
                desc: "Every claim gets a credibility score with cited evidence, AI reasoning, and an overall greenwash rating.",
                step: "03",
              },
            ].map((step, i) => (
              <motion.div
                key={i}
                variants={fadeInUp}
                custom={i + 2}
                whileHover={{ y: -4, boxShadow: "0 12px 40px rgba(0,0,0,0.06)" }}
                className="p-7 rounded-2xl text-center transition-all cursor-default"
                style={{
                  background: "var(--bg-surface)",
                  border: "1px solid var(--gw-border)",
                }}
              >
                <div className="flex items-center justify-center gap-3 mb-4">
                  <span
                    className="text-xs font-mono-gw font-bold px-2 py-0.5 rounded-full"
                    style={{ background: "var(--brand-subtle)", color: "var(--brand-dark)" }}
                  >
                    {step.step}
                  </span>
                </div>
                <div
                  className="w-11 h-11 rounded-xl flex items-center justify-center mx-auto mb-4"
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
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Preview Card */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7 }}
          className="max-w-2xl mx-auto"
        >
          <p
            className="text-center text-xs font-mono-gw font-bold uppercase tracking-widest mb-4"
            style={{ color: "var(--text-muted)" }}
          >
            Example Analysis
          </p>
          <div
            className="rounded-2xl overflow-hidden transition-shadow hover:shadow-lg"
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
                <motion.div
                  key={i}
                  initial={{ opacity: 0, x: -10 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  viewport={{ once: true }}
                  transition={{ delay: i * 0.1 + 0.3 }}
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
                </motion.div>
              ))}
            </div>
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <motion.footer
        initial={{ opacity: 0 }}
        whileInView={{ opacity: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="py-10 px-8 text-center text-xs"
        style={{
          color: "var(--text-muted)",
          borderTop: "1px solid var(--gw-border)",
        }}
      >
        Built for GenAI Genesis Hackathon · GreenWash © 2026
      </motion.footer>
    </div>
  );
}
