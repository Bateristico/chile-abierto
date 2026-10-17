import type { NextConfig } from "next";

/**
 * Static export for GitHub Pages. The site is a snapshot: data is ingested, verified and baked in at build time.
 * NEXT_BASE_PATH is "/chile-abierto" on Pages (project site) and empty locally.
 */
const basePath = process.env.NEXT_BASE_PATH ?? "";

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  trailingSlash: true,
  images: { unoptimized: true },
  reactStrictMode: true,
  env: { NEXT_PUBLIC_BASE_PATH: basePath },
};

export default nextConfig;
