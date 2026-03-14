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
  ChevronRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const MAX_FILE_SIZE = 50 * 1024 * 1024; // 50MB

// Fonts to cycle through before settling on Syne
const CYCLING_FONTS = [
  "'Caveat', cursive",
  "'Bebas Neue', sans-serif",
  "'Space Mono', monospace",
  "'Playfair Display', serif",
  "'Libre Baskerville', serif",
  "var(--font-syne, 'Syne', sans-serif)"
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

function FAQItem({ question, answer }: { question: string, answer: string }) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <motion.div 
      className="rounded-2xl border border-white bg-white/40 backdrop-blur-xl overflow-hidden shadow-sm transition-all hover:shadow-md"
      style={{ borderColor: "var(--gw-border)" }}
    >
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-8 py-6 flex items-center justify-between text-left transition-colors hover:bg-white/40"
      >
        <span className="font-display font-extrabold text-lg" style={{ color: "var(--text-primary)" }}>
          {question}
        </span>
        <motion.span
          animate={{ rotate: isOpen ? 45 : 0 }}
          transition={{ duration: 0.2 }}
          style={{ color: "var(--brand-dark)" }}
        >
          <Sparkles size={20} />
        </motion.span>
      </button>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: "easeInOut" }}
          >
            <div className="px-8 pb-6 pt-0">
              <p className="text-base leading-relaxed font-medium" style={{ color: "var(--text-secondary)" }}>
                {answer}
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

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
    let count = 0;
    const TOTAL_CYCLES = CYCLING_FONTS.length - 1;
    const CYCLE_SPEED = 300; // ms between font changes

    cycleInterval.current = setInterval(() => {
      count++;
      if (count >= TOTAL_CYCLES) {
        setSettled(true);
        setCurrentFontIdx(TOTAL_CYCLES);
        if (cycleInterval.current) clearInterval(cycleInterval.current);
        // Show underline after settling
        setTimeout(() => setShowUnderline(true), 400);
      } else {
        setCurrentFontIdx(count);
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
    <div className="min-h-screen relative overflow-hidden" style={{ background: "var(--bg-base)" }}>
      {/* Premium Background Gradients */}
      

      {/* Navigation */}
      <motion.nav
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 flex items-center justify-between px-8 py-6 max-w-7xl mx-auto"
      >
        <div className="flex items-center gap-2">
          <Image
            src="/greenwash_icon.png"
            alt="greenwash"
            width={32}
            height={32}
            className="drop-shadow-sm"
          />
          <span
            className="font-display text-2xl font-bold tracking-tight"
            style={{ color: "var(--text-primary)" }}
          >
            greenwash
          </span>
        </div>
        <div className="flex items-center gap-6">
          <button
            onClick={() => window.scrollTo({ top: 280, behavior: "smooth" })}
            className="text-sm font-semibold py-2 px-4 rounded-full border shadow-sm transition-all hover:shadow-md hover:-translate-y-0.5 cursor-pointer"
            style={{ color: "var(--text-primary)", borderColor: "var(--gw-border)", background: "white" }}
          >
            Try it
          </button>
          <button
            onClick={() => window.scrollTo({ top: 1015, behavior: "smooth" })}
            className="text-sm font-semibold transition-colors hover:opacity-75 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            How it works
          </button>
          <button
            onClick={() => window.scrollTo({ top: 1842, behavior: "smooth" })}
            className="text-sm font-semibold transition-colors hover:opacity-75 cursor-pointer"
            style={{ color: "var(--text-secondary)" }}
          >
            FAQ
          </button>
        </div>
      </motion.nav>

      {/* Hero Section */}
      <main className="relative z-10 max-w-6xl mx-auto px-8 pt-20 pb-32">
        <motion.div
          initial="hidden"
          animate="visible"
          variants={staggerContainer}
          className="text-center mb-20"
        >
          <motion.div variants={fadeInUp} custom={0} className="mb-8 flex justify-center">
            {/* Removed GenAI Genesis Hackathon badge */}
          </motion.div>
          <motion.h1
            variants={fadeInUp}
            custom={1}
            className="font-display text-5xl md:text-7xl lg:text-[80px] font-black tracking-tighter mb-8 leading-[1.1]"
            style={{ color: "var(--text-primary)" }}
          >
            We read the <br className="hidden md:block" />
            <span className="relative inline-block text-(--brand-dark) min-w-[320px] text-center md:text-left">
              <span
                className="inline-block"
                style={{ 
                  color: "#111111",
                  fontFamily: CYCLING_FONTS[currentFontIdx],
                  transition: "font-family 0.1s ease"
                }}
              >
                fine print.
              </span>
              {/* Animated underline that appears after settling */}
              <span
                className="absolute left-0 bottom-1 md:bottom-2 h-[6px] md:h-[8px] rounded-full"
                style={{
                  background: "var(--brand)",
                  width: showUnderline ? "100%" : "0%",
                  transition: "width 0.8s cubic-bezier(0.22, 1, 0.36, 1)",
                }}
              />
            </span>
          </motion.h1>
          <motion.p
            variants={fadeInUp}
            custom={2}
            className="text-lg md:text-xl max-w-3xl font-display mx-auto leading-relaxed mb-12 font-medium"
            style={{ color: "var(--text-secondary)", fontWeight: 500 }}
          >
            AI-powered audit of corporate sustainability claims. Every claim
            extracted, every source cross-referenced, every verdict cited.
          </motion.p>

          {/* CTA Badges */}
          <motion.div
            variants={fadeInUp}
            custom={3}
            className="flex items-center justify-center gap-4 flex-wrap"
          >
            {[
              { icon: <Zap size={16} />, text: "Quick analysis" },
              { icon: <Eye size={16} />, text: "Real evidence" },
              { icon: <Shield size={16} />, text: "Unbiased scoring" },
            ].map((badge, i) => (
              <span
                key={i}
                className="flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold shadow-sm bg-white/60 backdrop-blur-md border border-white/50"
                style={{ color: "var(--text-primary)" }}
              >
                <span style={{ color: "var(--brand-dark)" }}>{badge.icon}</span>
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
          className="max-w-3xl mx-auto mb-20"
        >
          <div
            {...getRootProps()}
            className={`upload-zone relative overflow-hidden cursor-pointer p-14 text-center transition-all bg-white/60 backdrop-blur-xl border-2 hover:border-[#1E4D3B] hover:shadow-2xl rounded-3xl ${isDragActive ? "border-[#1E4D3B] bg-[#E8F3EE] shadow-lg scale-[1.02]" : "border-white shadow-md"
              } ${uploading ? "opacity-70 pointer-events-none scale-[0.98]" : ""}`}
          >
            <input {...getInputProps()} />
            <div className="relative z-10 flex flex-col items-center gap-5">
              {uploading ? (
                <>
                  <motion.div
                    animate={{ scale: [1, 1.1, 1], rotate: [0, 5, -5, 0] }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-inner"
                    style={{ background: "var(--brand-subtle)" }}
                  >
                    <FileText
                      size={32}
                      style={{ color: "var(--brand-dark)" }}
                    />
                  </motion.div>
                  <div>
                    <p
                      className="text-xl font-bold tracking-tight mb-1"
                      style={{ color: "var(--text-primary)" }}
                    >
                      Analyzing Report...
                    </p>
                    <p className="text-sm font-medium" style={{ color: "var(--text-muted)" }}>This usually takes under 60 seconds.</p>
                  </div>
                </>
              ) : (
                <>
                  <motion.div
                    whileHover={{ scale: 1.1, rotate: 5 }}
                    className="w-16 h-16 rounded-2xl flex items-center justify-center shadow-sm"
                    style={{ background: "var(--brand-subtle)" }}
                  >
                    <Upload
                      size={32}
                      style={{ color: "var(--brand-dark)" }}
                    />
                  </motion.div>
                  <div>
                    <p
                      className="text-2xl font-bold tracking-tight mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {isDragActive
                        ? "Drop your PDF here to begin"
                        : "Upload a sustainability report"}
                    </p>
                    <p
                      className="text-base font-medium"
                      style={{ color: "var(--text-muted)" }}
                    >
                      Drag & drop any ESG or CSR PDF up to 50MB
                    </p>
                  </div>
                </>
              )}
            </div>
          </div>

          {error && (
            <motion.div
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 p-4 rounded-xl flex items-center justify-center gap-2 bg-red-50 text-red-700 border border-red-100 shadow-sm"
            >
              <AlertTriangle size={18} />
              <p className="text-sm font-semibold">{error}</p>
            </motion.div>
          )}

          <div className="text-center mt-10">
            <Button
              onClick={() => router.push("/report/08362af7-1cf1-4355-aa28-151a2b294e23")}
              size="lg"
              className="font-bold text-base gap-2 px-8 h-12 shadow-lg hover:shadow-xl transition-all hover:-translate-y-0.5 rounded-full"
              style={{ background: "var(--text-primary)", color: "white" }}
            >
              View Example Analysis
              <ChevronRight size={18} />
            </Button>
          </div>
        </motion.div>

        {/* How It Works & Preview Layout */}
        <div id="how-it-works" className="grid lg:grid-cols-2 gap-16 lg:gap-24 items-center mt-40 mb-20">
          {/* Left Side: How it works text */}
          <motion.div
            initial="hidden"
            whileInView="visible"
            viewport={{ once: true, margin: "-100px" }}
            variants={staggerContainer}
            className="space-y-12"
          >
            <div>
              <motion.h2
                variants={fadeInUp}
                className="font-display text-4xl md:text-5xl font-black mb-6 tracking-tight leading-[1.1]"
                style={{ color: "var(--text-primary)" }}
              >
                Trust, but <br/><span style={{ color: "var(--brand-dark)" }}>verify.</span>
              </motion.h2>
              <motion.p
                variants={fadeInUp}
                className="text-lg leading-relaxed font-medium"
                style={{ color: "var(--text-secondary)" }}
              >
                GreenWash reads between the lines of massive environmental reports so you don't have to. We turn marketing fluff into hard facts.
              </motion.p>
            </div>

            <div className="space-y-8">
              {[
                {
                  icon: <Search size={24} />,
                  title: "1. Extract Claims",
                  desc: "Our AI model identifies targeted sustainability claims — emissions, pledges, and raw data across labor and environment.",
                },
                {
                  icon: <Shield size={24} />,
                  title: "2. Cross-Reference",
                  desc: "Every claim is actively fact-checked against government databases, independent registries, and real-time news sources.",
                },
                {
                  icon: <BarChart3 size={24} />,
                  title: "3. Grade & Analyze",
                  desc: "We assign a rigorous credibility score based on the strength of the evidence, highlighting contradictions and supported facts.",
                },
              ].map((step, i) => (
                <motion.div
                  key={i}
                  variants={fadeInUp}
                  className="flex gap-6"
                >
                  <div
                    className="w-14 h-14 shrink-0 rounded-2xl flex items-center justify-center shadow-md border border-black/5"
                    style={{ background: "white", color: "var(--brand-dark)" }}
                  >
                    {step.icon}
                  </div>
                  <div className="pt-1">
                    <h3
                      className="font-display font-extrabold text-xl mb-2"
                      style={{ color: "var(--text-primary)" }}
                    >
                      {step.title}
                    </h3>
                    <p className="text-base leading-relaxed" style={{ color: "var(--text-secondary)" }}>
                      {step.desc}
                    </p>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>

          {/* Right Side: Premium Preview Card */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, x: 20 }}
            whileInView={{ opacity: 1, scale: 1, x: 0 }}
            viewport={{ once: true, margin: "-50px" }}
            transition={{ duration: 0.8, type: "spring", bounce: 0.4 }}
            className="relative lg:h-full lg:flex lg:items-center"
          >
            <div className="absolute inset-x-0 inset-y-10 bg-gradient-to-tr from-[#A5D6A7]/40 to-transparent blur-[80px] rounded-[3rem] -z-10" />
            
            <div
              className="rounded-3xl overflow-hidden bg-white/80 backdrop-blur-2xl shadow-2xl border border-white"
            >
              <div
                className="px-8 py-6 flex items-center justify-between bg-white/60 backdrop-blur-xl"
                style={{ borderBottom: "1px solid var(--gw-border)" }}
              >
                <div>
                  <p
                    className="font-display font-extrabold text-xl mb-1"
                    style={{ color: "var(--text-primary)" }}
                  >
                    PetroGreen Energy Corp
                  </p>
                  <p
                    className="text-xs font-mono-gw uppercase tracking-widest font-bold"
                    style={{ color: "var(--text-muted)" }}
                  >
                    2024 ESG Report
                  </p>
                </div>
                <div
                  className="flex flex-col items-end"
                >
                  <span className="text-xs font-bold text-(--text-muted) mb-1 uppercase tracking-wider">Overall Score</span>
                  <span className="text-2xl font-black text-[#8b0000]">34%</span>
                </div>
              </div>
              
              <div className="px-8 py-6 space-y-4">
                <p className="text-xs font-bold uppercase tracking-widest text-(--text-muted) mb-6">Key Claims Found</p>
                {[
                  {
                    text: "Reduced Scope 1 emissions by 30% since 2019",
                    verdict: "contradicted",
                    score: 22,
                    icon: <XCircle size={16} />,
                    color: "var(--score-false)",
                    bg: "var(--score-false-bg)",
                  },
                  {
                    text: "Invested $500 million in carbon capture tech",
                    verdict: "supported",
                    score: 84,
                    icon: <CheckCircle2 size={16} />,
                    color: "var(--score-true)",
                    bg: "var(--score-true-bg)",
                  },
                  {
                    text: "Achieved zero fatalities across all operations",
                    verdict: "contradicted",
                    score: 15,
                    icon: <XCircle size={16} />,
                    color: "var(--score-false)",
                    bg: "var(--score-false-bg)",
                  },
                  {
                    text: "Top-tier supply chain audits for compliance",
                    verdict: "unverified",
                    score: null,
                    icon: <AlertTriangle size={16} />,
                    color: "var(--score-unknown)",
                    bg: "var(--score-unknown-bg)",
                  },
                ].map((claim, i) => (
                  <div
                    key={i}
                    className="flex flex-col gap-3 py-4 px-5 rounded-2xl transition-colors bg-white/50 border border-black/5 shadow-sm hover:bg-white hover:shadow-md"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <p
                        className="text-sm font-semibold leading-snug flex-1"
                        style={{ color: "var(--text-primary)" }}
                      >
                        "{claim.text}"
                      </p>
                      <span
                        className="flex items-center gap-1.5 text-[10px] font-black uppercase tracking-wider px-2.5 py-1.5 rounded-md whitespace-nowrap shadow-sm"
                        style={{
                          background: claim.bg,
                          color: claim.color,
                        }}
                      >
                        {claim.icon}
                        {claim.verdict === "contradicted"
                          ? `FALSE`
                          : claim.verdict === "supported"
                            ? `TRUE`
                            : "UNVERIFIED"}
                      </span>
                    </div>
                    <div className="h-1.5 w-full bg-black/5 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        whileInView={{ width: claim.score !== null ? `${claim.score}%` : "0%" }}
                        viewport={{ once: true }}
                        transition={{ duration: 1.2, delay: i * 0.15 + 0.4, ease: "easeOut" }}
                        className="h-full rounded-full bg-gradient-to-r"
                        style={{
                          background: claim.color,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>

        {/* FAQ Section */}
        <motion.section
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.8 }}
          className="max-w-4xl mx-auto mt-40 mb-32"
        >
          <div className="text-center mb-16">
            <h2 className="font-display text-4xl md:text-5xl font-black mb-6 tracking-tight" style={{ color: "var(--text-primary)" }}>
              Common <span style={{ color: "var(--brand-dark)" }}>Questions</span>
            </h2>
            <p className="text-lg font-medium" style={{ color: "var(--text-secondary)" }}>
              Everything you need to know about our sustainability audit process.
            </p>
          </div>

          <div className="space-y-4">
            {[
              {
                q: "How does GreenWash verify environmental claims?",
                a: "We use a multi-step verification process. First, we extract specific, measurable claims from your report. Then, our autonomous agents cross-reference these claims against over 100,000 public data sources, including government registries (like the EPA or NPRI), independent ESG databases, and real-time news archives."
              },
              {
                q: "What kind of reports can I upload?",
                a: "You can upload any PDF version of a Sustainability Report, ESG Report, CSR (Corporate Social Responsibility) Report, or Annual Report. Our system is optimized for reports that contain quantitative environmental and social performance data."
              },
              {
                q: "How is the credibility score calculated?",
                a: "The score is a mathematical average of confidence values assigned to individual claims. Each claim is graded based on the strength of supporting or contradicting evidence found. Claims with no verifiable data are excluded from the average to ensure the score accurately reflects only what can be proven."
              },
              {
                q: "Is my uploaded data secure?",
                a: "Yes. We prioritize data privacy. Uploaded reports are processed in a secure environment and are only used for the duration of the analysis. We do not sell your corporate data or use it to train public models without explicit permission."
              }
            ].map((faq, i) => (
              <FAQItem key={i} question={faq.q} answer={faq.a} />
            ))}
          </div>
        </motion.section>
      </main>

      {/* Footer */}
      <footer
        className="relative z-10 py-10 px-8 text-center text-sm font-semibold bg-white/40 backdrop-blur-xl"
        style={{
          color: "var(--text-muted)",
          borderTop: "1px solid var(--gw-border)",
        }}
      >
        GreenWash © 2026
      </footer>
    </div>
  );
}
