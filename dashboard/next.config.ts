import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Static export for Cloudflare Pages deployment
  output: "export",
  // Disable image optimisation (not supported in static export)
  images: { unoptimized: true },
};

export default nextConfig;
