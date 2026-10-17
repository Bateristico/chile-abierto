import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Data files are read at request/build time from ./data; make sure they ship with the server bundle.
  outputFileTracingIncludes: {
    "/**": ["./data/seed/**/*", "./data/store/**/*", "./data/demo/**/*"],
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        ],
      },
    ];
  },
};

export default nextConfig;
