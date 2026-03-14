import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  reactCompiler: true,
  serverExternalPackages: ["pdf-parse"],
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
  experimental: {
    // @ts-ignore - 'turbo' is not yet in the stable NextConfig type for this version
    turbo: {
      resolveAlias: {
        canvas: "./empty-module.js",
      },
    },
  },
};

export default nextConfig;
