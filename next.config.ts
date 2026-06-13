import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The analyzer is entirely client-side; no special server config needed.
  reactStrictMode: true,
  // Clerk's middleware relies on Node.js APIs that aren't available in the
  // Edge runtime middleware uses by default.
  experimental: {
    // @ts-expect-error -- not yet in the published NextConfig types, but
    // recognised at build time (enables the Node.js middleware runtime).
    nodeMiddleware: true,
  },
};

export default nextConfig;
