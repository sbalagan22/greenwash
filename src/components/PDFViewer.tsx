"use client";

import React from "react";
import { Worker, Viewer } from "@react-pdf-viewer/core";

// Import styles directly in the client component
import '@react-pdf-viewer/core/lib/styles/index.css';
import '@react-pdf-viewer/default-layout/lib/styles/index.css';

// Use a consistent worker version matching package.json for reliability
const pdfjsVersion = "3.11.174";
const workerUrl = `https://unpkg.com/pdfjs-dist@${pdfjsVersion}/build/pdf.worker.min.js`;

interface PDFViewerProps {
    fileUrl: string;
}

const PDFViewer: React.FC<PDFViewerProps> = ({ fileUrl }) => {
    return (
        <div className="h-full w-full bg-[#f4f4f4]">
            <Worker workerUrl={workerUrl}>
                <div className="h-full w-full">
                    <Viewer 
                        fileUrl={fileUrl}
                        defaultScale={1.2}
                    />
                </div>
            </Worker>
        </div>
    );
};

export default PDFViewer;
