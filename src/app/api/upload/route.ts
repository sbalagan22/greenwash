import { NextRequest, NextResponse } from "next/server";
import { getServiceSupabase } from "@/lib/supabase";

export const maxDuration = 60;

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();
        const file = formData.get("file") as File | null;

        if (!file) {
            return NextResponse.json({ error: "No file provided" }, { status: 400 });
        }

        if (file.type !== "application/pdf") {
            return NextResponse.json(
                { error: "Only PDF files are accepted" },
                { status: 400 }
            );
        }

        const maxSize = 50 * 1024 * 1024; // 50MB
        if (file.size > maxSize) {
            return NextResponse.json(
                { error: "File size exceeds 50MB limit" },
                { status: 400 }
            );
        }

        const supabase = getServiceSupabase();
        console.log("[Upload] Service role key present:", !!process.env.SUPABASE_SERVICE_ROLE_KEY);

        // Upload PDF to Supabase Storage
        const fileName = `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;

        console.log("[Upload] Uploading file:", fileName, "size:", file.size);

        const { data: uploadData, error: uploadError } = await supabase.storage
            .from("pdfs")
            .upload(fileName, file, {
                contentType: file.type || "application/pdf",
                upsert: false,
                duplex: "half",
            });

        if (uploadError) {
            console.error("[Upload] Storage upload error:", JSON.stringify(uploadError, null, 2));
            return NextResponse.json(
                { error: `Failed to upload file: ${uploadError.message}` },
                { status: 500 }
            );
        }
        console.log("[Upload] Storage upload success:", uploadData);

        // Get public URL
        const {
            data: { publicUrl },
        } = supabase.storage.from("pdfs").getPublicUrl(fileName);

        // Extract company name from filename (basic heuristic)
        const companyName = file.name
            .replace(/\.pdf$/i, "")
            .replace(/[-_]/g, " ")
            .replace(/\b(esg|sustainability|report|annual|csr)\b/gi, "")
            .trim() || "Unknown Company";

        // Create report row
        const { data: report, error: reportError } = await supabase
            .from("reports")
            .insert({
                company_name: companyName,
                pdf_url: publicUrl,
                status: "processing",
            })
            .select("id")
            .single();

        if (reportError || !report) {
            console.error("Report creation error:", reportError);
            return NextResponse.json(
                { error: "Failed to create report" },
                { status: 500 }
            );
        }

        // Create job row
        const { data: job, error: jobError } = await supabase
            .from("jobs")
            .insert({
                report_id: report.id,
                step: "queued",
                progress: 0,
            })
            .select("id")
            .single();

        if (jobError || !job) {
            console.error("Job creation error:", jobError);
            return NextResponse.json(
                { error: "Failed to create job" },
                { status: 500 }
            );
        }

        // Trigger the pipeline asynchronously (fire-and-forget)
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
        fetch(`${baseUrl}/api/pipeline/run`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                reportId: report.id,
                jobId: job.id,
                pdfUrl: publicUrl,
            }),
        }).catch((err) => console.error("Pipeline trigger error:", err));

        return NextResponse.json({
            reportId: report.id,
            jobId: job.id,
        });
    } catch (err) {
        console.error("Upload error:", err);
        return NextResponse.json(
            { error: err instanceof Error ? err.message : "Internal server error" },
            { status: 500 }
        );
    }
}
