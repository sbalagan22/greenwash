"use client";

import React, { useEffect } from "react";
import { Worker, Viewer } from "@react-pdf-viewer/core";
import * as pdfjs from "pdfjs-dist";

// Use CDN worker to avoid bundling issues
const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.js`;

interface PDFViewerProps {
    fileUrl: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ fileUrl }) => {
    useEffect(() => {
        // Set worker source for pdfjs-dist
        pdfjs.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjs.version}/pdf.worker.min.js`;
    }, []);

    return (
        <div className="h-full w-full">
            <Worker workerUrl={workerUrl}>
                <Viewer fileUrl={fileUrl} />
            </Worker>
        </div>
    );
};

export default PDFViewer;
