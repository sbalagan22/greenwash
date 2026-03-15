import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse", "pdfjs-dist"],
  webpack: (config) => {
    // Tell Webpack to ignore canvas — only needed for pdfjs visual rendering in Node
    // which we don't use (we use it browser-side only)
    config.resolve.alias = {
      ...config.resolve.alias,
      canvas: false,
    };
    return config;
  },
  // @ts-ignore - Silence Next.js 16 Turbopack warning
  turbopack: {},
};

export default nextConfig;
